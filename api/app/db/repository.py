"""High-level persistence operations for triage runs.

Endpoints call these — they don't touch the ORM directly. That keeps the
HTTP surface and the storage layer decoupled and lets us swap engines
(SQLite ↔ Postgres) without endpoint changes.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Submission, TriageResult
from .models import AppetiteMatchRow, DraftedEmailRow, TriageRun


def save_triage_run(
    session: Session,
    submission: Submission,
    result: TriageResult,
    *,
    org_id: int,
) -> TriageRun:
    """Persist a triage run with its matches + drafts. Returns the row."""
    run = TriageRun(
        org_id=org_id,
        submission_id=result.submission_id,
        insured_name=submission.insured.legal_name,
        primary_state=submission.insured.primary_state,
        summary=result.summary,
        submission_json=submission.model_dump(mode="json"),
        matches=[
            AppetiteMatchRow(
                carrier_id=m.carrier_id,
                carrier_name=m.carrier_name,
                score=m.score,
                rationale=m.rationale,
                risk_flags=list(m.risk_flags),
                submission_email=m.submission_email,
                typical_quote_back_days=m.typical_quote_back_days,
            )
            for m in result.matches
        ],
        drafts=[
            DraftedEmailRow(
                carrier_id=d.carrier_id,
                to=d.to,
                subject=d.subject,
                body=d.body,
                attachments=list(d.attachments),
            )
            for d in result.drafted_emails
        ],
    )
    session.add(run)
    session.flush()  # populate run.id without ending the transaction
    return run


def list_triage_runs(
    session: Session, *, org_id: int, limit: int = 50,
) -> list[TriageRun]:
    """Most recent first, scoped to org."""
    # id DESC breaks ties when two runs land in the same DB clock tick.
    stmt = (
        select(TriageRun)
        .where(TriageRun.org_id == org_id)
        .order_by(TriageRun.created_at.desc(), TriageRun.id.desc())
        .limit(limit)
    )
    return list(session.execute(stmt).scalars())


def get_triage_run(
    session: Session, run_id: int, *, org_id: int,
) -> TriageRun | None:
    """Single run with matches + drafts eager-loaded. Returns None if the
    run doesn't exist OR belongs to a different org (no info leak)."""
    stmt = (
        select(TriageRun)
        .where(TriageRun.id == run_id, TriageRun.org_id == org_id)
        .options(selectinload(TriageRun.matches), selectinload(TriageRun.drafts))
    )
    return session.execute(stmt).scalar_one_or_none()
