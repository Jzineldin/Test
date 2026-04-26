"""HMAC webhook verification.

Inbound webhook senders attach `X-Triage-Signature: sha256=<hex>` where
the digest is HMAC-SHA256(webhook_secret, raw_request_body). Constant-time
comparison guards against timing oracles.

Two failure modes:
  * Header missing      -> 401 (caller didn't sign)
  * Digest mismatch     -> 401 (wrong secret or tampered payload)

Looking up the org's secret depends on the route - for /webhooks/inbound
we resolve via provider_message_id after parsing; for /webhooks/email we
resolve via the `to` field. Both routes therefore validate AFTER the JSON
is parsed but before any side effects run.
"""
from __future__ import annotations

import hashlib
import hmac

from fastapi import HTTPException


def expected_signature(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_signature(*, secret: str, body: bytes, header: str | None) -> None:
    """Raise 401 unless the header matches the expected digest.

    Skips verification when the org has no webhook_secret configured -
    that's the back-compat path for orgs created before this feature
    landed. New orgs always get a secret.
    """
    if secret is None:
        return  # nothing configured; treat as unsigned (legacy)
    if not header:
        raise HTTPException(401, detail="Missing X-Triage-Signature header")
    expected = expected_signature(secret, body)
    if not hmac.compare_digest(header.strip(), expected):
        raise HTTPException(401, detail="Bad webhook signature")
