"""API-key auth as a FastAPI dependency.

Clients send `Authorization: Bearer <api_key>`. The dependency resolves
the Org or raises 401. Endpoints depend on `current_org` to receive a
detached copy of the Org row (so request handlers don't share a session
with the persistence layer).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .db import get_org_by_api_key, session_scope


@dataclass(frozen=True)
class CurrentOrg:
    id: int
    name: str
    slug: str
    plan: str
    monthly_submission_quota: int


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization must be 'Bearer <api_key>'",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return parts[1].strip()


def current_org(
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentOrg:
    token = _bearer_token(authorization)
    with session_scope() as session:
        org = get_org_by_api_key(session, token)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return CurrentOrg(
            id=org.id,
            name=org.name,
            slug=org.slug,
            plan=org.plan,
            monthly_submission_quota=org.monthly_submission_quota,
        )
