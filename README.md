# Submission Triage Agent — Wholesale Commercial Insurance

An agentic backend for **wholesale commercial insurance brokers / MGAs** that ingests
submissions from retail agents (ACORD forms + email + attachments), matches risks to
carrier appetite, and drafts carrier-ready submission emails.

**Status:** v0 scaffold — end-to-end demo runs from CLI without cloud creds.

## Why this exists

Wholesale brokers (E&S / MGA market) drown in inbound submissions. A 20-person
shop processes 200–600/month. Each submission today costs 30–90 minutes of CSR
time to triage, classify, match to carrier appetite, and package for outbound.
This agent collapses that to seconds and produces a reviewable artifact.

## Architecture (target)

```
Inbound (email / upload)
        │
        ▼
   S3 (encrypted)
        │
        ▼
GCP Document AI  ──►  ACORD parse (125 / 126 / 140)
        │
        ▼
  Postgres (normalized submission)
        │
        ▼
Bedrock Claude  ──►  appetite match + risk summary
        │
        ▼
Carrier match table  +  per-carrier drafted submission email
        │
        ▼
Broker review (Next.js)  ──►  1-click send via SES
        │
        ▼
Quote-back tracking + nudges
```

## Stack

| Layer        | Tech                                              |
|--------------|---------------------------------------------------|
| LLM          | Anthropic Claude (via Bedrock primary, direct API fallback) |
| Form parsing | GCP Document AI (with stub for local dev)         |
| API          | FastAPI on AWS Lambda (Mangum)                    |
| DB           | Postgres (Neon → RDS)                             |
| Email        | AWS SES (outbound), Postmark for transactional    |
| Dashboard    | Next.js 15 (App Router) on Vercel                 |
| Billing      | Stripe Payment Links + ACP                        |
| Heavy/batch  | OVH bare-metal (Qdrant + dev/staging)             |

## Cloud-credit allocation

| Provider | $   | Purpose |
|----------|-----|---------|
| AWS      | 15k | Lambda, S3, SES, RDS, Bedrock |
| OVH      | 10k | Qdrant + staging + batch jobs |
| Azure    | 5k  | Azure OpenAI failover, Microsoft Graph for Outlook brokers |
| GCP      | 2k  | Document AI |

## Run the demo

**CLI (offline, deterministic):**
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.cli ../data/submissions/acme_plumbing.json
# Use real Claude:
ANTHROPIC_API_KEY=... python -m app.cli ../data/submissions/acme_plumbing.json --live
```

**API + Dashboard:**
```bash
# terminal 1 — API
cd api && .venv/bin/uvicorn app.main:app --reload

# terminal 2 — dashboard
cd web && npm install && npm run dev   # http://localhost:3000
```

**Tests:**
```bash
cd api && .venv/bin/pytest
```

## Layout

```
api/
  app/
    models.py         # pydantic domain models
    parsers/          # ACORD parsers (JSON today, DocAI adapter ready)
    agent/            # prefilter + appetite-match + drafter
    llm/              # LlmClient (Stub + Anthropic, Bedrock to follow)
    main.py           # FastAPI app
    cli.py            # demo CLI
  tests/              # pytest suite
  requirements.txt
web/
  app/                # Next.js 15 App Router
  lib/                # shared types + embedded sample
  package.json
data/
  carriers/           # carrier appetite guides (JSON)
  submissions/        # sample submissions
docs/                 # ICP, sales notes, architecture deep-dives
```
