"""API-key OR session-cookie auth as a FastAPI dependency.

Two auth paths land at the same `current_org`:
  1. `Authorization: Bearer <api_key>` (machine-to-machine + back-compat)
  2. `triage_session=<secret>` cookie (browser sessions from magic-link)

Whichever resolves first wins. Both are checked against the DB, both
return CurrentOrg with the same shape so endpoints don't branch.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, status

from .db import get_org_by_api_key, session_scope
from .magic_link import COOKIE_NAME, resolve_session


@dataclass(frozen=True)
class CurrentOrg:
    id: int
    name: str
    slug: str
    plan: str
    monthly_submission_quota: int
    user_id: int | None = None       # set when authed by session cookie
    user_email: str | None = None    # ditto
    user_role: str | None = None     # ditto


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        return None
    return parts[1].strip()


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_org(
    authorization: Annotated[str | None, Header()] = None,
    triage_session: Annotated[str | None, Cookie()] = None,
) -> CurrentOrg:
    token = _bearer_token(authorization)

    # Prefer session cookie when both are present - more specific identity.
    with session_scope() as session:
        if triage_session:
            resolved = resolve_session(session, triage_session)
            if resolved is not None:
                user, _sess = resolved
                from .db.models import Org as OrgRow
                org = session.get(OrgRow, user.org_id)
                if org is not None:
                    return CurrentOrg(
                        id=org.id,
                        name=org.name,
                        slug=org.slug,
                        plan=org.plan,
                        monthly_submission_quota=org.monthly_submission_quota,
                        user_id=user.id,
                        user_email=user.email,
                        user_role=user.role,
                    )

        if token:
            org = get_org_by_api_key(session, token)
            if org is not None:
                return CurrentOrg(
                    id=org.id,
                    name=org.name,
                    slug=org.slug,
                    plan=org.plan,
                    monthly_submission_quota=org.monthly_submission_quota,
                )
            raise _unauthorized("Invalid API key")

    if not token and not triage_session:
        raise _unauthorized("Missing Authorization header or session cookie")
    raise _unauthorized("Invalid session")
