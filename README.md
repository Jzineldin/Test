# Submission Triage Agent — Wholesale Commercial Insurance

An agentic backend + dashboard for **wholesale commercial insurance brokers / MGAs**
that ingests submissions from retail agents (ACORD PDFs or normalized JSON),
matches risks to carrier appetite, drafts carrier-ready submission emails,
sends them via SES, and tracks quote-back replies.

**Status:** v0.2 — multi-tenant, billing-aware, end-to-end runnable locally
without any cloud credentials.

## Why this exists

Wholesale brokers (E&S / MGA market) drown in inbound submissions. A 20-person
shop processes 200–600/month. Each submission today costs 30–90 minutes of CSR
time to triage, classify, match to carrier appetite, and package for outbound.
This collapses that work to seconds and produces a reviewable artifact.

## Run locally (no cloud creds needed)

```bash
# Terminal 1 — API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000

# Terminal 2 — dashboard
cd web && npm install && npm run dev      # http://localhost:3000

# Tests
cd api && .venv/bin/pytest                 # 53 passing
```

Default API key for the demo org: `demo-key-change-in-prod`. The dashboard
auto-fills it on first visit.

## Architecture

```
Inbound (PDF upload / JSON / email)
        │
        ▼
   GCP Document AI (Form Parser)  ─►  field_map.py  ─►  Submission
        │
        ▼
        ┌───────────────────────────┐
        │  Deterministic prefilter  │ (state / line / NAICS / revenue)
        └───────────┬───────────────┘
                    ▼
        ┌───────────────────────────┐
        │  Claude appetite scorer   │ (0–1, rationale, risk_flags)
        └───────────┬───────────────┘
                    ▼
        ┌───────────────────────────┐
        │  Per-carrier email drafter│ (Claude)
        └───────────┬───────────────┘
                    ▼
        ┌───────────────────────────┐
        │  Postgres / SQLite        │ (org-scoped TriageRun + Match + Draft)
        └───────────┬───────────────┘
                    ▼
        ┌───────────────────────────┐
        │  AWS SES outbound         │ ─►  Inbound webhook  ─►  reply tracked
        └───────────────────────────┘
```

## Stack

| Layer        | Tech                                                          |
|--------------|---------------------------------------------------------------|
| LLM          | Anthropic Claude (Sonnet 4.6); StubClient for offline runs    |
| Form parsing | GCP Document AI Form Parser; FakeDocAiClient for tests        |
| API          | FastAPI on AWS Lambda (Mangum-ready)                          |
| DB           | SQLite locally, Postgres in prod (`DATABASE_URL`)             |
| Auth         | API-key Bearer tokens, org-scoped                             |
| Email        | AWS SES (boto3); StubEmailClient for offline runs             |
| Billing      | Stripe (checkout + webhook); StubBillingClient for offline    |
| Dashboard    | Next.js 15 App Router + Tailwind, dark theme                  |
| Heavy/batch  | OVH bare-metal (vector DB, dev/staging)                       |

## Cloud-credit allocation

| Provider | $   | Purpose |
|----------|-----|---------|
| AWS      | 15k | Lambda, S3, SES, RDS, Bedrock |
| OVH      | 10k | Qdrant + staging + batch jobs |
| Azure    | 5k  | Azure OpenAI failover, Microsoft Graph for Outlook brokers |
| GCP      | 2k  | Document AI |

## Production environment variables

| Name                          | What it enables                                        |
|-------------------------------|--------------------------------------------------------|
| `DATABASE_URL`                | Postgres connection (defaults to local SQLite)         |
| `AWS_ACCESS_KEY_ID` + secret  | Activates Bedrock LLM (preferred when on AWS)          |
| `BEDROCK_MODEL_ID`            | Override default `us.anthropic.claude-sonnet-4-6`      |
| `LLM_PROVIDER`                | `bedrock` or `anthropic` to force one (default: auto)  |
| `ANTHROPIC_API_KEY`           | Real Claude direct (used if Bedrock isn't configured)  |
| `GCP_PROJECT_ID`              | DocAI parsing (combined with the next two)             |
| `DOCAI_PROCESSOR_ID`          | DocAI processor id (Form Parser)                       |
| `DOCAI_LOCATION`              | DocAI region (`us` or `eu`)                            |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service-account JSON                    |
| `SES_FROM_ADDRESS`            | Verified sender; activates SesEmailClient              |
| `AWS_REGION`                  | SES region (defaults to `us-east-1`)                   |
| `STRIPE_SECRET_KEY`           | Activates StripeBillingClient                          |
| `STRIPE_WEBHOOK_SECRET`       | Signature verification for /webhooks/stripe            |
| `CORS_ORIGINS`                | Comma-list of allowed dashboard origins                |

Without any of these, the corresponding subsystem falls back to a deterministic
in-memory stub. The whole demo runs offline.

## HTTP surface

```
GET    /healthz                       liveness, no auth
GET    /me                            who am I?

POST   /triage                        normalized JSON submission -> triage
POST   /triage/upload                 ACORD PDF -> DocAI -> triage

GET    /carriers                      loaded carrier appetite guides
GET    /history                       recent triage runs (org-scoped)
GET    /history/{id}                  full triage detail incl. drafts

GET    /drafts/{id}                   single draft status
POST   /drafts/{id}/send              send via SES (or stub), stamp sent_at

POST   /webhooks/inbound              record an inbound quote reply (no auth)
POST   /webhooks/stripe               handle Stripe events (signed)

GET    /billing/usage                 plan, quota, current period count
POST   /billing/checkout-link         Stripe Checkout Session URL
```

All endpoints except `/healthz` and the two `/webhooks/*` require
`Authorization: Bearer <api_key>`.

## Layout

```
api/
  app/
    models.py            pydantic domain models
    parsers/             ACORD parsers (JSON + DocAI adapter + field map)
    agent/               prefilter + appetite scoring + email drafting
    llm/                 Claude client (Stub + Anthropic; Bedrock to follow)
    email/               SES client + stub
    billing/             Stripe client + stub + usage metering
    db/                  SQLAlchemy models + session + repository + orgs
    auth.py              API-key Bearer dependency
    main.py              FastAPI app
    cli.py               local CLI demo
  tests/                 53 tests, in-memory SQLite, no network
  requirements.txt
web/
  app/
    page.tsx             marketing landing page (/)
    app/page.tsx         interactive demo dashboard (/app)
    layout.tsx
    globals.css
  lib/                   shared TS types + embedded sample
  package.json
data/
  carriers/              carrier appetite guides (4 sample carriers)
  submissions/           sample submissions (Acme Plumbing TX)
docs/                    ICP, architecture deep-dives
```

## What's deliberately not built yet

- **alembic migrations** — `Base.metadata.create_all()` is fine pre-launch;
  add alembic before the first prod schema change.
- **Magic-link / OAuth login** — current auth is API-key only. The dashboard
  exposes the key to users in localStorage; productionize before public launch.
- **Custom DocAI processor** — generic Form Parser is wired; for ACORD-specific
  accuracy, train a Document AI Custom Extractor on labeled forms.
- **Per-quote outcome pricing** — usage today is per-submission. Switch to a
  dedicated `usage_records` table when we move to per-quote.
