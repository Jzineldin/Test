"""Rate limiting via slowapi.

Default: per-IP for unauth endpoints (the inbound webhook), per-API-key
for the rest. Limits are deliberately generous — they exist to cap blast
radius if a key is leaked or a webhook source goes haywire, not to
throttle normal use.

Override globally with RATE_LIMIT_DEFAULT, e.g. "200/minute".
"""
from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _identifier(request: Request) -> str:
    """Per-API-key when authed; per-IP otherwise."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        # First 24 chars of the key are enough to bucket a tenant without
        # ever logging the full secret. Keys are 48+ url-safe chars; a
        # 24-char prefix has 144 bits of entropy — collision-safe.
        return f"key:{auth.split(None, 1)[1].strip()[:24]}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_identifier,
    default_limits=[os.environ.get("RATE_LIMIT_DEFAULT", "120/minute")],
    # headers_enabled=True would require every limited handler to accept
    # `response: Response` so slowapi can stamp X-RateLimit-* headers on
    # it. Skipping for now — clients learn the limit from a 429 with the
    # Retry-After body, which is the only signal that matters in practice.
    headers_enabled=False,
)
