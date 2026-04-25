"""Submission triage agent.

Given a parsed Submission and a set of Carriers, produce:
  1. Ranked AppetiteMatch list (LLM-scored against carrier appetite guides)
  2. Per-carrier DraftedEmail ready for broker review

Uses the LlmClient abstraction so the same code runs offline (StubClient)
or against real Claude (AnthropicClient).
"""
from __future__ import annotations

import json

from ..llm import LlmClient, get_client
from ..models import (
    AppetiteMatch,
    Carrier,
    DraftedEmail,
    Submission,
    TriageResult,
)
from .carriers import prefilter

APPETITE_SYSTEM = """You are an underwriting analyst for a wholesale commercial \
insurance broker. You score each carrier's appetite for a given risk on a 0–1 \
scale. Be conservative — only score above 0.7 when NAICS, state, line, and \
revenue all clearly fit the carrier's published appetite. Always surface loss \
history concerns as risk_flags."""


DRAFT_SYSTEM = """You are a wholesale broker writing the cover email that goes \
to a carrier underwriter alongside an ACORD packet. Tone is concise, factual, \
and respectful of the underwriter's time. Lead with the most relevant facts \
for THIS carrier's appetite. Never invent figures — only use values from the \
provided submission JSON."""


def _appetite_user_prompt(submission: Submission, carriers: list[Carrier]) -> str:
    return (
        "APPETITE_MATCH_TASK\n\n"
        "Score each carrier below for appetite fit and return JSON of shape:\n"
        '{"matches": [{"carrier_id": "...", "score": 0.0-1.0, '
        '"rationale": "...", "risk_flags": ["..."]}], "summary": "..."}\n\n'
        "SUBMISSION:\n"
        + submission.model_dump_json(indent=2)
        + "\n\nCARRIERS:\n"
        + json.dumps([c.model_dump(mode="json") for c in carriers], indent=2)
    )


def _draft_user_prompt(submission: Submission, carrier: Carrier, match: AppetiteMatch) -> str:
    return (
        "DRAFT_EMAIL_TASK\n\n"
        f"Write the cover email to {carrier.name} ({carrier.submission_email}) "
        f"for the submission below. Lead with facts relevant to this carrier's "
        f"appetite. Reference their typical {carrier.typical_quote_back_days}-day "
        f"quote-back timeline at the close. Return JSON of shape "
        '{"subject": "...", "body": "..."}.\n\n'
        f"APPETITE_RATIONALE: {match.rationale}\n"
        f"RISK_FLAGS: {match.risk_flags}\n\n"
        "SUBMISSION:\n"
        + submission.model_dump_json(indent=2)
        + "\n\nCARRIER_APPETITE:\n"
        + json.dumps([r.model_dump(mode="json") for r in carrier.appetite], indent=2)
    )


def _score_appetite(
    submission: Submission, carriers: list[Carrier], llm: LlmClient
) -> tuple[list[AppetiteMatch], str]:
    if not carriers:
        return [], "No carriers passed the prefilter for this risk."

    response = llm.complete_json(
        system=APPETITE_SYSTEM,
        user=_appetite_user_prompt(submission, carriers),
        max_tokens=2048,
    )
    by_id = {c.carrier_id: c for c in carriers}
    matches: list[AppetiteMatch] = []
    for raw in response.get("matches", []):
        carrier = by_id.get(raw["carrier_id"])
        if not carrier:
            continue
        matches.append(AppetiteMatch(
            carrier_id=carrier.carrier_id,
            carrier_name=carrier.name,
            score=float(raw.get("score", 0.0)),
            rationale=raw.get("rationale", ""),
            risk_flags=list(raw.get("risk_flags", [])),
            submission_email=carrier.submission_email,
            typical_quote_back_days=carrier.typical_quote_back_days,
        ))
    matches.sort(key=lambda m: m.score, reverse=True)
    return matches, response.get("summary", "")


def _draft_emails(
    submission: Submission,
    matches: list[AppetiteMatch],
    carriers: list[Carrier],
    llm: LlmClient,
    *,
    score_threshold: float = 0.5,
) -> list[DraftedEmail]:
    by_id = {c.carrier_id: c for c in carriers}
    drafts: list[DraftedEmail] = []
    for match in matches:
        if match.score < score_threshold:
            continue
        carrier = by_id[match.carrier_id]
        response = llm.complete_json(
            system=DRAFT_SYSTEM,
            user=_draft_user_prompt(submission, carrier, match),
            max_tokens=1500,
        )
        drafts.append(DraftedEmail(
            carrier_id=carrier.carrier_id,
            to=carrier.submission_email,
            subject=response.get("subject", "New Submission"),
            body=response.get("body", ""),
            attachments=["ACORD_125.pdf", "ACORD_126.pdf", "loss_runs.pdf"],
        ))
    return drafts


def triage_submission(
    submission: Submission,
    carriers: list[Carrier],
    *,
    llm: LlmClient | None = None,
    score_threshold: float = 0.5,
) -> TriageResult:
    """Run the full triage flow for a single submission."""
    llm = llm or get_client()
    eligible = prefilter(carriers, submission)
    matches, summary = _score_appetite(submission, eligible, llm)
    drafts = _draft_emails(submission, matches, eligible, llm, score_threshold=score_threshold)
    return TriageResult(
        submission_id=submission.submission_id,
        matches=matches,
        drafted_emails=drafts,
        summary=summary,
    )
