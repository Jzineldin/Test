"""End-to-end happy-path integration test.

Walks the full broker workflow against the running app:
  1. Auth check (/me)
  2. Triage a submission (/triage)
  3. List history (/history)
  4. Fetch full detail (/history/{id})
  5. Send a drafted email (/drafts/{id}/send) — stub email client
  6. Inbound webhook records the carrier's reply (/webhooks/inbound)
  7. Dashboard re-fetches draft → reply is visible

If this test breaks, a real broker would notice within minutes of using
the product. Keep it green.
"""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


REPO = Path(__file__).resolve().parents[2]
SAMPLE = REPO / "data" / "submissions" / "acme_plumbing.json"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'e2e.db'}")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SES_FROM_ADDRESS", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.email.client as email_client_mod
    import app.email as email_pkg
    import app.billing.client as billing_client_mod
    import app.billing as billing_pkg
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        email_client_mod, email_pkg,
        billing_client_mod, billing_pkg,
        main_mod,
    ):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def test_full_broker_workflow(client):
    # 1. Auth
    me = client.get("/me", headers=HEADERS).json()
    assert me["slug"] == "demo"

    # 2. Triage
    submission = SAMPLE.read_text()
    triaged = client.post(
        "/triage", content=submission,
        headers={**HEADERS, "Content-Type": "application/json"},
    ).json()
    assert triaged["matches"], "expected at least one appetite match"
    assert triaged["drafted_emails"], "expected at least one drafted email"

    # 3. History list
    history = client.get("/history", headers=HEADERS).json()
    assert len(history) == 1
    run_id = history[0]["id"]

    # 4. Detail
    detail = client.get(f"/history/{run_id}", headers=HEADERS).json()
    assert detail["insured_name"] == "Acme Plumbing Services LLC"
    assert detail["match_count"] == len(triaged["matches"])

    # 5. Send a draft
    draft_id = triaged["drafted_emails"][0]["id"]
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    assert sent["sent_at"] is not None
    provider_id = sent["provider_message_id"]

    # 6. Carrier replies via inbound webhook (HMAC-signed)
    from tests.conftest import signed_post
    reply = signed_post(client, "/webhooks/inbound", {
        "provider_message_id": provider_id,
        "body": "Quoting at $42,500 effective 2026-06-01. Bind pending broker confirmation.",
    }).json()
    assert reply is not None
    assert "$42,500" in reply["quote_reply_body"]

    # 7. Dashboard refetches the draft and sees the reply
    refreshed = client.get(f"/drafts/{draft_id}", headers=HEADERS).json()
    assert refreshed["quote_replied_at"] is not None
    # SQLite drops the tz suffix on round-trip; just confirm sent_at survives.
    assert refreshed["sent_at"] is not None
    assert refreshed["sent_at"][:19] == sent["sent_at"][:19]  # match to the second

    # 8. Usage incremented
    usage = client.get("/billing/usage", headers=HEADERS).json()
    assert usage["submissions_this_period"] == 1
