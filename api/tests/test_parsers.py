"""Parser selection by file extension."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.parsers import get_parser
from app.parsers.base import DocAiParser, JsonParser


def test_json_extension_picks_json_parser(tmp_path):
    f = tmp_path / "x.json"
    f.write_text("{}")
    assert isinstance(get_parser(f), JsonParser)


def test_pdf_extension_picks_docai_parser(tmp_path):
    f = tmp_path / "x.pdf"
    f.write_bytes(b"%PDF-")
    assert isinstance(get_parser(f), DocAiParser)


def test_unknown_extension_raises(tmp_path):
    f = tmp_path / "x.docx"
    f.write_bytes(b"")
    with pytest.raises(ValueError):
        get_parser(f)


def test_docai_parser_raises_until_configured(monkeypatch, tmp_path):
    monkeypatch.delenv("DOCAI_PROCESSOR_ID", raising=False)
    monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
    f = tmp_path / "x.pdf"
    f.write_bytes(b"%PDF-")
    with pytest.raises(RuntimeError, match="not configured"):
        DocAiParser().parse(f)


def test_json_parser_round_trips_acme(acme_submission):
    """The fixture itself proves the sample submission parses cleanly."""
    assert acme_submission.insured.legal_name == "Acme Plumbing Services LLC"
    assert acme_submission.insured.primary_state == "TX"
