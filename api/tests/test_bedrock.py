"""Bedrock LLM client tests - never call AWS.

A FakeBedrockBoto returns a hand-crafted InvokeModel response shape,
so we exercise the real BedrockClient against a stand-in boto3 client.
"""
from __future__ import annotations

import io
import json

import pytest

from app.llm.client import BedrockClient, _aws_creds_present, get_client


class FakeStreamingBody:
    """Mimics boto3's StreamingBody (`.read()` returns bytes once)."""

    def __init__(self, data: bytes) -> None:
        self._buf = io.BytesIO(data)

    def read(self) -> bytes:
        return self._buf.read()


class FakeBedrockBoto:
    """Records the last invoke_model call and returns canned content."""

    def __init__(self, content_blocks: list[dict]) -> None:
        self.last_call: dict | None = None
        self._content = content_blocks

    def invoke_model(self, **kwargs):
        self.last_call = kwargs
        body = json.dumps({"content": self._content}).encode("utf-8")
        return {"body": FakeStreamingBody(body)}


def test_complete_text_concatenates_text_blocks():
    fake = FakeBedrockBoto([
        {"type": "text", "text": "Hello "},
        {"type": "text", "text": "world."},
    ])
    client = BedrockClient(client=fake)
    out = client.complete_text("you are a tester", "say hi")
    assert out == "Hello world."


def test_invoke_model_payload_uses_bedrock_messages_shape():
    fake = FakeBedrockBoto([{"type": "text", "text": "ok"}])
    BedrockClient(client=fake).complete_text("S", "U", max_tokens=128)

    body = json.loads(fake.last_call["body"])
    assert body["anthropic_version"] == "bedrock-2023-05-31"
    assert body["max_tokens"] == 128
    # System is a list of blocks with cache_control set so Anthropic /
    # Bedrock prompt-cache the static instructions across runs.
    assert body["system"] == [{
        "type": "text",
        "text": "S",
        "cache_control": {"type": "ephemeral"},
    }]
    assert body["messages"] == [{"role": "user", "content": "U"}]


def test_complete_json_strips_markdown_fences():
    fenced = "```json\n{\"matches\": [], \"summary\": \"none\"}\n```"
    fake = FakeBedrockBoto([{"type": "text", "text": fenced}])
    out = BedrockClient(client=fake).complete_json("s", "u")
    assert out == {"matches": [], "summary": "none"}


def test_complete_json_parses_strict_json():
    raw = json.dumps({"matches": [{"carrier_id": "x", "score": 0.9}]})
    fake = FakeBedrockBoto([{"type": "text", "text": raw}])
    out = BedrockClient(client=fake).complete_json("s", "u")
    assert out["matches"][0]["carrier_id"] == "x"


def test_get_client_picks_bedrock_when_aws_creds_present(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAFAKE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "fake")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    # Forcing import of boto3 will succeed (installed in deps) but we
    # don't actually call AWS. Just confirm the right class is chosen.
    client = get_client()
    assert isinstance(client, BedrockClient)


def test_get_client_falls_back_to_stub_without_creds(monkeypatch):
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_SECRET_ACCESS_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setattr(
        "os.path.exists", lambda p: False if "aws/credentials" in p else True,
    )
    from app.llm.client import StubClient
    assert isinstance(get_client(), StubClient)


def test_llm_provider_anthropic_overrides_aws(monkeypatch):
    """If both providers are configured, LLM_PROVIDER=anthropic wins."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAFAKE")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    from app.llm.client import AnthropicClient
    # AnthropicClient construction calls Anthropic() which does NOT make
    # a network call - only validates the key format on first request.
    client = get_client()
    assert isinstance(client, AnthropicClient)


def test_aws_creds_present_via_env(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAFAKE")
    assert _aws_creds_present() is True


def test_aws_creds_absent(monkeypatch):
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.setattr(
        "os.path.exists", lambda p: False if "aws/credentials" in p else True,
    )
    assert _aws_creds_present() is False
