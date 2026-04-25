"""Domain models for the submission triage agent.

Mirrors the canonical fields a wholesale broker needs to make an appetite
decision. Fields are intentionally a flat subset of ACORD 125 / 126 / 140
plus loss-run summary; deep nesting goes in `extra`.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class LineOfBusiness(str, Enum):
    GL = "general_liability"
    PROP = "property"
    AUTO = "commercial_auto"
    WC = "workers_comp"
    UMB = "umbrella"
    PROF = "professional_liability"
    CYBER = "cyber"


class Insured(BaseModel):
    legal_name: str
    dba: str | None = None
    fein: str | None = None
    naics: str | None = None
    sic: str | None = None
    business_description: str
    years_in_business: int | None = None
    annual_revenue: Decimal | None = None
    employee_count: int | None = None
    primary_state: str
    mailing_address: str | None = None


class Location(BaseModel):
    street: str
    city: str
    state: str
    zip: str
    building_value: Decimal | None = None
    contents_value: Decimal | None = None
    construction: str | None = None
    year_built: int | None = None
    sprinklered: bool | None = None
    occupancy: str | None = None


class CoverageRequest(BaseModel):
    line: LineOfBusiness
    limit_per_occurrence: Decimal | None = None
    limit_aggregate: Decimal | None = None
    deductible: Decimal | None = None
    effective_date: date | None = None
    expiring_premium: Decimal | None = None


class LossYear(BaseModel):
    policy_year: int
    line: LineOfBusiness
    claim_count: int
    incurred: Decimal
    paid: Decimal
    open_reserves: Decimal


class Submission(BaseModel):
    """Normalized submission ready for appetite matching."""
    submission_id: str
    received_at: date
    retail_agent_email: str
    retail_agent_name: str | None = None
    insured: Insured
    locations: list[Location] = Field(default_factory=list)
    coverages: list[CoverageRequest]
    loss_history: list[LossYear] = Field(default_factory=list)
    notes: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class AppetiteRule(BaseModel):
    """One row of a carrier's underwriting appetite guide."""
    naics_prefixes: list[str] = Field(default_factory=list)
    states_in: list[str] = Field(default_factory=list)
    states_out: list[str] = Field(default_factory=list)
    lines: list[LineOfBusiness]
    revenue_max: Decimal | None = None
    revenue_min: Decimal | None = None
    notes: str | None = None


class Carrier(BaseModel):
    carrier_id: str
    name: str
    submission_email: str
    underwriter_name: str | None = None
    appetite: list[AppetiteRule]
    typical_quote_back_days: int = 5
    notes: str | None = None


class AppetiteMatch(BaseModel):
    carrier_id: str
    carrier_name: str
    score: float = Field(ge=0.0, le=1.0)
    rationale: str
    risk_flags: list[str] = Field(default_factory=list)
    submission_email: str
    typical_quote_back_days: int


class DraftedEmail(BaseModel):
    # `id` is populated after persistence so the dashboard can hit /drafts/{id}/send.
    # In-memory triage runs (e.g. CLI demo) leave it as None.
    id: int | None = None
    carrier_id: str
    to: str
    subject: str
    body: str
    attachments: list[str] = Field(default_factory=list)
    sent_at: datetime | None = None


class TriageResult(BaseModel):
    submission_id: str
    matches: list[AppetiteMatch]
    drafted_emails: list[DraftedEmail]
    summary: str
