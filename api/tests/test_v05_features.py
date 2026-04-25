"""Tests for the v0.5 surface: rate limiting, draft editing, CSV export, digest."""
from __future__ import annotations

import csv
import importlib
import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'v05.db'}")
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


def _sample() -> dict:
    return {
        "submission_id": "SUB-V05",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co", "naics": "238220",
            "business_description": "Plumbing", "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }


def _seed(client) -> int:
    """Triage and return the first draft's id."""
    triaged = client.post("/triage", json=_sample(), headers=HEADERS).json()
    return triaged["drafted_emails"][0]["id"]


def test_patch_draft_overrides_subject_and_body(client):
    draft_id = _seed(client)
    r = client.patch(
        f"/drafts/{draft_id}",
        json={"subject": "EDITED — please review", "body": "New body."},
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    assert r.json()["subject"] == "EDITED — please review"
    assert r.json()["body"] == "New body."


def test_patch_draft_after_send_returns_409(client):
    draft_id = _seed(client)
    client.post(f"/drafts/{draft_id}/send", headers=HEADERS)
    r = client.patch(
        f"/drafts/{draft_id}",
        json={"subject": "too late"}, headers=HEADERS,
    )
    assert r.status_code == 409


def test_patch_draft_requires_auth(client):
    r = client.patch("/drafts/1", json={"subject": "x"})
    assert r.status_code == 401


def test_csv_export_returns_csv_with_header(client):
    _seed(client)
    r = client.get("/history/export.csv", headers=HEADERS)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment;" in r.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(r.text)))
    assert rows[0][:4] == ["run_id", "submission_id", "insured", "state"]
    # Header + one row per draft (3 drafts for the Acme NAICS in TX).
    assert len(rows) >= 2


def test_csv_export_requires_auth(client):
    assert client.get("/history/export.csv").status_code == 401


def test_digest_empty_when_nothing_recent(client):
    _seed(client)
    body = client.get("/reports/digest", headers=HEADERS).json()
    assert body == []  # no replies yet


def test_digest_includes_recent_reply_and_outcome(client):
    draft_id = _seed(client)
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {
        "provider_message_id": sent["provider_message_id"],
        "body": "Quote at $42k",
    })
    client.post(
        f"/drafts/{draft_id}/outcome",
        json={"outcome": "bound", "bound_premium_cents": 4_200_000},
        headers=HEADERS,
    )

    body = client.get("/reports/digest", headers=HEADERS).json()
    kinds = {item["kind"] for item in body}
    assert "reply" in kinds
    assert "bound" in kinds


def test_digest_respects_since_param(client):
    """A future `since` returns an empty list."""
    draft_id = _seed(client)
    sent = client.post(f"/drafts/{draft_id}/send", headers=HEADERS).json()
    from tests.conftest import signed_post
    signed_post(client, "/webhooks/inbound", {
        "provider_message_id": sent["provider_message_id"], "body": "x",
    })

    future = "2099-01-01T00:00:00Z"
    body = client.get(
        f"/reports/digest?since={future}", headers=HEADERS,
    ).json()
    assert body == []
