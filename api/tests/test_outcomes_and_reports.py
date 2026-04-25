"""Tests for the outcome promotion + reports + notification path.

Notifications are exercised via a monkeypatched get_client_for_url that
returns a StubNotificationClient. No HTTP calls leave the process.
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'rep.db'}")
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
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        email_client_mod, email_pkg, notif_client_mod, notif_pkg,
        reports_mod, main_mod,
    ):
        importlib.reload(mod)
    return main_mod


@pytest.fixture
def client(env):
    with TestClient(env.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def _seed_full_flow(client) -> tuple[int, str]:
    """Triage + send a draft. Returns (draft_id, provider_message_id)."""
    sample = {
        "submission_id": "SUB-OUT-1",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co", "naics": "238220",
            "business_description": "Plumbing", "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }
    triaged = client.post("/triage", json=sample, headers=HEADERS).json()
    draft_id = triaged["drafted_emails"][0]["id"]
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    return draft_id, sent["provider_message_id"]


def test_outcome_starts_null_until_reply(client):
    draft_id, _ = _seed_full_flow(client)
    body = client.get(f"/drafts/{draft_id}", headers=HEADERS).json()
    assert body["outcome"] is None


def test_inbound_reply_sets_outcome_pending(client):
    draft_id, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Quoting at $42k."})
    body = client.get(f"/drafts/{draft_id}", headers=HEADERS).json()
    assert body["outcome"] == "pending"
    assert body["quote_replied_at"] is not None


def test_outcome_promotes_to_bound_with_premium(client):
    draft_id, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Quote $42k"})
    r = client.post(
        f"/drafts/{draft_id}/outcome",
        json={"outcome": "bound", "bound_premium_cents": 4_200_000},
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["outcome"] == "bound"
    assert r.json()["bound_premium_cents"] == 4_200_000


def test_outcome_promotes_to_declined(client):
    draft_id, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Out of appetite"})
    r = client.post(
        f"/drafts/{draft_id}/outcome",
        json={"outcome": "declined"},
        headers=HEADERS,
    )
    assert r.json()["outcome"] == "declined"


def test_outcome_rejects_invalid_value(client):
    draft_id, _ = _seed_full_flow(client)
    r = client.post(
        f"/drafts/{draft_id}/outcome", json={"outcome": "invalid"}, headers=HEADERS,
    )
    assert r.status_code == 400


def test_outcome_requires_auth(client):
    assert client.post("/drafts/1/outcome", json={"outcome": "bound"}).status_code == 401


def test_reports_summary_starts_zero(client):
    body = client.get("/reports/summary", headers=HEADERS).json()
    assert body["submissions_triaged"] == 0
    assert body["drafts_sent"] == 0
    assert body["bound_premium_dollars"] == 0
    assert body["quote_back_rate"] == 0


def test_reports_summary_reflects_full_flow(client):
    draft_id, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Quote $42k"})
    client.post(
        f"/drafts/{draft_id}/outcome",
        json={"outcome": "bound", "bound_premium_cents": 4_200_000},
        headers=HEADERS,
    )

    body = client.get("/reports/summary", headers=HEADERS).json()
    assert body["submissions_triaged"] == 1
    assert body["drafts_sent"] == 1
    assert body["drafts_replied"] == 1
    assert body["drafts_bound"] == 1
    assert body["bound_premium_dollars"] == 42_000.0
    assert body["bind_rate"] == 1.0
    assert body["quote_back_rate"] == 1.0


def test_inbound_fires_notification_when_org_has_webhook(env, client, monkeypatch):
    """Wire a StubNotificationClient and confirm send() is called."""
    from app.db import session_scope
    from app.db.models import Org as OrgRow

    # Configure the demo org with a notification webhook.
    with session_scope() as session:
        org = session.query(OrgRow).filter_by(slug="demo").one()
        org.notification_webhook_url = "https://hooks.slack.com/services/T/B/X"

    sent: list = []
    from app.notifications import StubNotificationClient
    stub = StubNotificationClient()

    def fake_get_client_for_url(url):
        sent.append(url)
        return stub

    monkeypatch.setattr(env, "get_client_for_url", fake_get_client_for_url)

    _, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Quote $42k"})

    assert sent == ["https://hooks.slack.com/services/T/B/X"]
    assert len(stub.outbox) == 1
    assert "Quote received" in stub.outbox[0].title


def test_inbound_no_webhook_no_notification(env, client, monkeypatch):
    """Default org has no webhook URL — get_client_for_url shouldn't be called."""
    calls: list = []
    monkeypatch.setattr(env, "get_client_for_url", lambda url: calls.append(url) or None)

    _, pid = _seed_full_flow(client)
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {"provider_message_id": pid, "body": "Quote $42k"})

    assert calls == []
