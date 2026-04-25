"""FastAPI app — HTTP surface for the triage agent.

Auth: every triage/history endpoint requires `Authorization: Bearer <key>`.
The demo seed creates one Org with a well-known key (see /me to fetch it).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fastapi import Request

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .agent import load_carriers, triage_submission
from .auth import CurrentOrg, current_org
from .billing import current_period_usage, get_client as get_billing_client
from .limits import limiter
from .db import (
    ensure_demo_org,
    get_draft,
    get_triage_run,
    init_db,
    list_triage_runs,
    mark_draft_sent,
    record_quote_reply,
    save_triage_run,
    session_scope,
    set_draft_outcome,
)
from .email import get_client as get_email_client
from .llm import get_client
from .logging import configure_logging
from .models import Carrier, Submission, TriageResult
from .notifications import Notification, get_client_for_url
from .parsers.base import DocAiParser
from .reports import summarize

CARRIERS_DIR = Path(os.environ.get(
    "CARRIERS_DIR",
    Path(__file__).resolve().parents[2] / "data" / "carriers",
))

configure_logging()
logger = logging.getLogger("submission_triage")

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


@app.get("/me")
def me(org: CurrentOrg = Depends(current_org)) -> dict[str, Any]:
    return {
        "org_id": org.id,
        "org_name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "monthly_submission_quota": org.monthly_submission_quota,
    }


@app.get("/carriers", response_model=list[Carrier])
def list_carriers(_: CurrentOrg = Depends(current_org)) -> list[Carrier]:
    return load_carriers(CARRIERS_DIR)


@app.post("/carriers", response_model=Carrier, status_code=201)
def upsert_carrier(
    carrier: Carrier, _: CurrentOrg = Depends(current_org),
) -> Carrier:
    """Write a carrier appetite guide to disk.

    Today carriers are JSON files on disk shared across orgs. When we move
    to per-org carrier libraries this becomes a row in a `carriers` table
    keyed on (org_id, carrier_id). Same input shape, just different store.
    """
    import json
    target = Path(CARRIERS_DIR) / f"{carrier.carrier_id}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(carrier.model_dump(mode="json"), indent=2))
    return carrier


def _carriers_or_503() -> list[Carrier]:
    carriers = load_carriers(CARRIERS_DIR)
    if not carriers:
        raise HTTPException(503, detail="No carrier appetite guides loaded")
    return carriers


def _run_and_persist(submission: Submission, org_id: int) -> TriageResult:
    result = triage_submission(submission, _carriers_or_503(), llm=get_client())
    with session_scope() as session:
        run = save_triage_run(session, submission, result, org_id=org_id)
        # Echo back the persisted draft ids so the dashboard can call
        # /drafts/{id}/send without re-querying.
        by_carrier = {d.carrier_id: d.id for d in run.drafts}
        for d in result.drafted_emails:
            d.id = by_carrier.get(d.carrier_id)
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
    return _run_and_persist(submission, org_id=org.id)


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
    limit: int = 50, org: CurrentOrg = Depends(current_org),
) -> list[TriageRunSummary]:
    with session_scope() as session:
        runs = list_triage_runs(session, org_id=org.id, limit=limit)
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
        client = get_email_client()
        sent = client.send(to=draft.to, subject=draft.subject, body=draft.body)
        mark_draft_sent(draft, provider_message_id=sent.provider_message_id)
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

    No-op once the draft is sent — drafts are immutable post-send so the
    audit trail matches what actually went on the wire.
    """
    with session_scope() as session:
        draft = get_draft(session, draft_id, org_id=org.id)
        if draft is None:
            raise HTTPException(404, detail=f"Draft {draft_id} not found")
        if draft.sent_at is not None:
            raise HTTPException(409, detail="Cannot edit a draft after it has been sent")
        if body.subject is not None:
            draft.subject = body.subject
        if body.body is not None:
            draft.body = body.body
        if body.to is not None:
            draft.to = body.to
        return _draft_to_status(draft)


class InboundReply(BaseModel):
    """Webhook payload for inbound quote replies.

    Postmark-style; SES Inbound's SNS payload is converted to this shape
    by an upstream Lambda we'll add in iter 8 once SES Inbound is live.
    """
    provider_message_id: str
    body: str


@app.post("/webhooks/inbound", response_model=DraftStatus | None)
def inbound_reply(payload: InboundReply) -> DraftStatus | None:
    """Match an inbound reply to the originating draft and record it.

    Public endpoint (no auth) because email providers can't carry an API
    key — we match on the provider_message_id we generated when sending.
    Replies that don't match a draft are silently dropped (returns null).

    Side effect: if the matched draft's org has a notification webhook
    configured, fire a 'quote received' message there.
    """
    notify_payload: tuple[str, Notification] | None = None
    with session_scope() as session:
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

    # Fire-and-forget after the DB transaction so a failed webhook
    # doesn't roll back the recorded reply.
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
    """What changed since `since` — for brokers who don't keep the
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


@app.get("/history/export.csv")
def history_export_csv(org: CurrentOrg = Depends(current_org)):
    """Stream the period's history as CSV — accounting / leadership reports."""
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
        if row.stripe_customer_id is None:
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
