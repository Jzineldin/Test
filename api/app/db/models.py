"""ORM models for persisted triage runs.

The schema mirrors the API response shape - TriageRun has many
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
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Org(Base):
    """A wholesale broker / MGA - the unit of tenancy.

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
    notification_webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    forward_inbox_address: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Multi-line signature block the email drafter pastes at the end of
    # every carrier-bound message. Lets brokers control phone, email,
    # license number, etc. without hardcoding into prompts.
    email_signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    # HMAC secret used to sign /webhooks/inbound + /webhooks/email payloads
    # destined for this org. Auto-generated on org creation; never null in
    # practice - the column is nullable for migration safety on existing rows.
    webhook_secret: Mapped[str | None] = mapped_column(String(96), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    runs: Mapped[list["TriageRun"]] = relationship(
        back_populates="org", cascade="all, delete-orphan",
    )


class User(Base):
    """Identity within an Org.

    Roles:
      * admin   - can change org settings, invite other users, see audit
      * csr     - runs triage, sends drafts, records outcomes
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="csr")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )


class MagicLinkToken(Base):
    """One-shot login token mailed to a user.

    Tokens are 32 random bytes hex-encoded. We store the SHA-256 of the
    token, never the plaintext - matches the auth-cookie pattern.
    """
    __tablename__ = "magic_link_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )


class Session(Base):
    """Active login session.

    Cookie value is the SHA-256 of `secret`; the secret never lives in
    the DB. 30-day rolling expiry - bumped on every authenticated request.
    """
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    secret_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )


class AuditEvent(Base):
    """Append-only event log.

    Every state change a broker would care to audit lands here:
      * triage.run            (a new submission was triaged)
      * draft.sent            (an email left the system)
      * draft.edited          (broker tweaked the LLM output)
      * outcome.set           (broker recorded bound/declined)
      * settings.updated      (org config change)

    Cheap enough to write on every action. Backed by JSON `details` so
    new event types don't require schema changes.
    """
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("orgs.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    actor: Mapped[str] = mapped_column(String(128), default="api-key")
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True,
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
    # The original PDF the broker uploaded, kept so we can attach it to
    # outbound carrier emails verbatim. Null for JSON-paste submissions.
    submission_pdf: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    submission_pdf_filename: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Optional supplementary attachments (loss runs, dec pages) the broker
    # uploaded alongside the ACORD or that landed in the inbound email.
    # Stored as a list of {"filename","content_type","content_b64"}.
    submission_extras: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True,
    )
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
    provider_message_id: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    quote_replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quote_reply_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Outcome: 'bound' | 'declined' | 'pending' | null (untouched).
    # 'pending' is what we set automatically when a reply lands; broker
    # promotes to bound/declined manually after reading the quote.
    outcome: Mapped[str | None] = mapped_column(String(16), nullable=True)
    outcome_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    bound_premium_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    run: Mapped[TriageRun] = relationship(back_populates="drafts")


class CarrierRow(Base):
    """A carrier appetite guide owned by an Org.

    Multi-tenant: every org has its own carrier directory. The four
    sample carriers in data/carriers/ are auto-seeded into a brand-new
    org on first signup so the demo flow works without manual setup.
    """
    __tablename__ = "carriers"
    __table_args__ = ({"sqlite_autoincrement": True},)

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("orgs.id", ondelete="CASCADE"), index=True,
    )
    # External-facing identifier, unique within an org. Same value
    # appears in the JSON Carrier model; e.g. 'atlas_specialty'.
    carrier_id: Mapped[str] = mapped_column(String(64), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )
