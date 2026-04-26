"""Auth dependency tests - exercise the FastAPI surface end-to-end with a
TestClient against a tmp SQLite so the demo org seed runs naturally."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = tmp_path / "auth_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    # Force re-import so the engine picks up the env var fresh.
    import importlib
    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.main as main_mod
    importlib.reload(session_mod)
    importlib.reload(repo_mod)
    importlib.reload(orgs_mod)
    importlib.reload(db_pkg)
    importlib.reload(auth_mod)
    importlib.reload(main_mod)

    with TestClient(main_mod.app) as c:
        yield c


def test_missing_auth_returns_401(client):
    r = client.get("/me")
    assert r.status_code == 401
    assert "Missing Authorization" in r.json()["detail"]


def test_malformed_auth_returns_401(client):
    r = client.get("/me", headers={"Authorization": "NotBearer abc"})
    assert r.status_code == 401


def test_invalid_key_returns_401(client):
    r = client.get("/me", headers={"Authorization": "Bearer not-a-real-key"})
    assert r.status_code == 401
    assert "Invalid API key" in r.json()["detail"]


def test_demo_key_resolves_to_org(client):
    r = client.get("/me", headers={"Authorization": "Bearer demo-key-change-in-prod"})
    assert r.status_code == 200
    body = r.json()
    assert body["slug"] == "demo"
    assert body["plan"] == "trial"


def test_history_requires_auth(client):
    assert client.get("/history").status_code == 401


def test_triage_requires_auth(client):
    assert client.post("/triage", json={}).status_code == 401


def test_healthz_does_not_require_auth(client):
    assert client.get("/healthz").status_code == 200
