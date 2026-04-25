"""LLM client abstraction.

Two implementations:
  * StubClient      — deterministic, no network. Used by tests + offline demo.
  * AnthropicClient — real Claude via the Anthropic SDK. Used when
                       ANTHROPIC_API_KEY is set OR caller passes live=True.

Bedrock support lands later via the same interface.
"""
from __future__ import annotations

import json
import os
from typing import Protocol

DEFAULT_MODEL = "claude-sonnet-4-6"


class LlmClient(Protocol):
    def complete_json(self, system: str, user: str, *, max_tokens: int = 2048) -> dict: ...
    def complete_text(self, system: str, user: str, *, max_tokens: int = 2048) -> str: ...


class StubClient:
    """Returns canned, deterministic JSON shaped like the real prompts expect.

    The stub is keyed off marker strings in the user prompt so the same
    StubClient handles both the appetite-match and email-drafter prompts.
    """

    def complete_json(self, system: str, user: str, *, max_tokens: int = 2048) -> dict:
        if "APPETITE_MATCH_TASK" in user:
            return self._appetite_match_stub(user)
        if "DRAFT_EMAIL_TASK" in user:
            return self._draft_email_stub(user)
        return {"stub": True}

    def complete_text(self, system: str, user: str, *, max_tokens: int = 2048) -> str:
        return "Stub LLM response."

    @staticmethod
    def _appetite_match_stub(user: str) -> dict:
        # Heuristic stub: returns one match per carrier id mentioned in the prompt.
        carrier_ids = [
            line.split('"carrier_id": "', 1)[1].split('"', 1)[0]
            for line in user.splitlines()
            if '"carrier_id":' in line
        ]
        seen: set[str] = set()
        matches = []
        for cid in carrier_ids:
            if cid in seen:
                continue
            seen.add(cid)
            matches.append({
                "carrier_id": cid,
                "score": 0.72,
                "rationale": (
                    "Stub match: NAICS prefix and primary state are within "
                    "the carrier's published appetite; revenue is inside the "
                    "stated band."
                ),
                "risk_flags": [
                    "Loss ratio in PY-2 above 60% — flag for underwriter review",
                ],
            })
        return {"matches": matches, "summary": (
            "Stub triage: 3 viable markets identified, 1 prior-year loss "
            "ratio flag worth highlighting in the cover note."
        )}

    @staticmethod
    def _draft_email_stub(user: str) -> dict:
        return {
            "subject": "New Submission — Acme Plumbing Services LLC — GL/Auto eff 2026-06-01",
            "body": (
                "Hi Underwriting,\n\n"
                "Please find a new submission attached for Acme Plumbing "
                "Services LLC, a 14-year-old residential and light-commercial "
                "plumbing contractor headquartered in Austin, TX.\n\n"
                "Quick highlights:\n"
                "  - $4.2M revenue, 22 employees, no subcontracted labor\n"
                "  - Requesting GL ($1M/$2M) and Commercial Auto (8 vehicles)\n"
                "  - Effective 2026-06-01, expiring with Acuity at $38,400 combined\n"
                "  - Loss summary: 2 GL claims in 5 years, both closed under $5k\n\n"
                "ACORD 125/126/140 and 5-year loss runs are attached. "
                "Happy to jump on a call for any clarifying questions.\n\n"
                "Thanks,\n"
                "[Broker Name]\n"
            ),
        }


class AnthropicClient:
    """Real Claude via the Anthropic SDK."""

    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        from anthropic import Anthropic  # imported lazily so stub-only runs don't need it

        self._anthropic = Anthropic()
        self.model = model

    def complete_json(self, system: str, user: str, *, max_tokens: int = 2048) -> dict:
        text = self.complete_text(
            system + "\n\nReply with strict JSON only — no prose, no markdown fences.",
            user,
            max_tokens=max_tokens,
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())

    def complete_text(self, system: str, user: str, *, max_tokens: int = 2048) -> str:
        msg = self._anthropic.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")


def get_client(*, live: bool = False) -> LlmClient:
    """Return a live client if explicitly requested or an API key is present."""
    if live or os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicClient()
    return StubClient()
