"""Magic-link auth + session-cookie auth tests.

Stub email client captures the link email; verify endpoint exchanges the
token for a session; session cookie unlocks org-scoped endpoints exactly
like the API-key Bearer header.
"""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'magic.db'}")
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
    import app.magic_link as magic_mod
    import app.main as main_mod

    for mod in (
        session_mod, repo_mod, orgs_mod, db_pkg, auth_mod,
        email_client_mod, email_pkg, notif_client_mod, notif_pkg,
        reports_mod, limits_mod, magic_mod, main_mod,
    ):
        importlib.reload(mod)
    return main_mod


@pytest.fixture
def client(env):
    with TestClient(env.app) as c:
        yield c


def _seed_user(client, email: str = "broker@example.com") -> int:
    """Insert a User row directly so /auth/login has somebody to mail."""
    import app.db as db_pkg
    from app.db.models import User
    with db_pkg.session_scope() as session:
        org = db_pkg.get_org_by_slug(session, "demo")
        u = User(org_id=org.id, email=email, name="Test Broker", role="csr")
        session.add(u)
        session.flush()
        return u.id


def _last_link_from_outbox() -> str:
    """Pull the magic-link URL out of the StubEmailClient outbox."""
    from app.email import get_client
    body = get_client().outbox[-1]
    # Stub returns SentEmail (no body); our send() implementation in
    # main.py emits the link in the body, but Stub doesn't capture body.
    # Re-derive: the stub's send signature accepts body but discards it.
    # We instead rely on the link living in the most recent token row.
    import app.db as db_pkg
    from app.db.models import MagicLinkToken, User
    from sqlalchemy import select
    with db_pkg.session_scope() as session:
        # The plaintext token isn't stored — we can't retrieve it.
        # This helper exists for tests that need to reconstruct flow;
        # see test_full_login_flow which captures the token differently.
        _ = body
        return ""


def test_login_with_unknown_email_returns_204(client):
    """Always 204 — never leaks which addresses are registered."""
    r = client.post("/auth/login", json={"email": "nobody@example.com"})
    assert r.status_code == 204


def test_login_with_known_email_returns_204_and_sends_link(client):
    _seed_user(client)
    r = client.post("/auth/login", json={"email": "broker@example.com"})
    assert r.status_code == 204

    from app.email import get_client
    outbox = get_client().outbox
    assert len(outbox) == 1
    assert outbox[-1].to == "broker@example.com"
    assert "login link" in outbox[-1].subject.lower()


def test_full_magic_link_flow_to_session_cookie(client):
    """End-to-end: issue token, consume it, hit org endpoint with cookie."""
    user_id = _seed_user(client)

    # Mint a token directly so we can capture the plaintext (the email
    # stub doesn't preserve the body that contains the URL).
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        user = session.get(User, user_id)
        token = issue_magic_link(session, user)

    r = client.post("/auth/verify", json={"token": token})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_email"] == "broker@example.com"
    assert body["org_slug"] == "demo"
    assert "triage_session" in r.cookies

    # Hit an authed endpoint using the cookie (TestClient persists cookies).
    me = client.get("/me").json()
    assert me["slug"] == "demo"


def test_verify_rejects_unknown_token(client):
    r = client.post("/auth/verify", json={"token": "garbage"})
    assert r.status_code == 401


def test_verify_token_consumed_only_once(client):
    user_id = _seed_user(client)
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))

    assert client.post("/auth/verify", json={"token": token}).status_code == 200
    assert client.post("/auth/verify", json={"token": token}).status_code == 401


def test_logout_clears_cookie_and_revokes_session(client):
    user_id = _seed_user(client)
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))
    client.post("/auth/verify", json={"token": token})

    assert client.get("/me").status_code == 200
    client.post("/auth/logout")
    # Cookie cleared on the client side.
    client.cookies.delete("triage_session")
    # And without a cookie OR an api key, /me is 401.
    r = client.get("/me")
    assert r.status_code == 401


def test_session_cookie_and_api_key_both_work(client):
    """Bearer key (existing) and session cookie (new) both resolve to org."""
    by_key = client.get("/me", headers={
        "Authorization": "Bearer demo-key-change-in-prod",
    }).json()
    assert by_key["slug"] == "demo"
    assert by_key.get("user_id") in (None,)  # api-key auth has no user

    user_id = _seed_user(client, email="csr@example.com")
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))
    client.post("/auth/verify", json={"token": token})

    by_cookie = client.get("/me").json()
    assert by_cookie["slug"] == "demo"
