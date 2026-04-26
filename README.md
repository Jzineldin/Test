# AppetiteMatch - Submission Triage for Wholesale Insurance Brokers

An agentic backend + dashboard for **wholesale commercial insurance brokers / MGAs**
that ingests submissions from retail agents (ACORD PDFs or normalized JSON),
matches risks to carrier appetite, drafts carrier-ready submission emails,
attaches the original ACORD on send via SES, and tracks quote-back replies.

Live demo: https://appetitematch.com

## One-click deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Jzineldin/Test)
&nbsp;&nbsp;
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJzineldin%2FTest&root-directory=web&env=NEXT_PUBLIC_API_URL&envDescription=Render%20API%20URL%20from%20step%201)

**Click Render first** (deploys the FastAPI backend + Postgres). When that's
live, copy the `.onrender.com` URL and **click Vercel** - it'll prompt you for
`NEXT_PUBLIC_API_URL`, paste the Render URL there. Full step-by-step in
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Why this exists

Wholesale brokers (E&S / MGA market) drown in inbound submissions. A 20-person
shop processes 200-600/month. Each submission today costs 30-90 minutes of CSR
time to triage, classify, match to carrier appetite, and package for outbound.
This collapses that work to seconds and produces a reviewable artifact.

## Run locally (no cloud creds needed)

```bash
# Terminal 1 - API
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000

# Terminal 2 - dashboard
cd web && npm install && npm run dev      # http://localhost:3000

# Tests
cd api && .venv/bin/pytest                 # 118 passing
```

Local dev uses cookie auth via the magic-link flow at `/login` - sign in
with any email and the link lands in the in-memory stub email outbox
(grep the API process stdout for `triage_session`). For curl-style
testing, the bundled demo org has a well-known bearer key
(`demo-key-change-in-prod`) so you can hit `/triage` without going
through magic-link first.

## Self-serve signup

Brokers create their own account at `/signup` (name + email + brokerage).
The flow:

1. POST `/auth/signup` creates an Org + admin User
2. Magic link is mailed via `submissions@appetitematch.com` (SES, with
   DKIM + DMARC aligned on the appetitematch.com domain)
3. Click → `/login/verify?token=...` → session cookie set →
   redirect to `/app`
4. Bundled four sample carriers auto-seed into the new org so the
   first triage produces matches immediately.

Org admins manage their carrier directory at `/app/carriers` and review
audit history at `/app/audit`. API key for programmatic access lives
in Settings; rotation invalidates the old bearer instantly.

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
        │  Claude appetite scorer   │ (0-1, rationale, risk_flags)
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
| `GCP_SERVICE_ACCOUNT_JSON`    | Inline JSON alternative for Render/Lambda hosts        |
| `DASHBOARD_URL`               | Origin baked into magic-link emails (`https://appetitematch.com`) |
| `COOKIE_SECURE`               | `true` flips session cookie to SameSite=None+Secure for cross-site auth |
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
PATCH  /me                            update org settings
GET    /me/api-key                    reveal current bearer (cookie-gated)
POST   /me/api-key/rotate             mint new bearer, invalidate old

POST   /auth/signup                   new broker self-serve signup (emails magic link)
POST   /auth/login                    request a magic link for an existing user
POST   /auth/verify                   exchange magic-link token for session cookie
POST   /auth/logout                   revoke session + delete cookie

POST   /triage                        normalized JSON submission -> triage
POST   /triage/upload                 ACORD PDF -> DocAI -> triage (PDF stored for SES attach)

GET    /carriers                      org's carrier appetite guides
POST   /carriers                      create or update one carrier
DELETE /carriers/{id}                 remove a carrier from this org's directory

GET    /history                       recent triage runs (org-scoped)
GET    /history/{id}                  full triage detail incl. drafts + reply state

GET    /drafts/{id}                   single draft status
POST   /drafts/{id}/send              send via SES (attaches stored ACORD), stamp sent_at
POST   /drafts/{id}/outcome           promote a reply to bound/declined

POST   /webhooks/inbound              record an inbound quote reply (HMAC-signed)
POST   /webhooks/stripe               handle Stripe events (signature-verified)

GET    /billing/usage                 plan, quota, current period count
POST   /billing/checkout-link         Stripe Checkout Session URL

GET    /audit                         org-scoped audit event feed
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
  carriers/              bundled sample carriers - auto-seeded into each
                         new org on first signup, then editable per-org
                         via /app/carriers and /carriers REST endpoints
  submissions/           sample submissions (Acme Plumbing TX)
docs/                    ICP, architecture deep-dives
```

## Schema migrations

Alembic is wired and tracks the schema. Initial revision lives at
`api/migrations/versions/`. Lambda cold start runs `alembic upgrade head`
before serving traffic; tests use `Base.metadata.create_all()` for speed.

```bash
# Generate a new migration after changing models
cd api && .venv/bin/alembic revision --autogenerate -m "add foo column"

# Apply migrations (idempotent)
.venv/bin/alembic upgrade head

# Roll back one step
.venv/bin/alembic downgrade -1
```

## CI

`.github/workflows/ci.yml` runs on every PR + push to main:
- API: `pytest` (66 tests) + `alembic upgrade head` against a fresh DB
- Dashboard: `npm ci` + `next build`

## Observability

`api/app/logging.py` produces structured JSON on stdout. CloudWatch indexes
every key automatically; locally you can `jq` the output:

```bash
uvicorn app.main:app | jq 'select(.logger == "submission_triage")'
```

Each `triage.completed` event carries `org_id`, `submission_id`, `insured`,
`match_count`, `draft_count`. Override `LOG_LEVEL=DEBUG` to see HTTP-level
chatter.

## What's deliberately not built yet

- **Custom DocAI processor** - generic Form Parser is wired; for ACORD-specific
  accuracy, train a Document AI Custom Extractor on labeled forms.
- **Workload Identity Federation for GCP** - current setup uses a static
  service-account JSON. WIF gets us short-lived tokens with no key
  material at rest, required for SOC 2 Type II.
- **AMS write-back** - Applied Epic / AMS360 / HawkSoft. The real
  carrier-side lock-in lives here.
- **Per-quote outcome pricing** - usage today is per-submission. Switch
  to a dedicated `usage_records` table when we move to per-quote.
- **SES Inbound forwarding** - brokers want to forward retail emails
  to `triage+orgslug@appetitematch.com` and have a TriageRun pop up
  automatically. Settings panel already collects the alias; the
  Lambda glue isn't wired yet.
- **Soft-delete + 30-day recovery for orgs** - current account
  deletion is hard-delete on next call (none implemented).
