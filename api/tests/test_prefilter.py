"""Prefilter is the deterministic gate that runs before any LLM call.

These tests pin the rules the agent depends on. If a carrier slips through
the prefilter that shouldn't, every downstream LLM call wastes tokens and
shows the broker an obviously-bad match - so this suite is load-bearing.
"""
from __future__ import annotations

from decimal import Decimal

from app.agent.carriers import prefilter


def test_acme_excludes_great_basin(carriers, acme_submission):
    """Great Basin is large-account trucking only; Acme is small contractor."""
    kept_ids = {c.carrier_id for c in prefilter(carriers, acme_submission)}
    assert "great_basin" not in kept_ids


def test_acme_keeps_three_contractor_carriers(carriers, acme_submission):
    kept_ids = {c.carrier_id for c in prefilter(carriers, acme_submission)}
    assert kept_ids == {"atlas_specialty", "keystone_ins", "redwood_underwriters"}


def test_state_exclusion_blocks_carrier(carriers, acme_submission):
    """Atlas excludes NY/CA on GL; flipping primary_state to NY drops Atlas."""
    acme_submission.insured.primary_state = "NY"
    kept_ids = {c.carrier_id for c in prefilter(carriers, acme_submission)}
    assert "atlas_specialty" not in kept_ids


def test_revenue_above_max_drops_small_account_carrier(carriers, acme_submission):
    """Redwood's revenue_max is $5M; bumping Acme to $20M removes it."""
    acme_submission.insured.annual_revenue = Decimal("20000000")
    kept_ids = {c.carrier_id for c in prefilter(carriers, acme_submission)}
    assert "redwood_underwriters" not in kept_ids


def test_revenue_below_min_drops_large_account_carrier(carriers, acme_submission):
    """Great Basin's revenue_min is $10M - should stay excluded for $4.2M Acme."""
    kept = prefilter(carriers, acme_submission)
    assert all(c.carrier_id != "great_basin" for c in kept)


def test_naics_mismatch_drops_carrier(carriers, acme_submission):
    """Switch NAICS from contractor (238) to retail (445) - Atlas/Redwood drop."""
    acme_submission.insured.naics = "445110"
    kept_ids = {c.carrier_id for c in prefilter(carriers, acme_submission)}
    assert "atlas_specialty" not in kept_ids
    assert "redwood_underwriters" not in kept_ids
