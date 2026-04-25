"""LLM client abstraction.

Three implementations, picked in priority order:
  1. BedrockClient   — Claude via AWS Bedrock. Default when AWS creds are
                        present (common case for prod deploys on AWS).
  2. AnthropicClient — Claude via the Anthropic SDK direct. Used when
                        ANTHROPIC_API_KEY is set and Bedrock isn't.
  3. StubClient      — deterministic, no network. Tests + offline demo.
"""
from __future__ import annotations

import json
import os
from typing import Protocol

DEFAULT_MODEL = "claude-sonnet-4-6"


def _default_bedrock_model() -> str:
    """Bedrock has its own model-id namespace. Newer Claude models require a
    Cross-Region Inference Profile rather than direct model invocation, so
    the default carries the `us.` prefix. Override via BEDROCK_MODEL_ID
    (e.g. `us.anthropic.claude-opus-4-7` for higher-capability runs)."""
    return os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")


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
    """Real Claude via the Anthropic SDK.

    System prompts are flagged with `cache_control: ephemeral` so the
    appetite-scorer's static instructions are prompt-cached across runs
    — saves ~50% on input tokens once warm.
    """

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
            system=[{
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": user}],
        )
        return "".join(block.text for block in msg.content if block.type == "text")


class BedrockClient:
    """Claude via AWS Bedrock (boto3 bedrock-runtime).

    Reads credentials from boto3's standard chain (env vars, ~/.aws/credentials,
    instance role). The client is constructed lazily so importing this
    module never forces a hard boto3 dependency at module load time.
    """

    def __init__(
        self,
        model: str | None = None,
        region: str | None = None,
        *,
        client=None,
    ) -> None:
        self.model = model or _default_bedrock_model()
        self.region = region or os.environ.get("AWS_REGION", "us-east-1")
        if client is not None:
            self._client = client
        else:
            import boto3  # noqa: PLC0415  (lazy)

            self._client = boto3.client("bedrock-runtime", region_name=self.region)

    def complete_text(self, system: str, user: str, *, max_tokens: int = 2048) -> str:
        # Bedrock accepts the same Anthropic prompt-caching shape as the
        # direct API: a list of system blocks each with cache_control.
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": [{
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }],
            "messages": [{"role": "user", "content": user}],
        }
        response = self._client.invoke_model(
            modelId=self.model,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body).encode("utf-8"),
        )
        # InvokeModel's `body` is a StreamingBody — read once, parse JSON.
        payload = json.loads(response["body"].read())
        return "".join(
            block.get("text", "")
            for block in payload.get("content", [])
            if block.get("type") == "text"
        )

    def complete_json(self, system: str, user: str, *, max_tokens: int = 2048) -> dict:
        text = self.complete_text(
            system + "\n\nReply with strict JSON only — no prose, no markdown fences.",
            user,
            max_tokens=max_tokens,
        ).strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())


def _aws_creds_present() -> bool:
    """Match boto3's resolution order, cheaply.

    Returns True if either AWS_ACCESS_KEY_ID is in the env OR a credentials
    file exists. We don't actually call STS — the caller will hit a clean
    error from boto3 if the creds are bad, and we don't want to fail
    closed at import time.
    """
    if os.environ.get("AWS_ACCESS_KEY_ID"):
        return True
    return os.path.exists(os.path.expanduser("~/.aws/credentials"))


def get_client(*, live: bool = False) -> LlmClient:
    """Pick the highest-priority configured client.

    Priority:
      Bedrock (AWS creds present)
      → Anthropic direct (ANTHROPIC_API_KEY set)
      → Stub (offline / local dev)

    `live=True` skips the stub but still respects the priority above.
    """
    use_bedrock = os.environ.get("LLM_PROVIDER", "").lower() == "bedrock" or (
        os.environ.get("LLM_PROVIDER", "").lower() != "anthropic" and _aws_creds_present()
    )
    if use_bedrock:
        return BedrockClient()
    if live or os.environ.get("ANTHROPIC_API_KEY"):
        return AnthropicClient()
    return StubClient()
