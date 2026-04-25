"""Period-scoped reports for a broker.

What a broker actually wants to see:
  * How many submissions did we triage this period?
  * How many drafts did we send?
  * What's our quote-back rate (replies / sent)?
  * What's our bind rate (bound / replied)?
  * What's our average time-to-quote?
  * What's our total bound premium this period?

These all derive from existing rows; no new event table needed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .billing.usage import period_bounds
from .db.models import DraftedEmailRow, TriageRun


@dataclass
class ReportSummary:
    period_start: datetime
    period_end: datetime
    submissions_triaged: int
    drafts_sent: int
    drafts_replied: int
    drafts_bound: int
    drafts_declined: int
    quote_back_rate: float    # replied / sent
    bind_rate: float          # bound / replied
    avg_hours_to_quote: float | None
    bound_premium_dollars: float


def summarize(session: Session, *, org_id: int) -> ReportSummary:
    start, end = period_bounds()

    submissions = int(session.execute(
        select(func.count(TriageRun.id)).where(
            TriageRun.org_id == org_id,
            TriageRun.created_at >= start,
            TriageRun.created_at < end,
        )
    ).scalar() or 0)

    drafts_q = (
        select(DraftedEmailRow)
        .join(TriageRun, DraftedEmailRow.run_id == TriageRun.id)
        .where(
            TriageRun.org_id == org_id,
            TriageRun.created_at >= start,
            TriageRun.created_at < end,
        )
    )
    drafts = list(session.execute(drafts_q).scalars())

    sent = [d for d in drafts if d.sent_at is not None]
    replied = [d for d in sent if d.quote_replied_at is not None]
    bound = [d for d in replied if d.outcome == "bound"]
    declined = [d for d in replied if d.outcome == "declined"]

    quote_back_rate = (len(replied) / len(sent)) if sent else 0.0
    bind_rate = (len(bound) / len(replied)) if replied else 0.0

    if replied:
        deltas = [
            (d.quote_replied_at - d.sent_at).total_seconds() / 3600.0
            for d in replied if d.sent_at and d.quote_replied_at
        ]
        avg_hours = sum(deltas) / len(deltas) if deltas else None
    else:
        avg_hours = None

    bound_cents = sum(d.bound_premium_cents or 0 for d in bound)

    return ReportSummary(
        period_start=start,
        period_end=end,
        submissions_triaged=submissions,
        drafts_sent=len(sent),
        drafts_replied=len(replied),
        drafts_bound=len(bound),
        drafts_declined=len(declined),
        quote_back_rate=quote_back_rate,
        bind_rate=bind_rate,
        avg_hours_to_quote=avg_hours,
        bound_premium_dollars=bound_cents / 100.0,
    )
