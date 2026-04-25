"""Submission usage metering.

A submission is the billable unit. Counted as the number of TriageRun
rows for the org in the current calendar-month period.

Production note: switch to a dedicated `usage_records` table once we
move to true outcome pricing (per-quote, not per-submission).
"""
from __future__ import annotations

from datetime import datetime, timezone
from calendar import monthrange

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import TriageRun


def period_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return (start_of_month_utc, start_of_next_month_utc) for `now`."""
    now = now or datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    last_day = monthrange(now.year, now.month)[1]
    if now.month == 12:
        next_start = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_start = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    _ = last_day  # kept for clarity / future-proofing
    return start, next_start


def current_period_usage(session: Session, *, org_id: int) -> int:
    """Count of TriageRuns this org has done in the current calendar month."""
    start, end = period_bounds()
    stmt = (
        select(func.count(TriageRun.id))
        .where(
            TriageRun.org_id == org_id,
            TriageRun.created_at >= start,
            TriageRun.created_at < end,
        )
    )
    return int(session.execute(stmt).scalar() or 0)


def record_submission_usage(session: Session, *, org_id: int) -> int:
    """No-op: TriageRun rows are themselves the usage record. Returned int
    is the new total for convenience (same as current_period_usage)."""
    return current_period_usage(session, org_id=org_id)
