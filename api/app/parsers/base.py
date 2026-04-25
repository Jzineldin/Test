"""Submission intake parsers.

Two implementations:
  * JsonParser    — accepts already-normalized JSON (used by demo + tests)
  * DocAiParser   — wraps a DocAiClient (real or fake) + the field mapper

Selection happens via `get_parser(source)` so callers don't branch on env.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

from ..models import Submission
from .docai_client import DocAiClient, GoogleDocAiClient, load_pdf
from .field_map import fields_to_submission


class AcordParser(Protocol):
    def parse(self, source: str | Path) -> Submission: ...


class JsonParser:
    """Parses an already-normalized Submission JSON document."""

    def parse(self, source: str | Path) -> Submission:
        path = Path(source)
        data = json.loads(path.read_text())
        return Submission.model_validate(data)


class DocAiParser:
    """Adapter for GCP Document AI ACORD form extractors.

    Holds a `DocAiClient` so tests can inject a fake. When constructed
    without one, lazily builds a `GoogleDocAiClient` from env vars on
    first parse — that's the only path that requires GCP credentials.
    """

    def __init__(self, client: DocAiClient | None = None) -> None:
        self._client = client

    def _resolved_client(self) -> DocAiClient:
        if self._client is not None:
            return self._client
        if not (os.environ.get("DOCAI_PROCESSOR_ID") and os.environ.get("GCP_PROJECT_ID")):
            raise RuntimeError(
                "DocAiParser not configured. Set DOCAI_PROCESSOR_ID and "
                "GCP_PROJECT_ID, or pass a DocAiClient explicitly."
            )
        self._client = GoogleDocAiClient()
        return self._client

    def parse(self, source: str | Path) -> Submission:
        pdf_bytes = load_pdf(source)
        return self.parse_bytes(pdf_bytes)

    def parse_bytes(self, pdf_bytes: bytes) -> Submission:
        fields = self._resolved_client().extract_fields(pdf_bytes)
        return fields_to_submission(fields)


def get_parser(source: str | Path) -> AcordParser:
    """Pick a parser based on the file extension."""
    suffix = Path(source).suffix.lower()
    if suffix == ".json":
        return JsonParser()
    if suffix == ".pdf":
        return DocAiParser()
    raise ValueError(f"No parser for extension {suffix!r}")
