"""Smoke tests for the small endpoints added during the v0.5 polish push.

Each is short enough that a focused test file beats sprinkling them
across the existing suites."""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = tmp_path / "misc.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    # Point at the real bundled sample carriers so /carriers GET seeds
    # something non-empty for the demo org and triage isn't blocked.
    from pathlib import Path
    repo = Path(__file__).resolve().parents[2]
    monkeypatch.setenv("CARRIERS_DIR", str(repo / "data" / "carriers"))
    for var in (
        "STRIPE_SECRET_KEY", "SES_FROM_ADDRESS",
        "AWS_ACCESS_KEY_ID", "ANTHROPIC_API_KEY",
        "DOCAI_PROCESSOR_ID", "SENTRY_DSN",
    ):
        monkeypatch.delenv(var, raising=False)

    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.main as main_mod
    for mod in (session_mod, repo_mod, orgs_mod, db_pkg, auth_mod, main_mod):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def test_version_returns_subsystem_modes(client):
    r = client.get("/version")
    assert r.status_code == 200
    body = r.json()
    # Every subsystem reports stub when its env var is absent.
    assert body["stripe"] == "stub"
    assert body["ses"] == "stub"
    assert body["docai"] == "stub"
    assert body["llm"] == "stub"
    assert "git_sha" in body
    assert "started_at" in body


def test_version_is_public_no_auth(client):
    """Status pages need to read /version without a key."""
    r = client.get("/version")
    assert r.status_code == 200


def test_email_signature_round_trips_through_settings(client):
    sig = "Pat Reyes\nSenior Broker\nTale Forge\n(555) 123-4567"
    r = client.patch("/me", json={"email_signature": sig}, headers=HEADERS)
    assert r.status_code == 200, r.text
    assert r.json()["email_signature"] == sig

    me = client.get("/me", headers=HEADERS).json()
    assert me["email_signature"] == sig


def test_email_signature_clear_with_empty_string(client):
    """Sending '' clears the signature."""
    client.patch("/me", json={"email_signature": "Hi"}, headers=HEADERS)
    r = client.patch("/me", json={"email_signature": ""}, headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["email_signature"] is None


def test_portal_link_404_when_no_stripe_customer(client):
    """Portal requires a real Stripe customer id; demo org has none."""
    r = client.post(
        "/billing/portal-link",
        json={"return_url": "https://appetitematch.com"},
        headers=HEADERS,
    )
    # Demo org has no stripe_customer_id at all.
    assert r.status_code == 400
    assert "subscription" in r.json()["detail"].lower()


def _minimal_submission(sid: str = "SUB-BULK-1") -> dict:
    return {
        "submission_id": sid,
        "received_at": "2026-04-26",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Bulk Test Co",
            "naics": "238220",
            "primary_state": "TX",
            "annual_revenue": "5000000",
            "business_description": "HVAC contractor.",
            "years_in_business": 10,
        },
        "coverages": [{"line": "general_liability"}],
    }


def test_bulk_triage_runs_each_submission_and_aggregates(client):
    body = [
        _minimal_submission("SUB-A"),
        _minimal_submission("SUB-B"),
        _minimal_submission("SUB-C"),
    ]
    r = client.post("/triage/bulk", json=body, headers=HEADERS)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["ok_count"] == 3, [i.get("error") for i in out["items"]]
    assert out["error_count"] == 0
    ids = {i["submission_id"] for i in out["items"]}
    assert ids == {"SUB-A", "SUB-B", "SUB-C"}
    for i in out["items"]:
        assert i["status"] == "ok"
        assert i["result"] is not None


def test_bulk_triage_413_when_over_cap(client):
    body = [_minimal_submission(f"SUB-{i}") for i in range(60)]
    r = client.post("/triage/bulk", json=body, headers=HEADERS)
    assert r.status_code == 413


def test_portal_link_400_when_customer_id_is_stub(client):
    """Stub customer ids from before real Stripe was wired are rejected."""
    import app.db as db_pkg
    from app.db.models import Org as OrgRow
    with db_pkg.session_scope() as session:
        org = session.query(OrgRow).filter_by(slug="demo").one()
        org.stripe_customer_id = "cus_stub_demo_1"
    r = client.post(
        "/billing/portal-link",
        json={"return_url": "https://appetitematch.com"},
        headers=HEADERS,
    )
    assert r.status_code == 400
