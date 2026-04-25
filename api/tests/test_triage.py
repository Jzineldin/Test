"""End-to-end triage with the deterministic stub LLM.

Verifies the orchestration shape (matches + drafts + summary) without
network. A second test forces threshold semantics so we don't silently
ship empty draft sets to brokers.
"""
from __future__ import annotations

from app.agent import triage_submission
from app.llm.client import StubClient


def test_triage_produces_matches_and_drafts(carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())

    assert result.submission_id == acme_submission.submission_id
    assert result.matches, "expected at least one appetite match"
    assert all(0.0 <= m.score <= 1.0 for m in result.matches)

    # Drafts should only target carriers above the score threshold.
    matched_ids = {m.carrier_id for m in result.matches if m.score >= 0.5}
    drafted_ids = {d.carrier_id for d in result.drafted_emails}
    assert drafted_ids <= matched_ids
    assert drafted_ids, "stub matches above threshold should produce drafts"


def test_triage_threshold_blocks_drafts(carriers, acme_submission):
    """Setting threshold above stub score (0.72) suppresses all drafts."""
    result = triage_submission(
        acme_submission, carriers, llm=StubClient(), score_threshold=0.95,
    )
    assert result.drafted_emails == []


def test_drafts_carry_attachments_and_real_email(carriers, acme_submission):
    result = triage_submission(acme_submission, carriers, llm=StubClient())
    for draft in result.drafted_emails:
        assert "@" in draft.to
        assert draft.subject.strip()
        assert draft.attachments, "every draft should reference attached forms"
