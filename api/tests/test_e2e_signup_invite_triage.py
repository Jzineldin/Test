"""End-to-end: a brand-new broker signs up, invites a teammate, runs
a triage, and sees the result. If this test breaks, real signups break.

Notably exercises the auto-seed path so a fresh org has carriers without
manual setup."""
from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'e2e.db'}")
    monkeypatch.setenv("CARRIERS_DIR", str(REPO / "data" / "carriers"))
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
    import app.email.client as email_client_mod
    import app.email as email_pkg
    import app.notifications.client as notif_client_mod
    import app.notifications as notif_pkg
    import app.reports as reports_mod
    import app.limits as limits_mod
    import app.magic_link as magic_mod
    import app.main as main_mod
    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        email_client_mod, email_pkg, notif_client_mod, notif_pkg,
        reports_mod, limits_mod, magic_mod, main_mod,
    ):
        importlib.reload(mod)
    with TestClient(main_mod.app) as c:
        yield c


def _submission() -> dict:
    return {
        "submission_id": "SUB-NEW-1",
        "received_at": "2026-04-26",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "New Broker Test Co",
            "naics": "238220",
            "primary_state": "TX",
            "annual_revenue": "5000000",
            "business_description": "HVAC contractor.",
            "years_in_business": 8,
        },
        "coverages": [{"line": "general_liability"}],
    }


def test_new_broker_can_signup_invite_and_triage(client):
    # 1. Signup creates Org + admin User + auto-seeds carriers.
    r = client.post("/auth/signup", json={
        "email": "founder@new-broker.com",
        "name": "Jane Founder",
        "company_name": "New Brokers LLC",
    })
    assert r.status_code == 204, r.text

    # 2. Capture the magic-link token directly (stub email outbox doesn't
    # carry the link body) and exchange it for a session cookie.
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        from sqlalchemy import select
        user = session.execute(
            select(User).where(User.email == "founder@new-broker.com")
        ).scalar_one()
        assert user.role == "admin"
        token = issue_magic_link(session, user)
    r = client.post("/auth/verify", json={"token": token})
    assert r.status_code == 200, r.text

    # 3. /me reflects the new org.
    me = client.get("/me").json()
    assert me["org_name"] == "New Brokers LLC"
    assert me["plan"] == "trial"
    assert me["user_role"] == "admin"

    # 4. Auto-seeded carriers are visible at /carriers.
    carriers = client.get("/carriers").json()
    carrier_ids = {c["carrier_id"] for c in carriers}
    assert "atlas_specialty" in carrier_ids
    assert "keystone_ins" in carrier_ids

    # 5. Admin invites a CSR, who lands in the same org.
    r = client.post("/me/invite", json={
        "email": "csr@new-broker.com",
        "name": "Pat CSR",
        "role": "csr",
    })
    assert r.status_code == 201, r.text
    users = client.get("/me/users").json()
    emails = {u["email"] for u in users}
    assert {"founder@new-broker.com", "csr@new-broker.com"} <= emails

    # 6. Triage runs against the new org's seeded carriers.
    r = client.post("/triage", json=_submission())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["submission_id"] == "SUB-NEW-1"
    assert len(body["matches"]) > 0  # at least one carrier matched

    # 7. The run is persisted under the new org (not demo's).
    history = client.get("/history").json()
    assert any(h["submission_id"] == "SUB-NEW-1" for h in history)

    # 8. Period summary reflects the run.
    summary = client.get("/reports/summary").json()
    assert summary["submissions_triaged"] >= 1


def test_new_broker_audit_log_records_signup_actions(client):
    """Every state change a new broker takes shows up in /audit, so an E&O
    review later can reconstruct what happened."""
    # Signup + verify + invite + triage to populate the audit log.
    client.post("/auth/signup", json={
        "email": "x@y.com", "name": "X", "company_name": "Y Co",
    })
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        from sqlalchemy import select
        user = session.execute(
            select(User).where(User.email == "x@y.com")
        ).scalar_one()
        token = issue_magic_link(session, user)
    client.post("/auth/verify", json={"token": token})
    client.post("/me/invite", json={"email": "a@y.com", "role": "csr"})
    client.post("/triage", json=_submission())

    events = client.get("/audit").json()
    types = [e["event_type"] for e in events]
    assert "user.invited" in types
    assert "triage.run" in types
