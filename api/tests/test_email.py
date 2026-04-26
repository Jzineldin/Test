"""Email send + reply webhook tests.

We never call AWS — StubEmailClient + the in-memory SQLite cover everything.
"""
from __future__ import annotations

import importlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = tmp_path / "email_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.delenv("SES_FROM_ADDRESS", raising=False)

    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.email.client as email_client_mod
    import app.email as email_pkg
    import app.main as main_mod

    importlib.reload(session_mod)
    importlib.reload(repo_mod)
    importlib.reload(orgs_mod)
    importlib.reload(db_pkg)
    importlib.reload(auth_mod)
    importlib.reload(email_client_mod)
    importlib.reload(email_pkg)
    importlib.reload(main_mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def _seed_triage(client) -> int:
    """Run a triage so we have a draft to send. Returns the draft id."""
    sample = {
        "submission_id": "SUB-EMAIL-1",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co",
            "naics": "238220",
            "business_description": "Plumbing",
            "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }
    r = client.post("/triage", json=sample, headers=HEADERS)
    assert r.status_code == 200, r.text
    history = client.get("/history", headers=HEADERS).json()
    detail = client.get(f"/history/{history[0]['id']}", headers=HEADERS).json()
    # The detail.result.drafted_emails are the response shape; we need
    # the underlying draft row id, which the API doesn't echo today —
    # so query by listing the org's run and looking up via /drafts.
    # For the test, fetch the run and inspect drafts via repository.
    import app.db as db_pkg

    with db_pkg.session_scope() as session:
        run = db_pkg.get_triage_run(session, history[0]["id"], org_id=1)
        return run.drafts[0].id


def test_send_marks_draft_sent_and_records_provider_id(client):
    draft_id = _seed_triage(client)
    r = client.post(f"/drafts/{draft_id}/send", headers=HEADERS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent_at"] is not None
    assert body["provider_message_id"].startswith("stub-")


def test_send_attaches_uploaded_pdf_when_run_has_one(client):
    """When a TriageRun was created from /triage/upload, its submission_pdf
    should ride along on the outbound carrier email."""
    import app.db as db_pkg
    from app.db.models import TriageRun

    draft_id = _seed_triage(client)
    # Stash a PDF blob on the run so the send path picks it up.
    pdf_bytes = b"%PDF-1.4\n%stub\n"
    with db_pkg.session_scope() as session:
        run = (
            session.query(TriageRun)
            .filter_by(org_id=1)
            .order_by(TriageRun.id.desc())
            .first()
        )
        run.submission_pdf = pdf_bytes
        run.submission_pdf_filename = "acme_acord_125.pdf"

    r = client.post(f"/drafts/{draft_id}/send", headers=HEADERS)
    assert r.status_code == 200, r.text

    from app.email import get_client
    last = get_client().outbox[-1]
    assert last.attachment_count == 1


def test_send_unknown_draft_returns_404(client):
    r = client.post("/drafts/99999/send", headers=HEADERS)
    assert r.status_code == 404


def test_send_requires_auth(client):
    draft_id = _seed_triage(client)
    r = client.post(f"/drafts/{draft_id}/send")
    assert r.status_code == 401


def test_inbound_webhook_matches_to_sent_draft(client):
    draft_id = _seed_triage(client)
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    from tests.conftest import signed_post
    reply = signed_post(client, "/webhooks/inbound", {
        "provider_message_id": sent["provider_message_id"],
        "body": "Quoting at $42,000. Effective 2026-06-01.",
    })
    assert reply.status_code == 200
    body = reply.json()
    assert body is not None
    assert body["quote_replied_at"] is not None
    assert "42,000" in body["quote_reply_body"]


def test_inbound_webhook_unknown_id_returns_null(client):
    # Unknown id matches no draft, so signature is never checked.
    r = client.post("/webhooks/inbound", json={
        "provider_message_id": "never-sent-this",
        "body": "spam",
    })
    assert r.status_code == 200
    assert r.json() is None


def test_inbound_bad_signature_returns_401(client):
    """Matched draft + invalid signature -> 401, no side effects."""
    draft_id = _seed_triage(client)
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    r = client.post("/webhooks/inbound", json={
        "provider_message_id": sent["provider_message_id"],
        "body": "should not be recorded",
    })
    # Default JSON post has no signature header -> 401
    assert r.status_code == 401
    # And the draft should still be in 'sent but not replied' state.
    state = client.get(f"/drafts/{draft_id}", headers=HEADERS).json()
    assert state["sent_at"] is not None
    assert state["quote_replied_at"] is None


def test_get_draft_status_round_trips(client):
    draft_id = _seed_triage(client)
    r = client.get(f"/drafts/{draft_id}", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["sent_at"] is None
