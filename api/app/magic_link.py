"""Magic-link login + cookie-session auth.

Flow:
  1. POST /auth/login  {email}        -> always 204 (don't leak which
                                          emails exist). If email matches
                                          a user, send a magic link.
  2. User clicks link  /auth/verify?token=...
                                       -> if valid + unconsumed + unexpired:
                                          mints a Session, sets the cookie,
                                          redirects to the dashboard.
  3. Subsequent requests carry the cookie. The current_org dependency
     accepts EITHER Bearer api-key OR session cookie.

Tokens & secrets are hashed (SHA-256) in the DB; the plaintext only
appears in the email and the cookie value, never at rest.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db.models import MagicLinkToken, Session, User

MAGIC_LINK_TTL = timedelta(minutes=15)
SESSION_TTL = timedelta(days=30)
COOKIE_NAME = "triage_session"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def get_user_by_email(session: DbSession, email: str) -> User | None:
    return session.execute(
        select(User).where(User.email == email.lower())
    ).scalar_one_or_none()


def issue_magic_link(session: DbSession, user: User) -> str:
    """Mint a magic-link token. Returns the plaintext token to email."""
    token = secrets.token_urlsafe(32)
    session.add(MagicLinkToken(
        user_id=user.id,
        token_hash=_hash(token),
        expires_at=datetime.now(timezone.utc) + MAGIC_LINK_TTL,
    ))
    session.flush()
    return token


def consume_magic_link(session: DbSession, token: str) -> User | None:
    """Validate + mark consumed. Returns the User on success."""
    row = session.execute(
        select(MagicLinkToken).where(MagicLinkToken.token_hash == _hash(token))
    ).scalar_one_or_none()
    if row is None or row.consumed_at is not None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    row.consumed_at = datetime.now(timezone.utc)
    user = session.get(User, row.user_id)
    if user is not None:
        user.last_login_at = datetime.now(timezone.utc)
    return user


def create_session(session: DbSession, user: User) -> str:
    """Mint a session secret. Returns the plaintext to set as a cookie."""
    secret = secrets.token_urlsafe(48)
    session.add(Session(
        user_id=user.id,
        secret_hash=_hash(secret),
        expires_at=datetime.now(timezone.utc) + SESSION_TTL,
    ))
    session.flush()
    return secret


def resolve_session(session: DbSession, secret: str) -> tuple[User, Session] | None:
    row = session.execute(
        select(Session).where(Session.secret_hash == _hash(secret))
    ).scalar_one_or_none()
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    user = session.get(User, row.user_id)
    if user is None:
        return None
    # Sliding refresh: every authenticated request bumps last_seen and
    # extends the cookie's life by another 30d. Avoids surprise logouts
    # for active users while still expiring abandoned sessions.
    row.last_seen_at = datetime.now(timezone.utc)
    row.expires_at = datetime.now(timezone.utc) + SESSION_TTL
    return user, row


def revoke_session(session: DbSession, secret: str) -> None:
    row = session.execute(
        select(Session).where(Session.secret_hash == _hash(secret))
    ).scalar_one_or_none()
    if row is not None:
        session.delete(row)
