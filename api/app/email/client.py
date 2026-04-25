"""Outbound email abstraction.

Two implementations:
  * StubEmailClient — in-memory, never touches the network. Default.
  * SesEmailClient  — AWS SES via boto3. Used when SES_FROM_ADDRESS and
                       AWS creds are present in the environment.

The endpoint never branches on env — it asks `get_client()` for whichever
is configured.
"""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SentEmail:
    provider_message_id: str
    to: str
    subject: str


class EmailClient(Protocol):
    def send(self, *, to: str, subject: str, body: str, reply_to: str | None = None) -> SentEmail: ...


class StubEmailClient:
    """Records sent messages in memory; assigns a fake provider id.

    Used by tests and by local dev when AWS isn't configured. The dashboard
    'Send' button stays functional — the message just doesn't leave the host.
    """

    def __init__(self) -> None:
        self.outbox: list[SentEmail] = []

    def send(self, *, to: str, subject: str, body: str, reply_to: str | None = None) -> SentEmail:
        sent = SentEmail(
            provider_message_id=f"stub-{uuid.uuid4()}",
            to=to,
            subject=subject,
        )
        self.outbox.append(sent)
        return sent


class SesEmailClient:
    """AWS SES via boto3.

    Requires:
      - SES_FROM_ADDRESS (verified sender)
      - AWS_REGION (defaults to us-east-1)
      - Standard boto3 credential resolution (env, profile, or instance role)
    """

    def __init__(self, from_address: str | None = None, region: str | None = None) -> None:
        self.from_address = from_address or os.environ["SES_FROM_ADDRESS"]
        self.region = region or os.environ.get("AWS_REGION", "us-east-1")
        # boto3 import lives inside __init__ so importing this module never
        # forces a hard dependency on boto3 at module load time.
        import boto3  # noqa: PLC0415  (intentional lazy import)

        self._client = boto3.client("ses", region_name=self.region)

    def send(self, *, to: str, subject: str, body: str, reply_to: str | None = None) -> SentEmail:
        kwargs = {
            "Source": self.from_address,
            "Destination": {"ToAddresses": [to]},
            "Message": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        }
        if reply_to:
            kwargs["ReplyToAddresses"] = [reply_to]
        response = self._client.send_email(**kwargs)
        return SentEmail(
            provider_message_id=response["MessageId"],
            to=to,
            subject=subject,
        )


_default: EmailClient | None = None


def get_client() -> EmailClient:
    """Return SES if SES_FROM_ADDRESS is set, otherwise the singleton stub.

    The stub is a singleton so that within a single process the outbox
    survives across requests (handy for inspecting sent items in tests
    and during local dev).
    """
    global _default
    if os.environ.get("SES_FROM_ADDRESS"):
        return SesEmailClient()
    if _default is None:
        _default = StubEmailClient()
    return _default
