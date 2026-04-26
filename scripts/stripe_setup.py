"""One-shot Stripe setup for AppetiteMatch.

Creates the Product, recurring Price, and Webhook endpoint pointing
at the Render API. Idempotent: re-running won't duplicate anything;
it'll find the existing objects by name/url and reuse them.

Usage:
    pip install stripe
    export STRIPE_SECRET_KEY=sk_live_...        # or sk_test_...
    python scripts/stripe_setup.py

Optional env vars (sensible defaults):
    PRODUCT_NAME        default "AppetiteMatch Pro"
    PRICE_AMOUNT_CENTS  default 49900  (= $499.00)
    PRICE_CURRENCY      default "usd"
    PRICE_INTERVAL      default "month"
    WEBHOOK_URL         default "https://submission-triage-api.onrender.com/webhooks/stripe"
"""
from __future__ import annotations

import os
import sys

try:
    import stripe
except ImportError:
    sys.exit("pip install stripe first")

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
if not stripe.api_key:
    sys.exit("STRIPE_SECRET_KEY not set")

PRODUCT_NAME = os.environ.get("PRODUCT_NAME", "AppetiteMatch Pro")
PRODUCT_DESCRIPTION = (
    "Submission triage and carrier appetite matching for wholesale "
    "commercial insurance brokers."
)
PRICE_AMOUNT_CENTS = int(os.environ.get("PRICE_AMOUNT_CENTS", "49900"))
PRICE_CURRENCY = os.environ.get("PRICE_CURRENCY", "usd")
PRICE_INTERVAL = os.environ.get("PRICE_INTERVAL", "month")
WEBHOOK_URL = os.environ.get(
    "WEBHOOK_URL", "https://submission-triage-api.onrender.com/webhooks/stripe"
)
WEBHOOK_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
]


def find_product_by_name(name: str):
    for p in stripe.Product.list(limit=100, active=True).auto_paging_iter():
        if p.name == name:
            return p
    return None


def find_price_for_product(product_id: str, amount_cents: int, interval: str):
    for pr in stripe.Price.list(product=product_id, active=True, limit=100).auto_paging_iter():
        if (
            pr.unit_amount == amount_cents
            and pr.recurring
            and pr.recurring.interval == interval
        ):
            return pr
    return None


def find_webhook(url: str):
    for w in stripe.WebhookEndpoint.list(limit=100).auto_paging_iter():
        if w.url == url:
            return w
    return None


def main() -> None:
    mode = "LIVE" if stripe.api_key.startswith("sk_live_") else "TEST"
    print(f"\n=== Stripe setup ({mode} mode) ===\n")

    product = find_product_by_name(PRODUCT_NAME)
    if product:
        print(f"product       reused  {product.id}  ({product.name})")
    else:
        product = stripe.Product.create(
            name=PRODUCT_NAME, description=PRODUCT_DESCRIPTION
        )
        print(f"product       created {product.id}  ({product.name})")

    price = find_price_for_product(product.id, PRICE_AMOUNT_CENTS, PRICE_INTERVAL)
    if price:
        print(f"price         reused  {price.id}  "
              f"(${PRICE_AMOUNT_CENTS/100:.2f}/{PRICE_INTERVAL})")
    else:
        price = stripe.Price.create(
            product=product.id,
            unit_amount=PRICE_AMOUNT_CENTS,
            currency=PRICE_CURRENCY,
            recurring={"interval": PRICE_INTERVAL},
        )
        print(f"price         created {price.id}  "
              f"(${PRICE_AMOUNT_CENTS/100:.2f}/{PRICE_INTERVAL})")

    webhook = find_webhook(WEBHOOK_URL)
    webhook_secret_note = ""
    if webhook:
        print(f"webhook       reused  {webhook.id}  -> {webhook.url}")
        webhook_secret_note = (
            "(webhook already existed - Stripe only reveals the signing "
            "secret on creation. If you don't have it saved, delete the "
            "endpoint in the Stripe dashboard and re-run this script.)"
        )
    else:
        webhook = stripe.WebhookEndpoint.create(
            url=WEBHOOK_URL,
            enabled_events=WEBHOOK_EVENTS,
            description="AppetiteMatch Render API",
        )
        print(f"webhook       created {webhook.id}  -> {webhook.url}")

    print("\n=== Paste these into Render (Environment tab) ===\n")
    print(f"STRIPE_SECRET_KEY={stripe.api_key}")
    if getattr(webhook, "secret", None):
        print(f"STRIPE_WEBHOOK_SECRET={webhook.secret}")
    else:
        print(f"STRIPE_WEBHOOK_SECRET=<see note below>")
        print(f"  {webhook_secret_note}")

    print("\n=== Paste this into Vercel (Settings → Environment Variables) ===\n")
    print(f"NEXT_PUBLIC_STRIPE_PRICE_ID={price.id}")
    print()


if __name__ == "__main__":
    main()
