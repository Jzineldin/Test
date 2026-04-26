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


def test_delete_removes_the_carrier(client):
    client.post("/carriers", json=_sample_carrier(), headers=HEADERS)
    assert client.delete("/carriers/test_carrier", headers=HEADERS).status_code == 204
    listed = client.get("/carriers", headers=HEADERS).json()
    assert "test_carrier" not in {c["carrier_id"] for c in listed}


def test_delete_unknown_carrier_returns_404(client):
    r = client.delete("/carriers/never_existed", headers=HEADERS)
    assert r.status_code == 404


def test_delete_requires_auth(client):
    client.post("/carriers", json=_sample_carrier(), headers=HEADERS)
    assert client.delete("/carriers/test_carrier").status_code == 401


def test_bulk_upsert_creates_and_updates(client):
    base = _sample_carrier()
    other = {**_sample_carrier(), "carrier_id": "other_carrier", "name": "Other"}
    # Seed one of them so we can verify create vs update split.
    client.post("/carriers", json=base, headers=HEADERS)

    base["typical_quote_back_days"] = 21  # change so it's a real update
    r = client.post("/carriers/bulk", json=[base, other], headers=HEADERS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 1
    assert body["updated"] == 1
    assert body["failed"] == []

    listed = {c["carrier_id"]: c for c in client.get("/carriers", headers=HEADERS).json()}
    assert listed["test_carrier"]["typical_quote_back_days"] == 21
    assert "other_carrier" in listed


def test_org_carriers_are_isolated(client, monkeypatch, tmp_path):
    """Two orgs upserting the same carrier_id keep independent data."""
    import app.db as db_pkg
    from app.db import create_org

    client.post("/carriers", json=_sample_carrier(), headers=HEADERS)

    with db_pkg.session_scope() as session:
        other = create_org(
            session, name="Other Brokers", slug="other",
            api_key="other-org-key",
        )
        other_key = other.api_key

    other_headers = {"Authorization": f"Bearer {other_key}"}
    other_listed = client.get("/carriers", headers=other_headers).json()
    other_ids = {c["carrier_id"] for c in other_listed}
    # Other org gets the seeded sample carriers, NOT demo's test_carrier.
    assert "test_carrier" not in other_ids


def test_export_csv_round_trips_with_bulk_import(client):
    payload = _sample_carrier()
    payload["appetite"][0]["states_in"] = ["TX", "FL"]
    payload["appetite"][0]["lines"] = ["general_liability", "commercial_auto"]
    client.post("/carriers", json=payload, headers=HEADERS)

    r = client.get("/carriers/export.csv", headers=HEADERS)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    body = r.text
    assert "carrier_id,name,submission_email" in body
    assert "test_carrier" in body
    # Multi-value cells use semicolon to round-trip with the importer.
    assert "TX;FL" in body
    assert "general_liability;commercial_auto" in body
