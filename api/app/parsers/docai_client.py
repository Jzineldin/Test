"""Thin wrapper around the GCP Document AI Form Parser processor.

Isolates the SDK call so tests can inject a fake. The wrapper returns a
plain `dict[str, str]` of normalized form-field key/value pairs — that's
the contract the field-mapper consumes.

Set up in production:
    1. Enable Document AI API in your GCP project
    2. Create a Form Parser processor (or a custom ACORD extractor)
    3. Export GCP_PROJECT_ID, DOCAI_PROCESSOR_ID, and either
       GOOGLE_APPLICATION_CREDENTIALS (path to a key file) or
       GCP_SERVICE_ACCOUNT_JSON (inline JSON, written to /tmp on first use).
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Protocol


def _ensure_gcp_credentials() -> None:
    """If GCP_SERVICE_ACCOUNT_JSON is set but no credentials file is on disk,
    materialize it to a temp file and point GOOGLE_APPLICATION_CREDENTIALS
    at it. Lets us keep service-account secrets in env vars on platforms
    (Render, Lambda) that don't have a clean way to upload a file.
    Idempotent: subsequent calls are no-ops."""
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return
    raw = os.environ.get("GCP_SERVICE_ACCOUNT_JSON")
    if not raw:
        return
    json.loads(raw)  # validate; surface a clearer error than the SDK would
    fd, path = tempfile.mkstemp(prefix="gcp-sa-", suffix=".json")
    with os.fdopen(fd, "w") as f:
        f.write(raw)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = path


class DocAiClient(Protocol):
    def extract_fields(self, pdf_bytes: bytes) -> dict[str, str]: ...


def _normalize_key(key: str) -> str:
    """Lowercase, strip punctuation/whitespace so 'Insured Name:' == 'insured name'."""
    return " ".join(key.replace(":", " ").replace("_", " ").split()).lower()


def _text_for_anchor(document, anchor) -> str:
    """Reconstruct the text a form-field anchor points to in the document.

    DocAI returns text anchors as offsets into document.text; we slice and
    join the segments to recover the rendered string.
    """
    if not anchor or not getattr(anchor, "text_segments", None):
        return ""
    parts: list[str] = []
    for segment in anchor.text_segments:
        start = int(getattr(segment, "start_index", 0) or 0)
        end = int(getattr(segment, "end_index", 0) or 0)
        parts.append(document.text[start:end])
    return "".join(parts).strip()


class GoogleDocAiClient:
    """Live client backed by google-cloud-documentai.

    Construction is lazy so importing the parser module never requires the
    SDK to be reachable; only `extract_fields` does.
    """

    def __init__(
        self,
        project_id: str | None = None,
        location: str | None = None,
        processor_id: str | None = None,
    ) -> None:
        self.project_id = project_id or os.environ["GCP_PROJECT_ID"]
        self.location = location or os.environ.get("DOCAI_LOCATION", "us")
        self.processor_id = processor_id or os.environ["DOCAI_PROCESSOR_ID"]

    def extract_fields(self, pdf_bytes: bytes) -> dict[str, str]:
        from google.cloud import documentai  # lazy import

        _ensure_gcp_credentials()
        client = documentai.DocumentProcessorServiceClient()
        name = client.processor_path(self.project_id, self.location, self.processor_id)
        raw_doc = documentai.RawDocument(content=pdf_bytes, mime_type="application/pdf")
        request = documentai.ProcessRequest(name=name, raw_document=raw_doc)
        response = client.process_document(request=request)
        document = response.document

        fields: dict[str, str] = {}
        for page in document.pages:
            for ff in page.form_fields:
                key = _normalize_key(_text_for_anchor(document, ff.field_name.text_anchor))
                value = _text_for_anchor(document, ff.field_value.text_anchor)
                if key and value and key not in fields:
                    fields[key] = value
        return fields


def load_pdf(path: str | Path) -> bytes:
    return Path(path).read_bytes()
