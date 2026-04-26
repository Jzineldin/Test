"""Stripe billing abstraction.

Two implementations:
  * StubBillingClient - deterministic, in-memory. Default. Lets the
                         dashboard's billing flow work in dev without keys.
  * StripeBillingClient - real stripe-python SDK. Activates when
                           STRIPE_SECRET_KEY is set.

ACP note: this iteration covers standard subscription billing. The
Agentic Commerce Protocol (Stripe ACP) is layered on top and uses the
same Customer + Subscription objects, so wiring agent-to-merchant
purchases later doesn't require schema changes.
"""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CheckoutSession:
    id: str
    url: str
    customer_id: str | None


class BillingClient(Protocol):
    def ensure_customer(self, *, org_id: int, name: str, slug: str) -> str: ...
    def create_checkout_session(
        self, *, customer_id: str, price_id: str, success_url: str, cancel_url: str,
    ) -> CheckoutSession: ...
    def create_portal_session(
        self, *, customer_id: str, return_url: str,
    ) -> str: ...
    def verify_webhook(self, *, payload: bytes, signature: str) -> dict: ...


class StubBillingClient:
    """In-memory stand-in. Returns deterministic-looking ids and a fake URL.

    The fake checkout URL is harmless - clicking it just shows Stripe's
    standard 'session expired' page, which is fine for demoing the flow.
    """

    def __init__(self) -> None:
        self._customers: dict[int, str] = {}

    def ensure_customer(self, *, org_id: int, name: str, slug: str) -> str:
        if org_id not in self._customers:
            self._customers[org_id] = f"cus_stub_{slug}_{org_id}"
        return self._customers[org_id]

    def create_checkout_session(
        self, *, customer_id: str, price_id: str, success_url: str, cancel_url: str,
    ) -> CheckoutSession:
        sid = f"cs_stub_{uuid.uuid4().hex[:20]}"
        return CheckoutSession(
            id=sid,
            url=f"https://checkout.stripe.com/c/pay/{sid}",
            customer_id=customer_id,
        )

    def create_portal_session(
        self, *, customer_id: str, return_url: str,
    ) -> str:
        # Deterministic stub URL - fine for local dev; clicking it shows
        # Stripe's "session expired" page which is harmless.
        return f"https://billing.stripe.com/p/session/stub_{customer_id}"

    def verify_webhook(self, *, payload: bytes, signature: str) -> dict:
        # In stub mode we trust the payload as-is so devs can curl the
        # webhook endpoint without computing a signature.
        import json
        return json.loads(payload.decode("utf-8"))


class StripeBillingClient:
    """Real Stripe via the official SDK."""

    def __init__(
        self,
        secret_key: str | None = None,
        webhook_secret: str | None = None,
    ) -> None:
        self._stripe = self._import_stripe()
        self._stripe.api_key = secret_key or os.environ["STRIPE_SECRET_KEY"]
        self.webhook_secret = webhook_secret or os.environ.get("STRIPE_WEBHOOK_SECRET")

    @staticmethod
    def _import_stripe():
        import stripe  # noqa: PLC0415  (lazy)
        return stripe

    def ensure_customer(self, *, org_id: int, name: str, slug: str) -> str:
        customer = self._stripe.Customer.create(
            name=name,
            metadata={"org_id": str(org_id), "slug": slug},
        )
        return customer.id

    def create_checkout_session(
        self, *, customer_id: str, price_id: str, success_url: str, cancel_url: str,
    ) -> CheckoutSession:
        session = self._stripe.checkout.Session.create(
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return CheckoutSession(
            id=session.id, url=session.url, customer_id=customer_id,
        )

    def create_portal_session(
        self, *, customer_id: str, return_url: str,
    ) -> str:
        session = self._stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return session.url

    def verify_webhook(self, *, payload: bytes, signature: str) -> dict:
        if not self.webhook_secret:
            raise RuntimeError("STRIPE_WEBHOOK_SECRET not set; cannot verify")
        event = self._stripe.Webhook.construct_event(
            payload=payload, sig_header=signature, secret=self.webhook_secret,
        )
        return event.to_dict() if hasattr(event, "to_dict") else dict(event)


_default: BillingClient | None = None


def get_client() -> BillingClient:
    global _default
    if os.environ.get("STRIPE_SECRET_KEY"):
        return StripeBillingClient()
    if _default is None:
        _default = StubBillingClient()
    return _default
