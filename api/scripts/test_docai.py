"""Smoke-test the DocAI integration against a real ACORD PDF.

Usage:
    GCP_PROJECT_ID=... DOCAI_PROCESSOR_ID=... \\
    GOOGLE_APPLICATION_CREDENTIALS=path/to/sa.json \\
    python scripts/test_docai.py path/to/acord.pdf

Prints, in order:
  1. The raw normalized field map DocAI returned (so you can spot
     ACORD label variants the field-mapper doesn't recognize yet)
  2. The Submission object the field-mapper produced
  3. The list of required fields it had to fall back to defaults for

If a field you expected didn't extract, the fix is usually a 1-line
addition to INSURED_ALIASES in app/parsers/field_map.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running from repo root or from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.parsers.docai_client import GoogleDocAiClient, load_pdf  # noqa: E402
from app.parsers.field_map import fields_to_submission  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python scripts/test_docai.py <path-to-acord.pdf>")
        return 2

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(f"file not found: {pdf_path}")
        return 2

    pdf_bytes = load_pdf(pdf_path)
    print(f"⏳ calling DocAI on {pdf_path.name} ({len(pdf_bytes):,} bytes)…")
    client = GoogleDocAiClient()
    fields = client.extract_fields(pdf_bytes)

    print(f"\n=== Raw fields ({len(fields)}) ===")
    for k, v in sorted(fields.items()):
        print(f"  {k:40s} {v[:80]}")

    submission = fields_to_submission(fields)
    print("\n=== Mapped Submission ===")
    print(submission.model_dump_json(indent=2))

    gaps = submission.extra.get("docai_gaps") or []
    if gaps:
        print(f"\n⚠ Required fields missing (defaulted): {gaps}")
        print("   Add aliases for these in app/parsers/field_map.py if the")
        print("   raw output above contains the value under a different label.")
    else:
        print("\n✓ All required fields extracted cleanly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
