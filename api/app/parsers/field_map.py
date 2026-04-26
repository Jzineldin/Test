"""Map DocAI form-field key/value pairs to a Submission.

This is intentionally conservative:
  * We only set a field when an alias matches AND the value parses cleanly
  * Unknown fields go into `extra["docai_raw"]` so nothing is lost
  * Required fields that are missing get safe defaults so the Submission
    still validates - the dashboard surfaces the gaps for human review

ACORD field labels vary across carriers and form versions. The alias map
is the only thing to extend when we encounter a new form quirk.
"""
from __future__ import annotations

import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Iterable

from ..models import (
    CoverageRequest,
    Insured,
    LineOfBusiness,
    Location,
    Submission,
)

# Each tuple: (target field, list of accepted normalized keys).
INSURED_ALIASES: list[tuple[str, list[str]]] = [
    ("legal_name",        ["named insured", "insured name", "applicant name", "insured"]),
    ("dba",               ["dba", "doing business as", "d/b/a"]),
    ("fein",              ["fein", "federal id", "federal employer id", "tax id"]),
    ("naics",             ["naics", "naics code"]),
    ("sic",               ["sic", "sic code"]),
    ("business_description", ["business description", "description of operations", "nature of business"]),
    ("years_in_business", ["years in business", "year established", "years in operation"]),
    ("annual_revenue",    ["annual revenue", "gross revenue", "annual sales", "gross sales"]),
    ("employee_count",    ["employees", "number of employees", "total employees"]),
    ("primary_state",     ["state", "primary state", "mailing state"]),
    ("mailing_address",   ["mailing address", "address", "street address"]),
]

COVERAGE_ALIASES: dict[LineOfBusiness, list[str]] = {
    LineOfBusiness.GL:    ["general liability", "gl premium", "cgl"],
    LineOfBusiness.PROP:  ["property", "property premium"],
    LineOfBusiness.AUTO:  ["commercial auto", "business auto", "auto premium"],
    LineOfBusiness.WC:    ["workers comp", "workers compensation"],
    LineOfBusiness.UMB:   ["umbrella", "excess liability"],
    LineOfBusiness.PROF:  ["professional liability", "e&o", "errors and omissions"],
    LineOfBusiness.CYBER: ["cyber", "cyber liability"],
}


def _to_decimal(raw: str) -> Decimal | None:
    """Parse '$4,200,000' / '4.2M' / '4,200,000.00' into Decimal."""
    if not raw:
        return None
    cleaned = raw.replace("$", "").replace(",", "").strip().lower()
    multiplier = Decimal("1")
    if cleaned.endswith("m"):
        multiplier = Decimal("1000000")
        cleaned = cleaned[:-1].strip()
    elif cleaned.endswith("k"):
        multiplier = Decimal("1000")
        cleaned = cleaned[:-1].strip()
    try:
        return (Decimal(cleaned) * multiplier).quantize(Decimal("1"))
    except (InvalidOperation, ValueError):
        return None


def _to_int(raw: str) -> int | None:
    digits = re.sub(r"[^\d-]", "", raw or "")
    try:
        return int(digits) if digits else None
    except ValueError:
        return None


_STATE_RE = re.compile(r"\b([A-Z]{2})\b")


def _to_state(raw: str) -> str | None:
    m = _STATE_RE.search((raw or "").upper())
    return m.group(1) if m else None


def _resolve_value(field: str, raw: str):
    if field in {"annual_revenue"}:
        return _to_decimal(raw)
    if field in {"years_in_business", "employee_count"}:
        return _to_int(raw)
    if field == "primary_state":
        return _to_state(raw)
    return (raw or "").strip() or None


def _build_insured(fields: dict[str, str]) -> tuple[Insured, list[str]]:
    """Return (Insured, list of missing-required field names)."""
    extracted: dict[str, object] = {}
    for target, aliases in INSURED_ALIASES:
        for alias in aliases:
            if alias in fields:
                value = _resolve_value(target, fields[alias])
                if value is not None:
                    extracted[target] = value
                    break

    missing: list[str] = []
    if "legal_name" not in extracted:
        extracted["legal_name"] = "UNKNOWN - see attached PDF"
        missing.append("legal_name")
    if "primary_state" not in extracted:
        extracted["primary_state"] = "??"
        missing.append("primary_state")
    if "business_description" not in extracted:
        extracted["business_description"] = ""
        missing.append("business_description")

    return Insured(**extracted), missing


def _build_coverages(fields: dict[str, str]) -> list[CoverageRequest]:
    coverages: list[CoverageRequest] = []
    for line, aliases in COVERAGE_ALIASES.items():
        if any(alias in fields for alias in aliases):
            coverages.append(CoverageRequest(line=line))
    return coverages


def fields_to_submission(
    fields: dict[str, str],
    *,
    submission_id: str | None = None,
    received_at: date | None = None,
    retail_agent_email: str = "unknown@example.com",
    locations: Iterable[Location] = (),
) -> Submission:
    """Build a Submission from a flat dict of normalized DocAI key/value pairs.

    The result is always valid; gaps are tracked in extra["docai_gaps"] so
    the dashboard can prompt the broker to fill them in.
    """
    insured, missing = _build_insured(fields)
    coverages = _build_coverages(fields)
    if not coverages:
        # ACORD 125 alone often has no per-line premium; default to GL so
        # downstream agent has something to work with.
        coverages = [CoverageRequest(line=LineOfBusiness.GL)]

    return Submission(
        submission_id=submission_id or f"SUB-{uuid.uuid4().hex[:12].upper()}",
        received_at=received_at or date.today(),
        retail_agent_email=retail_agent_email,
        insured=insured,
        locations=list(locations),
        coverages=coverages,
        extra={"docai_raw": fields, "docai_gaps": missing},
    )
