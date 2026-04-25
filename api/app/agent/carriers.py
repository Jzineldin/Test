"""Load carrier appetite guides from JSON files on disk.

In production this lives in Postgres with a writeable underwriter UI.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..models import Carrier


def load_carriers(directory: str | Path) -> list[Carrier]:
    """Read every *.json file in `directory` and parse as a Carrier."""
    dir_path = Path(directory)
    carriers: list[Carrier] = []
    for file in sorted(dir_path.glob("*.json")):
        carriers.append(Carrier.model_validate(json.loads(file.read_text())))
    return carriers


def prefilter(carriers: list[Carrier], submission) -> list[Carrier]:
    """Cheap deterministic filter before the LLM scores remaining carriers.

    Removes carriers that are obviously out of appetite by hard rules:
    state exclusion, line-of-business mismatch, revenue band, NAICS prefix.
    Keeps the LLM call small and focused on the genuinely close calls.
    """
    state = submission.insured.primary_state
    requested_lines = {c.line for c in submission.coverages}
    revenue = submission.insured.annual_revenue
    naics = submission.insured.naics or ""

    kept: list[Carrier] = []
    for carrier in carriers:
        for rule in carrier.appetite:
            if rule.states_out and state in rule.states_out:
                continue
            if rule.states_in and state not in rule.states_in:
                continue
            if not (set(rule.lines) & requested_lines):
                continue
            if rule.naics_prefixes and not any(
                naics.startswith(prefix) for prefix in rule.naics_prefixes
            ):
                continue
            if revenue is not None:
                if rule.revenue_min is not None and revenue < rule.revenue_min:
                    continue
                if rule.revenue_max is not None and revenue > rule.revenue_max:
                    continue
            kept.append(carrier)
            break
    return kept
