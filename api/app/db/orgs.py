"""Org provisioning + lookup."""
from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Org

DEMO_ORG_SLUG = "demo"
DEMO_ORG_NAME = "Demo Wholesale Brokers"
DEMO_API_KEY = "demo-key-change-in-prod"


def generate_api_key() -> str:
    """48-char URL-safe token; long enough that a brute-force is infeasible."""
    return f"stk_{secrets.token_urlsafe(36)}"


def generate_webhook_secret() -> str:
    """Per-org HMAC key for signing /webhooks/inbound + /webhooks/email."""
    return f"whsec_{secrets.token_urlsafe(36)}"


def get_org_by_api_key(session: Session, api_key: str) -> Org | None:
    return session.execute(
        select(Org).where(Org.api_key == api_key)
    ).scalar_one_or_none()


def get_org_by_slug(session: Session, slug: str) -> Org | None:
    return session.execute(
        select(Org).where(Org.slug == slug)
    ).scalar_one_or_none()


def create_org(
    session: Session,
    *,
    name: str,
    slug: str,
    api_key: str | None = None,
    webhook_secret: str | None = None,
    plan: str = "trial",
) -> Org:
    org = Org(
        name=name,
        slug=slug,
        api_key=api_key or generate_api_key(),
        webhook_secret=webhook_secret or generate_webhook_secret(),
        plan=plan,
    )
    session.add(org)
    session.flush()
    return org


def ensure_demo_org(session: Session) -> Org:
    """Idempotent: create the demo org on first boot, return it thereafter.

    The demo org's API key is intentionally well-known so the dashboard
    works out of the box. In production, rotate it. Webhook secret is
    deterministic for the demo so curl-testing webhooks is trivial.
    """
    existing = get_org_by_slug(session, DEMO_ORG_SLUG)
    if existing:
        # Backfill webhook_secret on rows created before this column existed.
        if not existing.webhook_secret:
            existing.webhook_secret = "whsec_demo-rotate-in-prod"
        return existing
    return create_org(
        session, name=DEMO_ORG_NAME, slug=DEMO_ORG_SLUG,
        api_key=DEMO_API_KEY,
        webhook_secret="whsec_demo-rotate-in-prod",
    )
