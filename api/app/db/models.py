"""ORM models for persisted triage runs.

The schema mirrors the API response shape — TriageRun has many
AppetiteMatchRow and many DraftedEmailRow. Submission JSON is stored
verbatim so we can replay or audit later without losing fidelity.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Org(Base):
    """A wholesale broker / MGA — the unit of tenancy.

    Every TriageRun belongs to exactly one Org. Authentication is by API
    key today (one Bearer token per Org); user-level identity comes later.
    """
    __tablename__ = "orgs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    api_key: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    plan: Mapped[str] = mapped_column(String(32), default="trial")
    monthly_submission_quota: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    runs: Mapped[list["TriageRun"]] = relationship(
        back_populates="org", cascade="all, delete-orphan",
    )


class TriageRun(Base):
    __tablename__ = "triage_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    submission_id: Mapped[str] = mapped_column(String(64), index=True)
    insured_name: Mapped[str] = mapped_column(String(256))
    primary_state: Mapped[str] = mapped_column(String(8))
    summary: Mapped[str] = mapped_column(Text, default="")
    submission_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True,
    )

    org: Mapped[Org] = relationship(back_populates="runs")
    matches: Mapped[list["AppetiteMatchRow"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="AppetiteMatchRow.score.desc()",
    )
    drafts: Mapped[list["DraftedEmailRow"]] = relationship(
        back_populates="run", cascade="all, delete-orphan",
    )


class AppetiteMatchRow(Base):
    __tablename__ = "appetite_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("triage_runs.id", ondelete="CASCADE"), index=True)
    carrier_id: Mapped[str] = mapped_column(String(64))
    carrier_name: Mapped[str] = mapped_column(String(256))
    score: Mapped[float] = mapped_column(Float)
    rationale: Mapped[str] = mapped_column(Text)
    risk_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    submission_email: Mapped[str] = mapped_column(String(256))
    typical_quote_back_days: Mapped[int] = mapped_column(Integer)

    run: Mapped[TriageRun] = relationship(back_populates="matches")


class DraftedEmailRow(Base):
    __tablename__ = "drafted_emails"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("triage_runs.id", ondelete="CASCADE"), index=True)
    carrier_id: Mapped[str] = mapped_column(String(64))
    to: Mapped[str] = mapped_column(String(256))
    subject: Mapped[str] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(Text)
    attachments: Mapped[list[str]] = mapped_column(JSON, default=list)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped[TriageRun] = relationship(back_populates="drafts")
