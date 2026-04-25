"""Tests for the DocAI field mapper + parser orchestration.

We never call the real GCP API in tests. A FakeDocAiClient injects a known
key/value dict so the field mapper's behavior is deterministic.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import LineOfBusiness, Submission
from app.parsers.base import DocAiParser
from app.parsers.docai_client import DocAiClient, _normalize_key
from app.parsers.field_map import fields_to_submission


class FakeDocAiClient:
    """In-memory stand-in for DocAiClient that returns canned fields."""

    def __init__(self, fields: dict[str, str]) -> None:
        self._fields = fields

    def extract_fields(self, pdf_bytes: bytes) -> dict[str, str]:
        return dict(self._fields)


# Realistic shape of what the GCP Form Parser returns from a clean ACORD 125
ACME_DOCAI_FIELDS: dict[str, str] = {
    "named insured": "Acme Plumbing Services LLC",
    "dba": "Acme Plumbing",
    "fein": "47-3829104",
    "naics": "238220",
    "description of operations": "Residential and light-commercial plumbing contractor.",
    "years in business": "14",
    "annual revenue": "$4,200,000",
    "employees": "22",
    "mailing address": "812 W Cesar Chavez St, Austin, TX 78701",
    "state": "TX",
    "general liability": "x",
    "commercial auto": "x",
}


def test_normalize_key_strips_punctuation_and_case():
    assert _normalize_key("Insured Name:") == "insured name"
    assert _normalize_key("  Mailing_Address ") == "mailing address"


def test_field_map_extracts_core_insured():
    sub = fields_to_submission(ACME_DOCAI_FIELDS)
    assert sub.insured.legal_name == "Acme Plumbing Services LLC"
    assert sub.insured.dba == "Acme Plumbing"
    assert sub.insured.naics == "238220"
    assert sub.insured.years_in_business == 14
    assert sub.insured.employee_count == 22
    assert sub.insured.annual_revenue == Decimal("4200000")
    assert sub.insured.primary_state == "TX"


def test_field_map_picks_up_requested_lines():
    sub = fields_to_submission(ACME_DOCAI_FIELDS)
    lines = {c.line for c in sub.coverages}
    assert lines == {LineOfBusiness.GL, LineOfBusiness.AUTO}


def test_field_map_handles_revenue_shorthand():
    sub = fields_to_submission({**ACME_DOCAI_FIELDS, "annual revenue": "4.2M"})
    assert sub.insured.annual_revenue == Decimal("4200000")


def test_field_map_records_gaps_for_missing_required_fields():
    sparse = {"naics": "238220"}  # no name, no state, no description
    sub = fields_to_submission(sparse)
    gaps = sub.extra["docai_gaps"]
    assert "legal_name" in gaps
    assert "primary_state" in gaps
    assert "business_description" in gaps
    # Submission still validates so the dashboard can render it.
    assert isinstance(sub, Submission)


def test_field_map_preserves_raw_in_extra():
    sub = fields_to_submission(ACME_DOCAI_FIELDS)
    assert sub.extra["docai_raw"] == ACME_DOCAI_FIELDS


def test_field_map_defaults_to_gl_when_no_lines_present():
    sub = fields_to_submission({"named insured": "X", "state": "TX", "description of operations": "y"})
    assert [c.line for c in sub.coverages] == [LineOfBusiness.GL]


def test_docai_parser_uses_injected_client():
    parser = DocAiParser(client=FakeDocAiClient(ACME_DOCAI_FIELDS))
    sub = parser.parse_bytes(b"%PDF-fake")
    assert sub.insured.legal_name == "Acme Plumbing Services LLC"
    assert sub.insured.primary_state == "TX"


def test_docai_parser_raises_when_unconfigured(monkeypatch, tmp_path):
    monkeypatch.delenv("DOCAI_PROCESSOR_ID", raising=False)
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    f = tmp_path / "x.pdf"
    f.write_bytes(b"%PDF-")
    with pytest.raises(RuntimeError, match="not configured"):
        DocAiParser().parse(f)


def test_field_map_state_extraction_handles_full_address():
    """`state` alias may map to a value like 'Austin, TX 78701'."""
    sub = fields_to_submission({**ACME_DOCAI_FIELDS, "state": "Austin, TX 78701"})
    assert sub.insured.primary_state == "TX"
