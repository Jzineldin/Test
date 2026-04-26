"""FastAPI app - HTTP surface for the triage agent.

Auth: every triage/history endpoint requires `Authorization: Bearer <key>`.
The demo seed creates one Org with a well-known key (see /me to fetch it).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from fastapi import Request

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .agent import load_carriers, triage_submission
from .auth import CurrentOrg, current_org
from .billing import current_period_usage, get_client as get_billing_client
from .limits import limiter
from .db import (
    create_org,
    delete_carrier,
    ensure_demo_org,
    get_draft,
    get_triage_run,
    init_db,
    list_audit_events,
    list_carrier_payloads,
    list_triage_runs,
    mark_draft_sent,
    record_audit_event,
    record_quote_reply,
    save_triage_run,
    seed_default_carriers,
    session_scope,
    set_draft_outcome,
    slugify_org_name,
    upsert_carrier_payload,
)
from .db.models import User as UserRow
from .email import get_client as get_email_client
from .llm import get_client
from .logging import configure_logging
from .models import Carrier, Submission, TriageResult
from .notifications import Notification, get_client_for_url
from .parsers.base import DocAiParser
from .reports import by_carrier, summarize
from .webhook_auth import verify_signature
from .magic_link import (
    COOKIE_NAME,
    SESSION_TTL,
    consume_magic_link,
    create_session,
    get_user_by_email,
    issue_magic_link,
    revoke_session,
)

CARRIERS_DIR = Path(os.environ.get(
    "CARRIERS_DIR",
    Path(__file__).resolve().parents[2] / "data" / "carriers",
))

configure_logging()
logger = logging.getLogger("submission_triage")

def _init_sentry() -> None:
    """Activate Sentry only when SENTRY_DSN is set. Safe to import in dev
    or test environments - no DSN means no init, no network traffic."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk  # noqa: PLC0415
        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("RENDER_GIT_BRANCH", "production"),
            release=os.environ.get("RENDER_GIT_COMMIT", "")[:12] or None,
            traces_sample_rate=float(
                os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")
            ),
            send_default_pii=False,  # we send underwriting data - never log it
        )
    except Exception:
        # Sentry failing to init must never block app boot.
        logging.getLogger(__name__).exception("sentry.init_failed")


_init_sentry()

app = FastAPI(title="Submission Triage Agent", version="0.5.0")

# slowapi: per-key/per-IP throttling. Specific routes can override with
# the @limiter.limit decorator below.
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
def _ratelimit_response(request, exc: RateLimitExceeded):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    with session_scope() as session:
        ensure_demo_org(session)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/version")
def version() -> dict[str, Any]:
    """Public build/version metadata. Useful for status pages, cache
    busting, and answering "is the deploy I'm looking at the latest?"
    Pulls from env vars Render injects on each deploy."""
    return {
        "git_sha": os.environ.get("RENDER_GIT_COMMIT", "dev")[:12],
        "branch": os.environ.get("RENDER_GIT_BRANCH", "local"),
        "service": os.environ.get("RENDER_SERVICE_NAME", "submission-triage-api"),
        "started_at": _STARTED_AT.isoformat(),
        "stripe": "live" if os.environ.get("STRIPE_SECRET_KEY", "").startswith("sk_live_")
            else ("test" if os.environ.get("STRIPE_SECRET_KEY") else "stub"),
        "ses": "live" if os.environ.get("SES_FROM_ADDRESS") else "stub",
        "docai": "live" if os.environ.get("DOCAI_PROCESSOR_ID") else "stub",
        "llm": (
            "bedrock" if os.environ.get("AWS_ACCESS_KEY_ID")
            else "anthropic" if os.environ.get("ANTHROPIC_API_KEY")
            else "stub"
        ),
    }


_STARTED_AT = datetime.now(timezone.utc)


# ---- Magic-link auth -------------------------------------------------------

class SignupRequest(BaseModel):
    email: str
    name: str
    company_name: str


@app.post("/auth/signup", status_code=204)
def auth_signup(body: SignupRequest) -> None:
    """Create a new Org + admin User, then mail a magic-link.

    Idempotent on email: if the address is already registered we just
    send a login link to the existing user, so users who hit signup
    twice don't end up with duplicate orgs.
    """
    email = body.email.strip().lower()
    with session_scope() as session:
        existing = get_user_by_email(session, email)
        if existing is None:
            slug = slugify_org_name(session, body.company_name)
            org = create_org(session, name=body.company_name.strip(), slug=slug)
            user = UserRow(
                org_id=org.id,
                email=email,
                name=body.name.strip() or None,
                role="admin",
            )
            session.add(user)
            session.flush()
            # Seed the new org with the bundled sample carriers so their
            # first triage produces matches without requiring them to
            # configure carriers first.
            samples = [
                c.model_dump(mode="json") for c in load_carriers(CARRIERS_DIR)
            ]
            if samples:
                seed_default_carriers(session, org_id=org.id, payloads=samples)
        else:
            user = existing
        token = issue_magic_link(session, user)
        user_email = user.email
        user_name = user.name

    base = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
    link = f"{base}/login/verify?token={token}"
    email_client = get_email_client()
    email_client.send(
        to=user_email,
        subject="Welcome to AppetiteMatch - confirm your email",
        body=(
            f"Hi {user_name or user_email.split('@')[0]},\n\n"
            f"Click below to finish setting up your account. Link expires in 15 minutes.\n\n"
            f"{link}\n\n"
            "If you didn't request this, ignore the email.\n"
        ),
    )
    return None


class LoginRequest(BaseModel):
    email: str


@app.post("/auth/login", status_code=204)
def auth_login(body: LoginRequest) -> None:
    """Mail a magic-link to `email` if it belongs to a user.

    Always returns 204 - never leak which emails are registered. The
    actual email send goes through the configured EmailClient; with no
    SES creds set, the link lands in the in-memory stub outbox so devs
    can grep for it.
    """
    with session_scope() as session:
        user = get_user_by_email(session, body.email)
        if user is None:
            return None
        token = issue_magic_link(session, user)

    base = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
    link = f"{base}/login/verify?token={token}"
    email_client = get_email_client()
    email_client.send(
        to=user.email,
        subject="Your Submission Triage login link",
        body=(
            f"Hi {user.name or user.email.split('@')[0]},\n\n"
            f"Click below to sign in. Link expires in 15 minutes.\n\n"
            f"{link}\n\n"
            "If you didn't request this, ignore the email.\n"
        ),
    )
    return None


class VerifyRequest(BaseModel):
    token: str


class VerifyResponse(BaseModel):
    user_id: int
    user_email: str
    org_slug: str


@app.post("/auth/verify", response_model=VerifyResponse)
def auth_verify(body: VerifyRequest, response: "Response") -> VerifyResponse:
    """Exchange a magic-link token for a session cookie."""
    with session_scope() as session:
        user = consume_magic_link(session, body.token)
        if user is None:
            raise HTTPException(401, detail="Invalid or expired link")
        secret = create_session(session, user)
        from .db.models import Org as OrgRow
        org = session.get(OrgRow, user.org_id)
        org_slug = org.slug if org else ""
        user_id = user.id
        user_email = user.email

    cookie_secure = os.environ.get("COOKIE_SECURE", "false").lower() == "true"
    # Cross-site cookie (dashboard on appetitematch.com → api on
    # onrender.com) requires SameSite=None + Secure. Fall back to Lax
    # locally so dev over plain HTTP still works.
    response.set_cookie(
        key=COOKIE_NAME,
        value=secret,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="none" if cookie_secure else "lax",
        secure=cookie_secure,
    )
    return VerifyResponse(user_id=user_id, user_email=user_email, org_slug=org_slug)


@app.post("/auth/logout", status_code=204)
def auth_logout(
    response: "Response",
    triage_session: str | None = Cookie(default=None),
) -> None:
    if triage_session:
        with session_scope() as session:
            revoke_session(session, triage_session)
    response.delete_cookie(COOKIE_NAME)
    return None


@app.get("/me")
def me(org: CurrentOrg = Depends(current_org)) -> dict[str, Any]:
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        return {
            "org_id": org.id,
            "org_name": org.name,
            "slug": org.slug,
            "plan": org.plan,
            "monthly_submission_quota": org.monthly_submission_quota,
            "notification_webhook_url": row.notification_webhook_url,
            "forward_inbox_address": row.forward_inbox_address,
            "email_signature": row.email_signature,
            "webhook_secret": row.webhook_secret,
            "user_role": org.user_role,
        }


class OrgSettings(BaseModel):
    """All fields optional - omitted ones are left untouched."""
    name: str | None = None
    notification_webhook_url: str | None = None
    forward_inbox_address: str | None = None
    email_signature: str | None = None


@app.patch("/me")
def update_settings(
    body: OrgSettings, org: CurrentOrg = Depends(current_org),
) -> dict[str, Any]:
    """Org-level settings update - webhook URL, inbox alias, display name."""
    _require_admin(org)
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        changes: dict[str, Any] = {}
        if body.name is not None and body.name != row.name:
            changes["name"] = body.name
            row.name = body.name
        if body.notification_webhook_url is not None:
            changes["notification_webhook_url"] = bool(body.notification_webhook_url)
            row.notification_webhook_url = body.notification_webhook_url or None
        if body.forward_inbox_address is not None:
            changes["forward_inbox_address"] = body.forward_inbox_address
            row.forward_inbox_address = body.forward_inbox_address or None
        if body.email_signature is not None:
            changes["email_signature"] = bool(body.email_signature)
            row.email_signature = body.email_signature or None
        if changes:
            record_audit_event(
                session, org_id=org.id, event_type="settings.updated",
                details=changes,
            )
        return {
            "name": row.name,
            "notification_webhook_url": row.notification_webhook_url,
            "forward_inbox_address": row.forward_inbox_address,
            "email_signature": row.email_signature,
        }


@app.get("/me/api-key")
def get_api_key(org: CurrentOrg = Depends(current_org)) -> dict[str, str]:
    """Return the org's bearer API key - required for the Slack/curl path.
    Cookie auth gates the call so the key never appears in URL params."""
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        return {"api_key": row.api_key}


def _require_admin(org: CurrentOrg) -> None:
    """Admin-gated routes: invite, remove, plan changes. API-key callers
    are treated as admin (machine-to-machine bearer is full-trust by
    design); cookie callers must be users with role='admin'."""
    if org.user_id is None:
        return  # API-key auth: trusted machine integration
    if org.user_role != "admin":
        raise HTTPException(403, detail="Admin role required")


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    role: str
    created_at: datetime
    last_login_at: datetime | None


@app.get("/me/users", response_model=list[UserOut])
def list_users(org: CurrentOrg = Depends(current_org)) -> list[UserOut]:
    """Every user inside the caller's org (admins + CSRs)."""
    with session_scope() as session:
        from .db.models import User as UserRow
        from sqlalchemy import select
        rows = session.execute(
            select(UserRow).where(UserRow.org_id == org.id).order_by(UserRow.id)
        ).scalars().all()
        return [
            UserOut(
                id=u.id, email=u.email, name=u.name, role=u.role,
                created_at=u.created_at, last_login_at=u.last_login_at,
            )
            for u in rows
        ]


class InviteRequest(BaseModel):
    email: str
    name: str | None = None
    role: str = "csr"  # 'admin' | 'csr'


@app.post("/me/invite", response_model=UserOut, status_code=201)
def invite_user(
    body: InviteRequest, org: CurrentOrg = Depends(current_org),
) -> UserOut:
    """Add a teammate to the calling org and mail them a sign-in link.

    Idempotent on email - re-inviting an existing user just sends a fresh
    magic link instead of erroring or creating a duplicate row."""
    _require_admin(org)
    if body.role not in {"admin", "csr"}:
        raise HTTPException(400, detail="role must be 'admin' or 'csr'")
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, detail="valid email required")

    with session_scope() as session:
        from .db.models import User as UserRow
        existing = get_user_by_email(session, email)
        if existing is not None:
            if existing.org_id != org.id:
                raise HTTPException(
                    409,
                    detail="Email already belongs to a different org",
                )
            user = existing
        else:
            user = UserRow(
                org_id=org.id, email=email,
                name=(body.name or "").strip() or None,
                role=body.role,
            )
            session.add(user)
            session.flush()

        token = issue_magic_link(session, user)
        record_audit_event(
            session, org_id=org.id, event_type="user.invited",
            target_id=str(user.id),
            details={"email": email, "role": body.role},
        )
        out = UserOut(
            id=user.id, email=user.email, name=user.name, role=user.role,
            created_at=user.created_at, last_login_at=user.last_login_at,
        )

    base = os.environ.get("DASHBOARD_URL", "http://localhost:3000")
    link = f"{base}/login/verify?token={token}"
    email_client = get_email_client()
    email_client.send(
        to=email,
        subject=f"You've been invited to {org.name} on AppetiteMatch",
        body=(
            f"Hi {body.name or email.split('@')[0]},\n\n"
            f"You've been invited to join {org.name}'s submission triage workspace.\n\n"
            f"Click below to sign in. Link expires in 15 minutes.\n\n"
            f"{link}\n\n"
            "If you weren't expecting this, ignore the email.\n"
        ),
    )
    return out


@app.delete("/me/users/{user_id}", status_code=204)
def remove_user(
    user_id: int, org: CurrentOrg = Depends(current_org),
) -> None:
    """Remove a user from the org. Admin-only. Refuses to remove the last
    admin - there must always be someone who can manage the account."""
    _require_admin(org)
    with session_scope() as session:
        from .db.models import User as UserRow
        from sqlalchemy import select
        target = session.get(UserRow, user_id)
        if target is None or target.org_id != org.id:
            raise HTTPException(404, detail="User not found in this org")
        if target.role == "admin":
            admin_count = session.execute(
                select(UserRow).where(
                    UserRow.org_id == org.id, UserRow.role == "admin",
                )
            ).scalars().all()
            if len(admin_count) <= 1:
                raise HTTPException(
                    409,
                    detail="Can't remove the last admin",
                )
        session.delete(target)
        record_audit_event(
            session, org_id=org.id, event_type="user.removed",
            target_id=str(user_id),
        )
    return None


@app.post("/me/api-key/rotate")
def rotate_api_key(org: CurrentOrg = Depends(current_org)) -> dict[str, str]:
    """Mint a new bearer key, invalidating the old one immediately.
    Returns the new key in the body - never logged, never echoed back."""
    _require_admin(org)
    from .db import generate_api_key
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        new_key = generate_api_key()
        row.api_key = new_key
        record_audit_event(
            session, org_id=org.id, event_type="api_key.rotated",
        )
        return {"api_key": new_key}


@app.post("/me/webhook-secret/rotate")
def rotate_webhook_secret(org: CurrentOrg = Depends(current_org)) -> dict[str, str]:
    """Mint a new HMAC secret for /webhooks/inbound and /webhooks/email.
    The Lambda forwarder must be updated with the new value before the
    next inbound email arrives, otherwise signature verification will 401."""
    _require_admin(org)
    from .db.orgs import generate_webhook_secret
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        new_secret = generate_webhook_secret()
        row.webhook_secret = new_secret
        record_audit_event(
            session, org_id=org.id, event_type="webhook_secret.rotated",
        )
        return {"webhook_secret": new_secret}


def _org_carriers(org_id: int) -> list[Carrier]:
    """Read carriers for an org, seeding the bundled samples on first call.

    A brand-new org has no carriers yet - without seeding, their first
    triage would return 'no carriers passed prefilter' and the demo
    falls flat. Seeding once at first read is idempotent and only
    runs against orgs that haven't customized anything."""
    with session_scope() as session:
        payloads = list_carrier_payloads(session, org_id=org_id)
        if not payloads:
            samples = [
                c.model_dump(mode="json") for c in load_carriers(CARRIERS_DIR)
            ]
            if samples:
                seed_default_carriers(session, org_id=org_id, payloads=samples)
                payloads = samples
    return [Carrier.model_validate(p) for p in payloads]


@app.get("/carriers", response_model=list[Carrier])
def list_carriers(org: CurrentOrg = Depends(current_org)) -> list[Carrier]:
    return _org_carriers(org.id)


@app.post("/carriers", response_model=Carrier, status_code=201)
def upsert_carrier(
    carrier: Carrier, org: CurrentOrg = Depends(current_org),
) -> Carrier:
    """Create or update a carrier in the caller's org-scoped directory.

    Persisted to the DB so it survives Render restarts; scoped by
    org_id so brokerages don't leak appetite into each other."""
    _require_admin(org)
    payload = carrier.model_dump(mode="json")
    with session_scope() as session:
        upsert_carrier_payload(
            session, org_id=org.id,
            carrier_id=carrier.carrier_id, payload=payload,
        )
        record_audit_event(
            session, org_id=org.id, event_type="carrier.upsert",
            target_id=carrier.carrier_id,
        )
    return carrier


class BulkCarriersResponse(BaseModel):
    created: int
    updated: int
    failed: list[dict[str, str]]


@app.post("/carriers/bulk", response_model=BulkCarriersResponse, status_code=200)
def bulk_upsert_carriers(
    body: list[Carrier], org: CurrentOrg = Depends(current_org),
) -> BulkCarriersResponse:
    """Batch upsert N carriers in one call. Used by the dashboard's CSV
    import flow so a broker pasting 25 markets doesn't fire 25 round
    trips. Per-row errors are collected and returned, not raised - partial
    success is the common case (typo in one row shouldn't block the rest)."""
    _require_admin(org)
    created = 0
    updated = 0
    failed: list[dict[str, str]] = []
    with session_scope() as session:
        existing_ids = {
            r["carrier_id"] for r in (
                {"carrier_id": p.get("carrier_id")}
                for p in list_carrier_payloads(session, org_id=org.id)
            ) if r.get("carrier_id")
        }
        for c in body:
            try:
                upsert_carrier_payload(
                    session, org_id=org.id,
                    carrier_id=c.carrier_id,
                    payload=c.model_dump(mode="json"),
                )
                if c.carrier_id in existing_ids:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                failed.append({"carrier_id": c.carrier_id, "error": str(e)})
        record_audit_event(
            session, org_id=org.id, event_type="carrier.bulk_upsert",
            details={"created": created, "updated": updated, "failed": len(failed)},
        )
    return BulkCarriersResponse(created=created, updated=updated, failed=failed)


@app.delete("/carriers/{carrier_id}", status_code=204)
def delete_carrier_endpoint(
    carrier_id: str, org: CurrentOrg = Depends(current_org),
) -> None:
    _require_admin(org)
    with session_scope() as session:
        if not delete_carrier(session, org_id=org.id, carrier_id=carrier_id):
            raise HTTPException(404, detail=f"Carrier {carrier_id!r} not found")
        record_audit_event(
            session, org_id=org.id, event_type="carrier.delete",
            target_id=carrier_id,
        )
    return None


def _carriers_or_503(org_id: int) -> list[Carrier]:
    carriers = _org_carriers(org_id)
    if not carriers:
        raise HTTPException(503, detail="No carrier appetite guides loaded")
    return carriers


def _broker_profile(org_id: int) -> dict:
    """Snapshot of org info the email drafter uses to fill in the
    signature. Pulled fresh each triage so a name change in Settings
    shows up on the next draft."""
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org_id)
        if row is None:
            return {}
        return {
            "brokerage_name": row.name,
            "contact_email": (row.forward_inbox_address or "").strip() or None,
            "email_signature": (row.email_signature or "").strip() or None,
        }


def _run_and_persist(
    submission: Submission,
    org_id: int,
    *,
    attachments: list[str] | None = None,
    submission_pdf: bytes | None = None,
    submission_pdf_filename: str | None = None,
) -> TriageResult:
    result = triage_submission(
        submission, _carriers_or_503(org_id),
        llm=get_client(),
        broker_profile=_broker_profile(org_id),
        attachments=attachments,
    )
    notify_url: str | None = None
    with session_scope() as session:
        run = save_triage_run(
            session, submission, result, org_id=org_id,
            submission_pdf=submission_pdf,
            submission_pdf_filename=submission_pdf_filename,
        )
        # Echo back the persisted draft ids so the dashboard can call
        # /drafts/{id}/send without re-querying.
        by_carrier = {d.carrier_id: d.id for d in run.drafts}
        for d in result.drafted_emails:
            d.id = by_carrier.get(d.carrier_id)
        record_audit_event(
            session, org_id=org_id, event_type="triage.run",
            target_id=str(run.id),
            details={
                "insured": submission.insured.legal_name,
                "match_count": len(result.matches),
                "draft_count": len(result.drafted_emails),
            },
        )
        logger.info(
            "triage.completed",
            extra={
                "org_id": org_id,
                "submission_id": result.submission_id,
                "insured": submission.insured.legal_name,
                "match_count": len(result.matches),
                "draft_count": len(result.drafted_emails),
            },
        )
        from .db.models import Org as OrgRow
        org_row = session.get(OrgRow, org_id)
        notify_url = (org_row.notification_webhook_url or "").strip() or None

    # Fire-and-forget Slack/Discord/Teams notification *outside* the DB tx so
    # a flaky webhook never rolls back persisted triage state.
    if notify_url and result.drafted_emails:
        client = get_client_for_url(notify_url)
        if client is not None:
            top = result.drafted_emails[0]
            top_score = next(
                (m.score for m in result.matches if m.carrier_id == top.carrier_id),
                None,
            )
            client.send(Notification(
                title=f"New submission triaged - {submission.insured.legal_name}",
                body=(
                    f"State: {submission.insured.primary_state} · "
                    f"NAICS: {submission.insured.naics or '?'} · "
                    f"{len(result.matches)} carriers scored, "
                    f"{len(result.drafted_emails)} drafts ready"
                ),
                fields={
                    "Top match": f"{top.carrier_id}"
                    + (f" · {top_score:.2f}" if top_score is not None else ""),
                    "Submission": result.submission_id,
                },
            ))
    return result


_TRIAGE_RATE = os.environ.get("RATE_LIMIT_TRIAGE", "30/minute")
_INBOUND_RATE = os.environ.get("RATE_LIMIT_INBOUND", "300/minute")


@app.post("/triage", response_model=TriageResult)
@limiter.limit(_TRIAGE_RATE)
def triage(
    request: Request,
    submission: Submission,
    org: CurrentOrg = Depends(current_org),
) -> TriageResult:
    return _run_and_persist(submission, org_id=org.id)


class BulkTriageItem(BaseModel):
    submission_id: str
    status: str  # 'ok' | 'error'
    result: TriageResult | None = None
    error: str | None = None


class BulkTriageResponse(BaseModel):
    items: list[BulkTriageItem]
    ok_count: int
    error_count: int


_BULK_MAX = 50


@app.post("/triage/bulk", response_model=BulkTriageResponse)
@limiter.limit(_TRIAGE_RATE)
def triage_bulk(
    request: Request,
    submissions: list[Submission],
    org: CurrentOrg = Depends(current_org),
) -> BulkTriageResponse:
    """Run triage on N submissions in one request (admin-only - bulk
    bypasses our normal rate-limiter assumptions, so we keep it
    behind admin role for cookie-authed users)."""
    _require_admin(org)
    """Run triage on N submissions in one request.

    Sequential - Claude has rate limits and we don't want one slow LLM
    call to block the whole batch's failure path. Each submission gets
    its own try/except so a bad row doesn't kill the whole batch."""
    if len(submissions) > _BULK_MAX:
        raise HTTPException(
            413, detail=f"Too many submissions; max {_BULK_MAX} per call",
        )
    items: list[BulkTriageItem] = []
    ok = 0
    err = 0
    for s in submissions:
        try:
            result = _run_and_persist(s, org_id=org.id)
            items.append(BulkTriageItem(
                submission_id=s.submission_id,
                status="ok",
                result=result,
            ))
            ok += 1
        except Exception as e:
            items.append(BulkTriageItem(
                submission_id=s.submission_id,
                status="error",
                error=str(e),
            ))
            err += 1
    return BulkTriageResponse(items=items, ok_count=ok, error_count=err)


@app.post("/triage/upload", response_model=TriageResult)
@limiter.limit(_TRIAGE_RATE)
async def triage_upload(
    request: Request,
    file: UploadFile = File(...),
    org: CurrentOrg = Depends(current_org),
) -> TriageResult:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(415, detail=f"Unsupported content type: {file.content_type}")
    pdf_bytes = await file.read()
    try:
        submission = DocAiParser().parse_bytes(pdf_bytes)
    except RuntimeError as e:
        raise HTTPException(503, detail=str(e)) from e
    # The original PDF the broker uploaded is what they'd actually want
    # forwarded to carriers. Stash the bytes on the run so /drafts/{id}/send
    # can attach them, and reference the filename in the cover email.
    filename = file.filename or "submission.pdf"
    return _run_and_persist(
        submission, org_id=org.id,
        attachments=[filename],
        submission_pdf=pdf_bytes,
        submission_pdf_filename=filename,
    )


# ---- History ---------------------------------------------------------------

class TriageRunSummary(BaseModel):
    id: int
    submission_id: str
    insured_name: str
    primary_state: str
    match_count: int
    draft_count: int
    created_at: datetime


class TriageRunDetail(TriageRunSummary):
    summary: str
    submission_json: dict[str, Any]
    result: TriageResult


@app.get("/history", response_model=list[TriageRunSummary])
def history(
    limit: int = 50,
    insured: str | None = None,
    state: str | None = None,
    since: datetime | None = None,
    carrier_id: str | None = None,
    org: CurrentOrg = Depends(current_org),
) -> list[TriageRunSummary]:
    with session_scope() as session:
        runs = list_triage_runs(
            session,
            org_id=org.id,
            limit=limit,
            insured_search=insured,
            state=state,
            since=since,
            carrier_id=carrier_id,
        )
        return [
            TriageRunSummary(
                id=r.id,
                submission_id=r.submission_id,
                insured_name=r.insured_name,
                primary_state=r.primary_state,
                match_count=len(r.matches),
                draft_count=len(r.drafts),
                created_at=r.created_at,
            )
            for r in runs
        ]


class AuditEventOut(BaseModel):
    id: int
    event_type: str
    actor: str
    target_id: str | None
    details: dict[str, Any]
    created_at: datetime


@app.get("/audit", response_model=list[AuditEventOut])
def audit(
    limit: int = 100, org: CurrentOrg = Depends(current_org),
) -> list[AuditEventOut]:
    with session_scope() as session:
        rows = list_audit_events(session, org_id=org.id, limit=limit)
        return [
            AuditEventOut(
                id=r.id,
                event_type=r.event_type,
                actor=r.actor,
                target_id=r.target_id,
                details=r.details or {},
                created_at=r.created_at,
            )
            for r in rows
        ]


@app.get("/audit/export.csv")
def audit_export_csv(org: CurrentOrg = Depends(current_org)):
    """Stream the audit log as CSV - SOC 2 evidence collection."""
    import csv
    import io
    import json as _json

    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "created_at", "event_type", "actor", "target_id", "details"])
    with session_scope() as session:
        for r in list_audit_events(session, org_id=org.id, limit=10_000):
            writer.writerow([
                r.id,
                r.created_at.isoformat() if r.created_at else "",
                r.event_type,
                r.actor or "",
                r.target_id or "",
                _json.dumps(r.details or {}, separators=(",", ":")),
            ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="audit-{org.slug}.csv"'
            ),
        },
    )


class DraftStatus(BaseModel):
    id: int
    carrier_id: str
    to: str
    subject: str
    body: str
    attachments: list[str]
    sent_at: datetime | None
    provider_message_id: str | None
    quote_replied_at: datetime | None
    quote_reply_body: str | None
    outcome: str | None
    outcome_set_at: datetime | None
    bound_premium_cents: int | None


def _draft_to_status(draft) -> DraftStatus:
    return DraftStatus(
        id=draft.id,
        carrier_id=draft.carrier_id,
        to=draft.to,
        subject=draft.subject,
        body=draft.body,
        attachments=list(draft.attachments),
        sent_at=draft.sent_at,
        provider_message_id=draft.provider_message_id,
        quote_replied_at=draft.quote_replied_at,
        quote_reply_body=draft.quote_reply_body,
        outcome=draft.outcome,
        outcome_set_at=draft.outcome_set_at,
        bound_premium_cents=draft.bound_premium_cents,
    )


@app.post("/drafts/{draft_id}/send", response_model=DraftStatus)
def send_draft(
    draft_id: int, org: CurrentOrg = Depends(current_org),
) -> DraftStatus:
    """Send a drafted carrier email via the configured email provider.

    With SES_FROM_ADDRESS set this hits AWS SES. Otherwise it lands in
    the in-memory stub outbox so local dev works end-to-end.
    """
    with session_scope() as session:
        draft = get_draft(session, draft_id, org_id=org.id)
        if draft is None:
            raise HTTPException(404, detail=f"Draft {draft_id} not found")
        from .email import Attachment
        from .db.models import TriageRun
        run = session.get(TriageRun, draft.run_id)
        ses_attachments: list[Attachment] = []
        if run and run.submission_pdf and run.submission_pdf_filename:
            ses_attachments.append(Attachment(
                filename=run.submission_pdf_filename,
                content=run.submission_pdf,
                content_type="application/pdf",
            ))
        client = get_email_client()
        sent = client.send(
            to=draft.to,
            subject=draft.subject,
            body=draft.body,
            attachments=ses_attachments or None,
        )
        mark_draft_sent(draft, provider_message_id=sent.provider_message_id)
        record_audit_event(
            session, org_id=org.id, event_type="draft.sent",
            target_id=str(draft.id),
            details={
                "to": draft.to, "carrier_id": draft.carrier_id,
                "attachment_count": sent.attachment_count,
            },
        )
        return _draft_to_status(draft)


@app.get("/drafts/{draft_id}", response_model=DraftStatus)
def get_draft_status(
    draft_id: int, org: CurrentOrg = Depends(current_org),
) -> DraftStatus:
    with session_scope() as session:
        draft = get_draft(session, draft_id, org_id=org.id)
        if draft is None:
            raise HTTPException(404, detail=f"Draft {draft_id} not found")
        return _draft_to_status(draft)


class DraftEdit(BaseModel):
    """Subject/body/to overrides. Any field set here replaces the agent's
    suggestion; omitted fields are left as-is."""
    subject: str | None = None
    body: str | None = None
    to: str | None = None


@app.patch("/drafts/{draft_id}", response_model=DraftStatus)
def edit_draft(
    draft_id: int,
    body: DraftEdit,
    org: CurrentOrg = Depends(current_org),
) -> DraftStatus:
    """Broker tweaks the LLM-drafted email before sending.

    No-op once the draft is sent - drafts are immutable post-send so the
    audit trail matches what actually went on the wire.
    """
    with session_scope() as session:
        draft = get_draft(session, draft_id, org_id=org.id)
        if draft is None:
            raise HTTPException(404, detail=f"Draft {draft_id} not found")
        if draft.sent_at is not None:
            raise HTTPException(409, detail="Cannot edit a draft after it has been sent")
        changed: dict[str, Any] = {}
        if body.subject is not None and body.subject != draft.subject:
            changed["subject"] = True
            draft.subject = body.subject
        if body.body is not None and body.body != draft.body:
            changed["body"] = True
            draft.body = body.body
        if body.to is not None and body.to != draft.to:
            changed["to"] = body.to
            draft.to = body.to
        if changed:
            record_audit_event(
                session, org_id=org.id, event_type="draft.edited",
                target_id=str(draft.id), details=changed,
            )
        return _draft_to_status(draft)


class InboundReply(BaseModel):
    """Webhook payload for inbound quote replies.

    Postmark-style; SES Inbound's SNS payload is converted to this shape
    by an upstream Lambda we'll add in iter 8 once SES Inbound is live.
    """
    provider_message_id: str
    body: str


class InboundAttachment(BaseModel):
    filename: str
    content_type: str | None = None
    content_base64: str


class InboundEmail(BaseModel):
    """Forwarded retail-agent email landing in our inbound webhook.

    Mirrors Postmark's inbound JSON shape. SES Inbound delivers an SNS
    notification with an S3 pointer; an upstream Lambda is responsible
    for fetching the raw email and converting it to this shape.
    """
    to: str  # the org's forward_inbox_address (e.g. triage+demo@yourdomain.com)
    from_address: str
    subject: str | None = None
    body: str | None = None
    attachments: list[InboundAttachment] = []


@app.post("/webhooks/inbound", response_model=DraftStatus | None)
async def inbound_reply(request: Request) -> DraftStatus | None:
    """Match an inbound reply to the originating draft and record it.

    Public endpoint (no auth) because email providers can't carry an API
    key - instead, payloads must be HMAC-signed with the org's
    webhook_secret. Replies that don't match a draft are silently
    dropped (returns null).
    """
    raw = await request.body()
    signature = request.headers.get("x-triage-signature")
    try:
        payload = InboundReply.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(400, detail=f"Invalid JSON: {e}") from e

    notify_payload: tuple[str, Notification] | None = None
    with session_scope() as session:
        # Lookup the draft FIRST so we can fetch the org's webhook_secret
        # before recording anything. Wrong signature -> 401 with no
        # side effects.
        from sqlalchemy import select
        from .db.models import DraftedEmailRow, Org as OrgRow, TriageRun

        row = session.execute(
            select(DraftedEmailRow, OrgRow)
            .join(TriageRun, DraftedEmailRow.run_id == TriageRun.id)
            .join(OrgRow, TriageRun.org_id == OrgRow.id)
            .where(DraftedEmailRow.provider_message_id == payload.provider_message_id)
        ).one_or_none()
        if row is None:
            return None
        draft_row, org_row = row
        verify_signature(
            secret=org_row.webhook_secret, body=raw, header=signature,
        )

        draft = record_quote_reply(
            session,
            provider_message_id=payload.provider_message_id,
            body=payload.body,
        )
        if draft is None:
            return None
        run = draft.run
        org = run.org
        webhook_url = org.notification_webhook_url
        status = _draft_to_status(draft)
        if webhook_url:
            notify_payload = (
                webhook_url,
                Notification(
                    title=f"Quote received from {draft.carrier_id}",
                    body=f"Insured: *{run.insured_name}* ({run.primary_state})",
                    fields={
                        "Carrier": draft.carrier_id,
                        "Reply preview": (payload.body[:200] + "…") if len(payload.body) > 200 else payload.body,
                    },
                ),
            )

    if notify_payload is not None:
        url, n = notify_payload
        client = get_client_for_url(url)
        if client is not None:
            ok = client.send(n)
            logger.info("notification.sent", extra={"ok": ok, "carrier_id": status.carrier_id})

    return status


class OutcomeUpdate(BaseModel):
    outcome: str  # 'pending' | 'bound' | 'declined'
    bound_premium_cents: int | None = None


@app.post("/drafts/{draft_id}/outcome", response_model=DraftStatus)
def update_outcome(
    draft_id: int,
    body: OutcomeUpdate,
    org: CurrentOrg = Depends(current_org),
) -> DraftStatus:
    """Broker promotes a 'pending' reply to bound/declined."""
    with session_scope() as session:
        draft = get_draft(session, draft_id, org_id=org.id)
        if draft is None:
            raise HTTPException(404, detail=f"Draft {draft_id} not found")
        try:
            set_draft_outcome(
                draft, outcome=body.outcome,
                bound_premium_cents=body.bound_premium_cents,
            )
        except ValueError as e:
            raise HTTPException(400, detail=str(e)) from e
        record_audit_event(
            session, org_id=org.id, event_type="outcome.set",
            target_id=str(draft.id),
            details={
                "outcome": body.outcome,
                "bound_premium_cents": body.bound_premium_cents,
            },
        )
        return _draft_to_status(draft)


# ---- Reports ---------------------------------------------------------------

class ReportPayload(BaseModel):
    period_start: datetime
    period_end: datetime
    submissions_triaged: int
    drafts_sent: int
    drafts_replied: int
    drafts_bound: int
    drafts_declined: int
    quote_back_rate: float
    bind_rate: float
    avg_hours_to_quote: float | None
    bound_premium_dollars: float


@app.get("/reports/summary", response_model=ReportPayload)
def reports_summary(org: CurrentOrg = Depends(current_org)) -> ReportPayload:
    with session_scope() as session:
        s = summarize(session, org_id=org.id)
    return ReportPayload(**s.__dict__)


class CarrierStatsOut(BaseModel):
    carrier_id: str
    drafts_sent: int
    drafts_replied: int
    drafts_bound: int
    drafts_declined: int
    quote_back_rate: float
    bind_rate: float
    avg_hours_to_quote: float | None
    bound_premium_dollars: float


@app.get("/reports/by-carrier", response_model=list[CarrierStatsOut])
def reports_by_carrier(
    org: CurrentOrg = Depends(current_org),
) -> list[CarrierStatsOut]:
    """Per-carrier breakdown of sent/replied/bound metrics for the period."""
    with session_scope() as session:
        rows = by_carrier(session, org_id=org.id)
    return [CarrierStatsOut(**r.__dict__) for r in rows]


class DigestItem(BaseModel):
    kind: str  # 'reply' | 'bound' | 'declined'
    draft_id: int
    carrier_id: str
    insured_name: str
    when: datetime
    summary: str


@app.get("/reports/digest", response_model=list[DigestItem])
def reports_digest(
    since: datetime | None = None,
    org: CurrentOrg = Depends(current_org),
) -> list[DigestItem]:
    """What changed since `since` - for brokers who don't keep the
    dashboard open. Returns new replies + outcome promotions.

    Default `since`: 24 hours ago.
    """
    from datetime import timedelta, timezone
    from .db.models import DraftedEmailRow, TriageRun

    cutoff = since or (datetime.now(timezone.utc) - timedelta(hours=24))
    # SQLite drops tz on roundtrip; normalize cutoff to naive UTC so the
    # comparison is total-ordered regardless of storage backend.
    cutoff_naive = cutoff.replace(tzinfo=None) if cutoff.tzinfo else cutoff
    items: list[DigestItem] = []
    with session_scope() as session:
        from sqlalchemy import select
        stmt = (
            select(DraftedEmailRow, TriageRun)
            .join(TriageRun, DraftedEmailRow.run_id == TriageRun.id)
            .where(TriageRun.org_id == org.id)
        )
        for draft, run in session.execute(stmt).all():
            replied = draft.quote_replied_at
            replied_naive = replied.replace(tzinfo=None) if replied and replied.tzinfo else replied
            if replied_naive and replied_naive >= cutoff_naive:
                items.append(DigestItem(
                    kind="reply",
                    draft_id=draft.id,
                    carrier_id=draft.carrier_id,
                    insured_name=run.insured_name,
                    when=draft.quote_replied_at,
                    summary=(draft.quote_reply_body or "")[:200],
                ))
            outcome_at = draft.outcome_set_at
            outcome_naive = (
                outcome_at.replace(tzinfo=None)
                if outcome_at and outcome_at.tzinfo else outcome_at
            )
            if (
                draft.outcome in {"bound", "declined"}
                and outcome_naive
                and outcome_naive >= cutoff_naive
            ):
                items.append(DigestItem(
                    kind=draft.outcome,
                    draft_id=draft.id,
                    carrier_id=draft.carrier_id,
                    insured_name=run.insured_name,
                    when=draft.outcome_set_at,
                    summary=(
                        f"${(draft.bound_premium_cents or 0) / 100:,.0f} bound"
                        if draft.outcome == "bound" else "declined"
                    ),
                ))
    items.sort(key=lambda i: i.when, reverse=True)
    return items


@app.post("/webhooks/email", response_model=TriageResult | dict)
async def inbound_email(request: Request) -> TriageResult | dict:
    """A forwarded retail-agent email lands here, ACORD attached.

    Public endpoint (no API key) - caller must HMAC-sign the body with
    the destination org's webhook_secret. We resolve the org via the
    `to` field, so the body is parsed once before the signature check.
    """
    import base64

    raw = await request.body()
    signature = request.headers.get("x-triage-signature")
    try:
        payload = InboundEmail.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(400, detail=f"Invalid JSON: {e}") from e

    pdfs = [a for a in payload.attachments if (a.content_type or "").lower() == "application/pdf"
            or a.filename.lower().endswith(".pdf")]
    if not pdfs:
        return {"status": "skipped", "reason": "no PDF attached"}

    with session_scope() as session:
        from sqlalchemy import select
        from .db.models import Org as OrgRow
        org_row = session.execute(
            select(OrgRow).where(OrgRow.forward_inbox_address == payload.to)
        ).scalar_one_or_none()
        if org_row is None:
            logger.info("inbound_email.unmatched", extra={"to": payload.to})
            return {"status": "unmatched", "to": payload.to}
        verify_signature(
            secret=org_row.webhook_secret, body=raw, header=signature,
        )
        org_id = org_row.id

    pdf_bytes = base64.b64decode(pdfs[0].content_base64)
    try:
        submission = DocAiParser().parse_bytes(pdf_bytes)
    except RuntimeError as e:
        logger.warning("inbound_email.docai_unconfigured", extra={"err": str(e)})
        return {"status": "skipped", "reason": "DocAI not configured"}

    submission.retail_agent_email = payload.from_address
    return _run_and_persist(submission, org_id=org_id)


@app.get("/carriers/export.csv")
def carriers_export_csv(org: CurrentOrg = Depends(current_org)):
    """Stream the org's carrier directory as CSV. Round-trip with the
    same header that /carriers/bulk + the dashboard CSV importer accept,
    so an export -> edit-in-Excel -> re-import flow is lossless."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "carrier_id", "name", "submission_email",
        "typical_quote_back_days", "naics_prefixes",
        "states_in", "states_out", "lines",
        "revenue_min", "revenue_max", "notes",
    ])
    for c in _org_carriers(org.id):
        for r in c.appetite or [None]:
            writer.writerow([
                c.carrier_id, c.name, c.submission_email,
                c.typical_quote_back_days,
                ";".join(r.naics_prefixes) if r else "",
                ";".join(r.states_in) if r else "",
                ";".join(r.states_out) if r else "",
                ";".join(l.value for l in r.lines) if r else "",
                str(r.revenue_min) if r and r.revenue_min is not None else "",
                str(r.revenue_max) if r and r.revenue_max is not None else "",
                (r.notes if r else None) or c.notes or "",
            ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="carriers-{org.slug}.csv"'
            ),
        },
    )


@app.get("/history/export.csv")
def history_export_csv(org: CurrentOrg = Depends(current_org)):
    """Stream the period's history as CSV - accounting / leadership reports."""
    import csv
    import io

    from fastapi.responses import StreamingResponse
    from .db.models import DraftedEmailRow, TriageRun

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "run_id", "submission_id", "insured", "state", "created_at",
        "carrier_id", "carrier_email", "subject",
        "sent_at", "replied_at", "outcome", "bound_premium_dollars",
    ])

    with session_scope() as session:
        from sqlalchemy import select
        rows = session.execute(
            select(DraftedEmailRow, TriageRun)
            .join(TriageRun, DraftedEmailRow.run_id == TriageRun.id)
            .where(TriageRun.org_id == org.id)
            .order_by(TriageRun.created_at.desc())
        ).all()
        for draft, run in rows:
            writer.writerow([
                run.id,
                run.submission_id,
                run.insured_name,
                run.primary_state,
                run.created_at.isoformat() if run.created_at else "",
                draft.carrier_id,
                draft.to,
                draft.subject,
                draft.sent_at.isoformat() if draft.sent_at else "",
                draft.quote_replied_at.isoformat() if draft.quote_replied_at else "",
                draft.outcome or "",
                f"{(draft.bound_premium_cents or 0) / 100:.2f}",
            ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="triage-history-{org.slug}.csv"'
            ),
        },
    )


# ---- Billing ---------------------------------------------------------------

class BillingUsage(BaseModel):
    org_id: int
    plan: str
    monthly_submission_quota: int
    submissions_this_period: int
    over_quota: bool


class CheckoutLinkRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


class CheckoutLinkResponse(BaseModel):
    session_id: str
    url: str
    customer_id: str | None


@app.get("/billing/usage", response_model=BillingUsage)
def billing_usage(org: CurrentOrg = Depends(current_org)) -> BillingUsage:
    with session_scope() as session:
        used = current_period_usage(session, org_id=org.id)
    return BillingUsage(
        org_id=org.id,
        plan=org.plan,
        monthly_submission_quota=org.monthly_submission_quota,
        submissions_this_period=used,
        over_quota=used >= org.monthly_submission_quota,
    )


class PortalLinkRequest(BaseModel):
    return_url: str


class PortalLinkResponse(BaseModel):
    url: str


@app.post("/billing/portal-link", response_model=PortalLinkResponse)
def billing_portal_link(
    body: PortalLinkRequest, org: CurrentOrg = Depends(current_org),
) -> PortalLinkResponse:
    """Stripe Customer Portal session for self-serve subscription management.

    The customer can update their card, cancel, view invoices, or download
    receipts - all on Stripe's hosted UI. Requires the org to already have
    a stripe_customer_id (set on first checkout)."""
    with session_scope() as session:
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        if not row.stripe_customer_id or row.stripe_customer_id.startswith("cus_stub_"):
            raise HTTPException(
                400,
                detail="No Stripe customer on file - start a subscription first.",
            )
        customer_id = row.stripe_customer_id

    client = get_billing_client()
    url = client.create_portal_session(
        customer_id=customer_id, return_url=body.return_url,
    )
    return PortalLinkResponse(url=url)


@app.post("/billing/checkout-link", response_model=CheckoutLinkResponse)
def billing_checkout_link(
    body: CheckoutLinkRequest,
    org: CurrentOrg = Depends(current_org),
) -> CheckoutLinkResponse:
    """Create a Stripe Checkout Session and lazily provision the customer.

    Returns a URL the broker can open to start the subscription. Stub
    client returns a deterministic fake URL for local dev.
    """
    client = get_billing_client()
    with session_scope() as session:
        # Refresh the row so we can persist the stripe customer id.
        from .db.models import Org as OrgRow
        row = session.get(OrgRow, org.id)
        # A previously-saved stub id (cus_stub_*) means the org was
        # provisioned before real Stripe was wired up. Recreate it.
        if row.stripe_customer_id is None or row.stripe_customer_id.startswith("cus_stub_"):
            row.stripe_customer_id = client.ensure_customer(
                org_id=row.id, name=row.name, slug=row.slug,
            )
        customer_id = row.stripe_customer_id
    session_obj = client.create_checkout_session(
        customer_id=customer_id,
        price_id=body.price_id,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
    )
    return CheckoutLinkResponse(
        session_id=session_obj.id,
        url=session_obj.url,
        customer_id=session_obj.customer_id,
    )


@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request) -> dict[str, str]:
    """Handle Stripe webhook events.

    Real Stripe traffic carries 'stripe-signature'; the stub client skips
    verification so devs can curl-test event handling locally.
    """
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    client = get_billing_client()
    try:
        event = client.verify_webhook(payload=payload, signature=signature)
    except Exception as e:  # signature mismatch, malformed JSON, etc.
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {e}") from e

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        # Promote the org to 'active' once payment lands.
        customer_id = data.get("customer")
        if customer_id:
            with session_scope() as session:
                from .db.models import Org as OrgRow
                from sqlalchemy import select
                row = session.execute(
                    select(OrgRow).where(OrgRow.stripe_customer_id == customer_id)
                ).scalar_one_or_none()
                if row is not None:
                    row.plan = "active"
                    row.monthly_submission_quota = 500
        return {"status": "checkout_completed"}

    if event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            with session_scope() as session:
                from .db.models import Org as OrgRow
                from sqlalchemy import select
                row = session.execute(
                    select(OrgRow).where(OrgRow.stripe_customer_id == customer_id)
                ).scalar_one_or_none()
                if row is not None:
                    row.plan = "cancelled"
                    row.monthly_submission_quota = 50
        return {"status": "subscription_cancelled"}

    return {"status": "ignored", "type": event_type}


@app.get("/history/{run_id}", response_model=TriageRunDetail)
def history_detail(
    run_id: int, org: CurrentOrg = Depends(current_org),
) -> TriageRunDetail:
    with session_scope() as session:
        run = get_triage_run(session, run_id, org_id=org.id)
        if run is None:
            raise HTTPException(404, detail=f"Triage run {run_id} not found")
        result = TriageResult(
            submission_id=run.submission_id,
            summary=run.summary,
            matches=[
                {
                    "carrier_id": m.carrier_id,
                    "carrier_name": m.carrier_name,
                    "score": m.score,
                    "rationale": m.rationale,
                    "risk_flags": m.risk_flags,
                    "submission_email": m.submission_email,
                    "typical_quote_back_days": m.typical_quote_back_days,
                }
                for m in run.matches
            ],
            drafted_emails=[
                {
                    "id": d.id,
                    "carrier_id": d.carrier_id,
                    "to": d.to,
                    "subject": d.subject,
                    "body": d.body,
                    "attachments": d.attachments,
                    "sent_at": d.sent_at,
                    "quote_replied_at": d.quote_replied_at,
                    "quote_reply_body": d.quote_reply_body,
                    "outcome": d.outcome,
                    "outcome_set_at": d.outcome_set_at,
                    "bound_premium_cents": d.bound_premium_cents,
                }
                for d in run.drafts
            ],
        )
        return TriageRunDetail(
            id=run.id,
            submission_id=run.submission_id,
            insured_name=run.insured_name,
            primary_state=run.primary_state,
            match_count=len(run.matches),
            draft_count=len(run.drafts),
            created_at=run.created_at,
            summary=run.summary,
            submission_json=run.submission_json,
            result=result,
        )
