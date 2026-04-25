"""Submission intake parsers.

Two implementations:
  * JsonParser    — accepts already-normalized JSON (used by demo + tests)
  * DocAiParser   — stub for GCP Document AI; activated when DOCAI_PROCESSOR_ID is set

Selection happens via `get_parser(source)` so callers don't branch on env.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Protocol

from ..models import Submission


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

    Wires real DocAI when DOCAI_PROCESSOR_ID is configured. Until then it
    raises with a clear message so the demo path stays obvious.
    """

    def __init__(self) -> None:
        self.processor_id = os.environ.get("DOCAI_PROCESSOR_ID")
        self.project_id = os.environ.get("GCP_PROJECT_ID")
        self.location = os.environ.get("DOCAI_LOCATION", "us")

    def parse(self, source: str | Path) -> Submission:
        if not (self.processor_id and self.project_id):
            raise RuntimeError(
                "DocAiParser not configured. Set DOCAI_PROCESSOR_ID and "
                "GCP_PROJECT_ID, or use JsonParser for the local demo."
            )
        # Real implementation lands here once the processor is deployed.
        raise NotImplementedError("DocAI integration ships in next iteration")


def get_parser(source: str | Path) -> AcordParser:
    """Pick a parser based on the file extension."""
    suffix = Path(source).suffix.lower()
    if suffix == ".json":
        return JsonParser()
    if suffix == ".pdf":
        return DocAiParser()
    raise ValueError(f"No parser for extension {suffix!r}")
