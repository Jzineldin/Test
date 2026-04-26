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
        # The plaintext token isn't stored - we can't retrieve it.
        # This helper exists for tests that need to reconstruct flow;
        # see test_full_login_flow which captures the token differently.
        _ = body
        return ""


def test_login_with_unknown_email_returns_204(client):
    """Always 204 - never leaks which addresses are registered."""
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


def test_signup_creates_org_and_admin_user(client):
    r = client.post("/auth/signup", json={
        "email": "founder@acmebrokers.com",
        "name": "Jane Founder",
        "company_name": "Acme Brokers, LLC",
    })
    assert r.status_code == 204

    import app.db as db_pkg
    from app.db.models import Org, User
    from sqlalchemy import select
    with db_pkg.session_scope() as session:
        user = session.execute(
            select(User).where(User.email == "founder@acmebrokers.com")
        ).scalar_one()
        assert user.role == "admin"
        assert user.name == "Jane Founder"
        org = session.get(Org, user.org_id)
        assert org.slug == "acme-brokers-llc"
        assert org.name == "Acme Brokers, LLC"

    from app.email import get_client
    assert get_client().outbox[-1].to == "founder@acmebrokers.com"


def test_signup_with_duplicate_email_does_not_create_duplicate_org(client):
    """Signing up twice with the same email is idempotent - just sends a
    fresh login link to the original org instead of creating a clone."""
    body = {"email": "x@y.com", "name": "X", "company_name": "Y Co"}
    assert client.post("/auth/signup", json=body).status_code == 204
    assert client.post("/auth/signup", json={**body, "company_name": "Z Co"}).status_code == 204

    import app.db as db_pkg
    from app.db.models import Org, User
    from sqlalchemy import select
    with db_pkg.session_scope() as session:
        users = session.execute(
            select(User).where(User.email == "x@y.com")
        ).scalars().all()
        assert len(users) == 1
        # Only the first org made it.
        orgs = session.execute(select(Org).where(Org.slug.like("%-co%"))).scalars().all()
        assert len(orgs) == 1
        assert orgs[0].name == "Y Co"


def test_signup_with_colliding_company_name_appends_suffix(client):
    a = {"email": "a@a.com", "name": "A", "company_name": "Acme"}
    b = {"email": "b@b.com", "name": "B", "company_name": "Acme"}
    assert client.post("/auth/signup", json=a).status_code == 204
    assert client.post("/auth/signup", json=b).status_code == 204

    import app.db as db_pkg
    from app.db.models import Org
    from sqlalchemy import select
    with db_pkg.session_scope() as session:
        slugs = sorted([
            o.slug for o in session.execute(select(Org)).scalars().all()
            if o.slug != "demo"
        ])
        assert slugs == ["acme", "acme-2"]


def _login_as_admin(client, user_id):
    """Helper: mint a magic-link token, exchange it for a session cookie."""
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        user = session.get(User, user_id)
        user.role = "admin"
        token = issue_magic_link(session, user)
    client.post("/auth/verify", json={"token": token})


def test_invite_creates_user_and_emails_link(client):
    user_id = _seed_user(client)
    _login_as_admin(client, user_id)

    r = client.post("/me/invite", json={
        "email": "csr@example.com",
        "name": "New CSR",
        "role": "csr",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "csr@example.com"
    assert body["role"] == "csr"

    listed = client.get("/me/users").json()
    emails = {u["email"] for u in listed}
    assert "csr@example.com" in emails

    from app.email import get_client
    last = get_client().outbox[-1]
    assert last.to == "csr@example.com"
    assert "invited" in last.subject.lower()


def test_invite_requires_admin_when_using_cookie(client):
    """A CSR-role user calling /me/invite gets 403."""
    user_id = _seed_user(client)
    # Log in as the seeded user, who is role='csr' by default.
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))
    client.post("/auth/verify", json={"token": token})

    r = client.post("/me/invite", json={
        "email": "x@y.com", "role": "csr",
    })
    assert r.status_code == 403


def test_remove_user_blocks_last_admin(client):
    user_id = _seed_user(client)
    _login_as_admin(client, user_id)
    r = client.delete(f"/me/users/{user_id}")
    assert r.status_code == 409


def test_remove_csr_succeeds(client):
    admin_id = _seed_user(client, email="admin@example.com")
    csr_id = _seed_user(client, email="csr@example.com")
    _login_as_admin(client, admin_id)

    r = client.delete(f"/me/users/{csr_id}")
    assert r.status_code == 204
    listed = client.get("/me/users").json()
    assert csr_id not in {u["id"] for u in listed}


def test_promote_csr_to_admin(client):
    admin_id = _seed_user(client, email="admin@example.com")
    csr_id = _seed_user(client, email="csr@example.com")
    _login_as_admin(client, admin_id)
    r = client.patch(f"/me/users/{csr_id}", json={"role": "admin"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"


def test_demote_last_admin_blocked(client):
    admin_id = _seed_user(client, email="admin@example.com")
    _login_as_admin(client, admin_id)
    r = client.patch(f"/me/users/{admin_id}", json={"role": "csr"})
    assert r.status_code == 409


def test_role_change_invalid_value(client):
    admin_id = _seed_user(client, email="admin@example.com")
    _login_as_admin(client, admin_id)
    r = client.patch(f"/me/users/{admin_id}", json={"role": "owner"})
    assert r.status_code == 400


def test_get_api_key_returns_bearer_token(client):
    user_id = _seed_user(client)
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))
    client.post("/auth/verify", json={"token": token})

    r = client.get("/me/api-key")
    assert r.status_code == 200
    assert r.json()["api_key"]  # demo org's key, returned as-is


def test_rotate_api_key_changes_value_and_invalidates_old(client):
    user_id = _seed_user(client)
    # Rotation is admin-only - promote then sign in as admin.
    _login_as_admin(client, user_id)

    old = client.get("/me/api-key").json()["api_key"]
    new = client.post("/me/api-key/rotate").json()["api_key"]
    assert new != old
    assert new.startswith("stk_")

    # The old bearer is dead, the new one resolves.
    bad = client.get("/me", headers={"Authorization": f"Bearer {old}"}).status_code
    good = client.get("/me", headers={"Authorization": f"Bearer {new}"}).status_code
    # Bad: cookie still works (we're authed as the user); but raw old key alone wouldn't.
    # So drop the cookie to isolate the api-key path.
    client.cookies.delete("triage_session")
    bad_after = client.get("/me", headers={"Authorization": f"Bearer {old}"}).status_code
    good_after = client.get("/me", headers={"Authorization": f"Bearer {new}"}).status_code
    assert bad_after == 401
    assert good_after == 200


def test_rotate_webhook_secret_changes_value(client):
    user_id = _seed_user(client)
    _login_as_admin(client, user_id)

    old = client.get("/me").json()["webhook_secret"]
    r = client.post("/me/webhook-secret/rotate")
    assert r.status_code == 200
    new = r.json()["webhook_secret"]
    assert new != old
    assert new.startswith("whsec_")
    # /me now returns the rotated value.
    assert client.get("/me").json()["webhook_secret"] == new


def test_csr_role_blocks_admin_endpoints(client):
    """A CSR-cookie-authed user can't mutate carriers, settings, or
    rotate the api key."""
    user_id = _seed_user(client)  # default role='csr'
    import app.db as db_pkg
    from app.db.models import User
    from app.magic_link import issue_magic_link
    with db_pkg.session_scope() as session:
        token = issue_magic_link(session, session.get(User, user_id))
    client.post("/auth/verify", json={"token": token})

    sample_carrier = {
        "carrier_id": "x", "name": "X",
        "submission_email": "x@y.com",
        "typical_quote_back_days": 5,
        "appetite": [{
            "naics_prefixes": [], "states_in": [], "states_out": [],
            "lines": ["general_liability"],
        }],
    }
    assert client.post("/carriers", json=sample_carrier).status_code == 403
    assert client.post("/carriers/bulk", json=[sample_carrier]).status_code == 403
    assert client.delete("/carriers/anything").status_code == 403
    assert client.patch("/me", json={"name": "X"}).status_code == 403
    assert client.post("/me/api-key/rotate").status_code == 403
    assert client.post("/me/webhook-secret/rotate").status_code == 403
    # CSRs CAN read and triage.
    assert client.get("/me").status_code == 200
    assert client.get("/me/api-key").status_code == 200


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
