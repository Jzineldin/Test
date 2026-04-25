"""Carrier listing + upsert endpoint."""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = tmp_path / "carriers_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("CARRIERS_DIR", str(tmp_path / "carriers"))
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SES_FROM_ADDRESS", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)

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


def _sample_carrier() -> dict:
    return {
        "carrier_id": "test_carrier",
        "name": "Test Carrier",
        "submission_email": "submissions@test.example",
        "typical_quote_back_days": 7,
        "appetite": [{
            "naics_prefixes": ["238"],
            "states_in": ["TX"],
            "states_out": [],
            "lines": ["general_liability"],
            "revenue_max": "10000000",
        }],
    }


def test_upsert_persists_and_list_returns_it(client):
    r = client.post("/carriers", json=_sample_carrier(), headers=HEADERS)
    assert r.status_code == 201, r.text

    listed = client.get("/carriers", headers=HEADERS).json()
    ids = {c["carrier_id"] for c in listed}
    assert "test_carrier" in ids


def test_upsert_overwrites_existing(client):
    payload = _sample_carrier()
    client.post("/carriers", json=payload, headers=HEADERS)
    payload["typical_quote_back_days"] = 14
    client.post("/carriers", json=payload, headers=HEADERS)

    listed = client.get("/carriers", headers=HEADERS).json()
    by_id = {c["carrier_id"]: c for c in listed}
    assert by_id["test_carrier"]["typical_quote_back_days"] == 14


def test_upsert_requires_auth(client):
    assert client.post("/carriers", json=_sample_carrier()).status_code == 401
