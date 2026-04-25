"""Billing tests — usage metering + Stripe checkout flow + webhook handling.

All tests use the StubBillingClient (default when STRIPE_SECRET_KEY is unset).
"""
from __future__ import annotations

import importlib
import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch, tmp_path):
    db_path = tmp_path / "billing_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SES_FROM_ADDRESS", raising=False)

    import app.db.session as session_mod
    import app.db.repository as repo_mod
    import app.db.orgs as orgs_mod
    import app.db as db_pkg
    import app.auth as auth_mod
    import app.billing.client as billing_client_mod
    import app.billing.usage as billing_usage_mod
    import app.billing as billing_pkg
    import app.email.client as email_client_mod
    import app.email as email_pkg
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        billing_client_mod, billing_usage_mod, billing_pkg,
        email_client_mod, email_pkg, main_mod,
    ):
        importlib.reload(mod)

    with TestClient(main_mod.app) as c:
        yield c


HEADERS = {"Authorization": "Bearer demo-key-change-in-prod"}


def _seed_triage(client) -> None:
    sample = {
        "submission_id": "SUB-BILL-1",
        "received_at": "2026-04-25",
        "retail_agent_email": "agent@example.com",
        "insured": {
            "legal_name": "Test Co",
            "naics": "238220",
            "business_description": "Plumbing",
            "primary_state": "TX",
            "annual_revenue": "4200000",
        },
        "coverages": [{"line": "general_liability"}],
    }
    r = client.post("/triage", json=sample, headers=HEADERS)
    assert r.status_code == 200, r.text


def test_usage_starts_at_zero(client):
    r = client.get("/billing/usage", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["submissions_this_period"] == 0
    assert body["plan"] == "trial"
    assert body["monthly_submission_quota"] == 50
    assert body["over_quota"] is False


def test_usage_increments_after_triage(client):
    _seed_triage(client)
    _seed_triage(client)
    body = client.get("/billing/usage", headers=HEADERS).json()
    assert body["submissions_this_period"] == 2


def test_checkout_link_creates_customer_and_returns_url(client):
    body = client.post(
        "/billing/checkout-link",
        json={
            "price_id": "price_demo",
            "success_url": "http://localhost:3000/success",
            "cancel_url": "http://localhost:3000/cancel",
        },
        headers=HEADERS,
    ).json()
    assert body["url"].startswith("https://checkout.stripe.com/")
    assert body["customer_id"] == "cus_stub_demo_1"


def test_checkout_link_reuses_existing_customer(client):
    first = client.post(
        "/billing/checkout-link",
        json={
            "price_id": "price_demo",
            "success_url": "http://x/s",
            "cancel_url": "http://x/c",
        },
        headers=HEADERS,
    ).json()
    second = client.post(
        "/billing/checkout-link",
        json={
            "price_id": "price_demo",
            "success_url": "http://x/s",
            "cancel_url": "http://x/c",
        },
        headers=HEADERS,
    ).json()
    assert first["customer_id"] == second["customer_id"]


def test_webhook_checkout_completed_promotes_to_active(client):
    # Provision a stripe customer first.
    cust = client.post(
        "/billing/checkout-link",
        json={
            "price_id": "p", "success_url": "http://x/s", "cancel_url": "http://x/c",
        },
        headers=HEADERS,
    ).json()["customer_id"]

    payload = json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {"customer": cust}},
    }).encode()
    r = client.post("/webhooks/stripe", content=payload)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "checkout_completed"

    usage = client.get("/billing/usage", headers=HEADERS).json()
    assert usage["plan"] == "active"
    assert usage["monthly_submission_quota"] == 500


def test_webhook_subscription_deleted_demotes_to_cancelled(client):
    cust = client.post(
        "/billing/checkout-link",
        json={"price_id": "p", "success_url": "http://x/s", "cancel_url": "http://x/c"},
        headers=HEADERS,
    ).json()["customer_id"]
    payload = json.dumps({
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": cust}},
    }).encode()
    assert client.post("/webhooks/stripe", content=payload).json()["status"] == "subscription_cancelled"
    usage = client.get("/billing/usage", headers=HEADERS).json()
    assert usage["plan"] == "cancelled"


def test_webhook_unknown_event_returns_ignored(client):
    payload = json.dumps({"type": "invoice.created", "data": {"object": {}}}).encode()
    body = client.post("/webhooks/stripe", content=payload).json()
    assert body["status"] == "ignored"
    assert body["type"] == "invoice.created"


def test_billing_usage_requires_auth(client):
    assert client.get("/billing/usage").status_code == 401
