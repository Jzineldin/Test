"""Bulk-import carrier appetite data from a CSV.

CSV columns (one row per appetite *rule*; multiple rows per carrier):
  carrier_id, name, submission_email, underwriter_name, typical_quote_back_days,
  notes, naics_prefixes, states_in, states_out, lines, revenue_min, revenue_max,
  rule_notes

  * naics_prefixes / states_in / states_out / lines: pipe-separated
    (e.g.  "238|236")
  * revenue_min / revenue_max: leave blank for unbounded
  * carrier-level fields (name, email, etc.) only need to be set on the
    first row; subsequent rows for the same carrier_id may leave them blank

Usage:
    python scripts/import_carriers.py path/to/appetite.csv
    python scripts/import_carriers.py path/to/appetite.csv --out data/carriers/

Writes one JSON file per carrier under the output directory (matches the
shape app.agent.carriers.load_carriers expects).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

# Allow running from repo root or from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import LineOfBusiness  # noqa: E402


VALID_LINES = {line.value for line in LineOfBusiness}


def _split(value: str) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split("|") if v.strip()]


def _decimal_or_none(value: str) -> str | None:
    v = (value or "").strip().replace("$", "").replace(",", "")
    if not v:
        return None
    return v


def parse_csv(path: Path) -> dict[str, dict[str, Any]]:
    """Group rows by carrier_id; return {carrier_id: full carrier dict}."""
    carriers: dict[str, dict[str, Any]] = {}
    rule_count: dict[str, int] = defaultdict(int)

    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = (row.get("carrier_id") or "").strip()
            if not cid:
                continue

            if cid not in carriers:
                carriers[cid] = {
                    "carrier_id": cid,
                    "name": row.get("name", "").strip() or cid,
                    "submission_email": row.get("submission_email", "").strip(),
                    "underwriter_name": row.get("underwriter_name", "").strip() or None,
                    "typical_quote_back_days": int(row.get("typical_quote_back_days") or 5),
                    "notes": row.get("notes", "").strip() or None,
                    "appetite": [],
                }

            lines = [l for l in _split(row.get("lines", "")) if l in VALID_LINES]
            if not lines:
                continue  # skip malformed rule

            carriers[cid]["appetite"].append({
                "naics_prefixes": _split(row.get("naics_prefixes", "")),
                "states_in":      _split(row.get("states_in", "")),
                "states_out":     _split(row.get("states_out", "")),
                "lines":          lines,
                "revenue_min":    _decimal_or_none(row.get("revenue_min", "")),
                "revenue_max":    _decimal_or_none(row.get("revenue_max", "")),
                "notes":          (row.get("rule_notes") or "").strip() or None,
            })
            rule_count[cid] += 1

    return carriers


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "carriers",
    )
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"file not found: {args.csv}")
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    carriers = parse_csv(args.csv)

    if not carriers:
        print("no carriers parsed — check the carrier_id column")
        return 1

    for cid, payload in carriers.items():
        path = args.out / f"{cid}.json"
        path.write_text(json.dumps(payload, indent=2))
        try:
            display = path.relative_to(Path.cwd())
        except ValueError:
            display = path
        print(f"  wrote {display} ({len(payload['appetite'])} rules)")

    print(f"\n✓ {len(carriers)} carriers imported to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
