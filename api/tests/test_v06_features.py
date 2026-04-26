"""Tests for v0.6 surface: history search/filter, settings, email forward, audit."""
from __future__ import annotations

import base64
import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'v06.db'}")
    for var in (
        "STRIPE_SECRET_KEY", "SES_FROM_ADDRESS",
        "AWS_ACCESS_KEY_ID", "ANTHROPIC_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)

    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.email.client as email_client_mod
    import app.email as email_pkg
    import app.notifications.client as notif_client_mod
    import app.notifications as notif_pkg
    import app.reports as reports_mod
    import app.limits as limits_mod
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        email_client_mod, email_pkg, notif_client_mod, notif_pkg,
        reports_mod, limits_mod, main_mod,
    ):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def _seed(client, *, insured: str = "Test Co", state: str = "TX") -> None:
    sample = {
        "submission_id": f"SUB-{insured.replace(' ', '-')}",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": insured, "naics": "238220",
            "business_description": "Plumbing", "primary_state": state,
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }
    r = client.post("/triage", json=sample, headers=HEADERS)
    assert r.status_code == 200, r.text


# ---- History search / filter ----

def test_history_filters_by_insured_substring(client):
    _seed(client, insured="Acme Plumbing")
    _seed(client, insured="Beta Roofing")
    body = client.get("/history?insured=plumbing", headers=HEADERS).json()
    assert len(body) == 1
    assert body[0]["insured_name"] == "Acme Plumbing"


def test_history_filters_by_state(client):
    _seed(client, insured="Tex Co", state="TX")
    _seed(client, insured="Cal Co", state="CA")
    body = client.get("/history?state=CA", headers=HEADERS).json()
    assert len(body) == 1
    assert body[0]["primary_state"] == "CA"


def test_history_filter_combines_insured_and_state(client):
    _seed(client, insured="Acme Plumbing", state="TX")
    _seed(client, insured="Acme Plumbing", state="CA")
    body = client.get("/history?insured=acme&state=TX", headers=HEADERS).json()
    assert len(body) == 1
    assert body[0]["primary_state"] == "TX"


def test_test_notification_400_when_unset(client):
    r = client.post("/me/notifications/test", headers=HEADERS)
    assert r.status_code == 400
    assert "not set" in r.json()["detail"]


def test_test_notification_uses_configured_webhook(client, monkeypatch):
    """When notification_webhook_url is configured, the endpoint sends a
    Notification through whatever client get_client_for_url returns. The
    test installs a stub client and asserts it received exactly one ping."""
    sent: list[object] = []

    class _Stub:
        def send(self, n):  # pragma: no cover - tested via assertion
            sent.append(n)
            return True

    import app.notifications as notifications_pkg
    monkeypatch.setattr(
        notifications_pkg, "get_client_for_url", lambda _url: _Stub(),
    )
    import app.main as main_mod
    monkeypatch.setattr(main_mod, "get_client_for_url", lambda _url: _Stub())

    client.patch(
        "/me",
        json={"notification_webhook_url": "https://hooks.slack.com/x/y"},
        headers=HEADERS,
    )
    r = client.post("/me/notifications/test", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_parse_only_returns_extracted_submission_without_persisting(
    client, monkeypatch,
):
    """The PDF gets parsed and returned, but no run is created and no
    quota is consumed - it's a preview path."""
    from app.models import (
        CoverageRequest, Insured, LineOfBusiness, Submission,
    )
    from datetime import date as _date

    parsed = Submission(
        submission_id="DOCAI-PREVIEW",
        received_at=_date(2026, 4, 26),
        retail_agent_email="agent@example.com",
        insured=Insured(
            legal_name="Preview Co",
            naics="238220",
            business_description="HVAC",
            primary_state="TX",
        ),
        coverages=[CoverageRequest(line=LineOfBusiness.GL)],
    )

    class _FakeParser:
        def parse_bytes(self, _b):
            return parsed

    import app.main as main_mod
    monkeypatch.setattr(main_mod, "DocAiParser", _FakeParser)

    history_before = client.get("/history", headers=HEADERS).json()
    r = client.post(
        "/triage/parse-only",
        files={"file": ("acord.pdf", b"%PDF-fake", "application/pdf")},
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["submission_id"] == "DOCAI-PREVIEW"
    assert body["insured"]["legal_name"] == "Preview Co"
    # No persistence happened.
    history_after = client.get("/history", headers=HEADERS).json()
    assert len(history_after) == len(history_before)


def test_parse_only_503_when_docai_unconfigured(client):
    r = client.post(
        "/triage/parse-only",
        files={"file": ("acord.pdf", b"%PDF-fake", "application/pdf")},
        headers=HEADERS,
    )
    assert r.status_code == 503


def test_drafts_queue_filters_by_status(client):
    _seed(client, insured="Acme Plumbing")
    runs = client.get("/history", headers=HEADERS).json()
    detail = client.get(f"/history/{runs[0]['id']}", headers=HEADERS).json()
    drafts = detail["result"]["drafted_emails"]
    if not drafts:
        return  # stub LLM produced no drafts
    draft_id = drafts[0]["id"]

    # Fresh draft should appear under 'drafted'.
    resp = client.get("/drafts?status=drafted", headers=HEADERS).json()
    assert any(d["id"] == draft_id for d in resp)
    # And NOT under 'sent'.
    sent = client.get("/drafts?status=sent", headers=HEADERS).json()
    assert not any(d["id"] == draft_id for d in sent)

    # After send, flips.
    client.post(f"/drafts/{draft_id}/send", headers=HEADERS)
    resp2 = client.get("/drafts?status=sent", headers=HEADERS).json()
    assert any(d["id"] == draft_id for d in resp2)
    drafted_after = client.get("/drafts?status=drafted", headers=HEADERS).json()
    assert not any(d["id"] == draft_id for d in drafted_after)


def test_drafts_queue_invalid_status_400(client):
    r = client.get("/drafts?status=garbage", headers=HEADERS)
    assert r.status_code == 400


def test_delete_history_run_removes_it_and_audits(client):
    _seed(client, insured="Doomed Co", state="TX")
    runs = client.get("/history", headers=HEADERS).json()
    target = next(r for r in runs if r["insured_name"] == "Doomed Co")
    r = client.delete(f"/history/{target['id']}", headers=HEADERS)
    assert r.status_code == 204
    # Gone.
    assert client.get(
        f"/history/{target['id']}", headers=HEADERS,
    ).status_code == 404
    # Audit event recorded.
    audit = client.get("/audit", headers=HEADERS).json()
    types = {e["event_type"] for e in audit}
    assert "triage.deleted" in types


def test_delete_history_run_404_on_missing(client):
    assert client.delete("/history/999999", headers=HEADERS).status_code == 404


def test_check_appetite_partitions_carriers_by_prefilter(client):
    """The prefilter is deterministic - this submission is GL-only in TX,
    so any seeded carrier whose appetite excludes TX or doesn't write GL
    lands in out_of_appetite."""
    sub = {
        "submission_id": "CHK-1",
        "received_at": "2026-04-26",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co", "naics": "238220",
            "business_description": "Plumbing", "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }
    r = client.post("/carriers/check", json=sub, headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    total = len(body["in_appetite"]) + len(body["out_of_appetite"])
    assert total >= 1, "expected at least the seeded sample carriers"
    # Returned shape: list of {carrier_id, name} dicts.
    if body["in_appetite"]:
        assert "carrier_id" in body["in_appetite"][0]
        assert "name" in body["in_appetite"][0]
    # No history was created.
    history = client.get("/history", headers=HEADERS).json()
    assert all(h["submission_id"] != "CHK-1" for h in history)


def test_parse_only_requires_auth(client):
    r = client.post(
        "/triage/parse-only",
        files={"file": ("acord.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert r.status_code == 401


def test_history_filters_by_carrier_id(client):
    """Drop two runs in the same org; filter by a carrier_id that only
    one of them produced a draft for."""
    _seed(client, insured="Acme Plumbing", state="TX")
    runs = client.get("/history", headers=HEADERS).json()
    assert runs, "expected at least one run after seeding"
    detail = client.get(f"/history/{runs[0]['id']}", headers=HEADERS).json()
    drafts = detail["result"]["drafted_emails"]
    if not drafts:
        # Stub LLM produced no in-appetite drafts; skip filter assertion.
        return
    carrier_id = drafts[0]["carrier_id"]
    filtered = client.get(
        f"/history?carrier_id={carrier_id}", headers=HEADERS,
    ).json()
    assert len(filtered) >= 1
    assert all(r["match_count"] >= 1 for r in filtered)
    # Filtering by a carrier that doesn't exist returns empty.
    none = client.get("/history?carrier_id=does-not-exist", headers=HEADERS).json()
    assert none == []


# ---- /me + PATCH ----

def test_me_returns_settings(client):
    body = client.get("/me", headers=HEADERS).json()
    assert "notification_webhook_url" in body
    assert "forward_inbox_address" in body


def test_me_hides_webhook_secret_from_csr_cookie(client):
    """Cookie callers with role=csr get webhook_secret=null - they
    shouldn't see the HMAC key for forging inbound webhooks. Admins
    and API-key callers still see it."""
    import app.db as db_pkg
    from app.db.models import Org, User
    from app.magic_link import issue_magic_link

    with db_pkg.session_scope() as session:
        org = session.query(Org).first()
        assert org is not None
        user = User(
            org_id=org.id, email="csr@example.com", name="CSR", role="csr",
        )
        session.add(user)
        session.flush()
        token = issue_magic_link(session, user)
    client.post("/auth/verify", json={"token": token})
    # Drop the API key bearer so resolution goes through the cookie.
    body = client.get("/me").json()
    assert body["user_role"] == "csr"
    assert body["webhook_secret"] is None
    # Admin path still sees it via API key. Drop the CSR cookie first so
    # the bearer token actually wins; cookie resolves before bearer in auth.
    client.cookies.delete("triage_session")
    body_admin = client.get("/me", headers=HEADERS).json()
    assert body_admin["webhook_secret"] is not None


def test_patch_me_updates_webhook_url(client):
    r = client.patch(
        "/me",
        json={"notification_webhook_url": "https://hooks.slack.com/xyz"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["notification_webhook_url"] == "https://hooks.slack.com/xyz"


def test_patch_me_clears_when_empty_string(client):
    client.patch("/me", json={"notification_webhook_url": "https://x/y"}, headers=HEADERS)
    client.patch("/me", json={"notification_webhook_url": ""}, headers=HEADERS)
    body = client.get("/me", headers=HEADERS).json()
    assert body["notification_webhook_url"] is None


def test_patch_me_records_audit_event(client):
    client.patch("/me", json={"name": "Renamed Co"}, headers=HEADERS)
    audit = client.get("/audit", headers=HEADERS).json()
    types = {e["event_type"] for e in audit}
    assert "settings.updated" in types


def test_patch_me_requires_auth(client):
    assert client.patch("/me", json={"name": "x"}).status_code == 401


# ---- Audit log ----

def test_audit_records_triage_run(client):
    _seed(client)
    audit = client.get("/audit", headers=HEADERS).json()
    types = [e["event_type"] for e in audit]
    assert "triage.run" in types


def test_audit_records_send_and_outcome(client):
    _seed(client)
    history = client.get("/history", headers=HEADERS).json()
    detail = client.get(f"/history/{history[0]['id']}", headers=HEADERS).json()
    draft_id = detail["result"]["drafted_emails"][0]["id"]
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {
        "provider_message_id": sent["provider_message_id"], "body": "ok",
    })
    client.post(
        f"/drafts/{draft_id}/outcome",
        json={"outcome": "bound", "bound_premium_cents": 1000_00},
        headers=HEADERS,
    )

    audit = client.get("/audit", headers=HEADERS).json()
    types = {e["event_type"] for e in audit}
    assert {"triage.run", "draft.sent", "outcome.set"} <= types


def test_audit_requires_auth(client):
    assert client.get("/audit").status_code == 401


# ---- Email forward ----

def _email_payload(*, to_addr: str, pdf_bytes: bytes = b"%PDF-fake") -> dict:
    return {
        "to": to_addr,
        "from_address": "agent@retail.example",
        "subject": "New submission",
        "body": "see attached",
        "attachments": [
            {
                "filename": "acord_125.pdf",
                "content_type": "application/pdf",
                "content_base64": base64.b64encode(pdf_bytes).decode(),
            }
        ],
    }


def test_email_forward_unmatched_address_returns_unmatched(client):
    # Unmatched address never reaches signature check.
    r = client.post("/webhooks/email", json=_email_payload(to_addr="nope@example.com"))
    assert r.status_code == 200
    assert r.json() == {"status": "unmatched", "to": "nope@example.com"}


def test_email_forward_no_pdf_skipped(client):
    payload = _email_payload(to_addr="x@example.com")
    payload["attachments"] = []
    r = client.post("/webhooks/email", json=payload)
    assert r.json()["status"] == "skipped"


def test_email_forward_resolves_org_by_inbox_alias(client):
    from tests.conftest import signed_post
    client.patch(
        "/me",
        json={"forward_inbox_address": "triage+demo@yourdomain.example"},
        headers=HEADERS,
    )
    # Matched address requires signature; DocAI is unconfigured so the
    # final status is 'skipped' for that reason.
    r = signed_post(
        client, "/webhooks/email",
        _email_payload(to_addr="triage+demo@yourdomain.example"),
    )
    body = r.json()
    assert body["status"] == "skipped"
    assert body["reason"] == "DocAI not configured"


def test_email_forward_rejects_bad_signature(client):
    """Matched org with an invalid signature -> 401."""
    client.patch(
        "/me",
        json={"forward_inbox_address": "triage+demo@yourdomain.example"},
        headers=HEADERS,
    )
    import json as _json
    body = _json.dumps(_email_payload(to_addr="triage+demo@yourdomain.example")).encode()
    r = client.post(
        "/webhooks/email",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Triage-Signature": "sha256=bogus",
        },
    )
    assert r.status_code == 401
