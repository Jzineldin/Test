"""Notification fan-out.

Right now we support Slack incoming webhooks (the most common broker
side-channel) plus a stub for tests/local dev. The signature is generic
so MS Teams / Discord / a custom webhook drop in trivially.

Each Org carries a `notification_webhook_url`. When set, inbound carrier
replies trigger a message via the matching client. When unset, nothing
fires - silent fallback.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class Notification:
    title: str
    body: str
    fields: dict[str, str] = field(default_factory=dict)
    link: str | None = None


class NotificationClient(Protocol):
    def send(self, n: Notification) -> bool: ...


class StubNotificationClient:
    """Records sent notifications in memory; no network I/O."""

    def __init__(self) -> None:
        self.outbox: list[Notification] = []

    def send(self, n: Notification) -> bool:
        self.outbox.append(n)
        return True


class SlackWebhookClient:
    """Posts a Slack-formatted message to an incoming webhook URL."""

    def __init__(self, webhook_url: str) -> None:
        self.webhook_url = webhook_url

    def send(self, n: Notification) -> bool:
        import httpx  # local import; the SDK is already a dep via FastAPI tests

        blocks: list[dict] = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": n.title},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": n.body},
            },
        ]
        if n.fields:
            blocks.append({
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*{k}*\n{v}"}
                    for k, v in n.fields.items()
                ],
            })
        if n.link:
            blocks.append({
                "type": "actions",
                "elements": [{
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Open in dashboard"},
                    "url": n.link,
                }],
            })

        try:
            r = httpx.post(self.webhook_url, json={"blocks": blocks}, timeout=5.0)
            return 200 <= r.status_code < 300
        except httpx.HTTPError:
            return False


def get_client_for_url(url: str | None) -> NotificationClient | None:
    """Pick the right client for an Org's configured webhook URL.

    Returns None when no URL is set so callers can short-circuit cheaply.
    """
    if not url:
        return None
    if "hooks.slack.com" in url:
        return SlackWebhookClient(url)
    # Generic webhook fallback uses the same Slack-blocks shape; most
    # MS Teams / Discord adapters accept it.
    return SlackWebhookClient(url)
