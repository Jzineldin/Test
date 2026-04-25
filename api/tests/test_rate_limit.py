"""Rate-limiting test, isolated so the low cap doesn't leak into other suites."""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'rl.db'}")
    monkeypatch.setenv("RATE_LIMIT_TRIAGE", "3/minute")
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
    import app.limits as limits_mod
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        limits_mod, main_mod,
    ):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def _sample() -> dict:
    return {
        "submission_id": "SUB-RL",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co", "naics": "238220",
            "business_description": "Plumbing", "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }


def test_rate_limit_kicks_in_after_quota(client):
    sample = _sample()
    assert client.post("/triage", json=sample, headers=HEADERS).status_code == 200
    assert client.post("/triage", json=sample, headers=HEADERS).status_code == 200
    assert client.post("/triage", json=sample, headers=HEADERS).status_code == 200
    blocked = client.post("/triage", json=sample, headers=HEADERS)
    assert blocked.status_code == 429
    assert "Rate limit" in blocked.json()["detail"]
