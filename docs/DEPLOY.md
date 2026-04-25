# Deploy: Render (backend) + Vercel (dashboard)

End-to-end "you can give the URL to a broker" deploy. ~20 minutes, all
clicks, free tier on both providers (no credit card to start).

## TL;DR — two buttons

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Jzineldin/Test)
&nbsp;&nbsp;
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJzineldin%2FTest&root-directory=web&env=NEXT_PUBLIC_API_URL&envDescription=Render%20API%20URL%20from%20step%201)

**Click Render first. Wait for it to be live. Copy the .onrender.com URL.
Then click Vercel and paste that URL when prompted.**

---

## Part 1 — Backend on Render (~10 min)

### 1. Click the Render button above
Sign in with GitHub the first time. Render reads `render.yaml` at the
repo root and shows you what it's about to create:

- A **web service** named `submission-triage-api`
- A **Postgres database** named `triage-db`

When asked for the branch, pick `claude/ai-agent-venture-builder-taoWC`
(or `main` if you've already merged PR #2). Click **Apply**.

### 2. Wait ~3 minutes
Render does in parallel:
- Postgres provisioning
- pip install
- `alembic upgrade head` (creates the schema)
- `uvicorn app.main:app` start

When the web service shows **Live** with a green dot, **copy its URL**.
It looks like `https://submission-triage-api.onrender.com`.

### 3. Smoke test
Open `https://YOUR-URL.onrender.com/healthz` in a browser. Expect:

```json
{"status": "ok"}
```

### 4. Add your AWS keys
Render dashboard → your web service → **Environment** tab → add:

| Key | Value |
|-----|-------|
| `AWS_ACCESS_KEY_ID` | (your real key) |
| `AWS_SECRET_ACCESS_KEY` | (your real secret) |

Render restarts automatically when you save. After ~30 s the API will
have real Bedrock access.

---

## Part 2 — Dashboard on Vercel (~5 min)

### 1. Click the Vercel button above
Sign in with GitHub. Vercel auto-detects Next.js. Two things matter on
the import screen:

- **Root Directory:** `web` (the button URL pre-fills this)
- **Environment Variables:** add `NEXT_PUBLIC_API_URL` and paste the
  Render URL from Part 1 step 2 (e.g. `https://submission-triage-api.onrender.com`)

Click **Deploy**. ~2 min build.

### 2. Open your dashboard
Vercel hands you a URL like `https://test-xyz.vercel.app`. Open it.

You'll see the marketing landing page. Click **Try the live demo →**
to land on `/app`.

### 3. Wire CORS so the dashboard can call the API
Render → your web service → **Environment** → edit `CORS_ORIGINS` to
your Vercel URL:

```
https://test-xyz.vercel.app
```

(Replace `*` with the actual URL.) Render restarts.

### 4. Click "Run triage"
You should now see:
- 3 carriers scored (real Claude responses)
- 2–3 drafted emails (each different per carrier)
- The history panel populating
- The billing badge showing `trial · 1/50`

**That's the full product running on public URLs.** Send the dashboard
URL to a broker.

---

## What's still off after Part 2

Three subsystems are still on stubs even after the deploy:

| Subsystem | What turns it on |
|-----------|------------------|
| ACORD PDF parsing | `GCP_PROJECT_ID` + `DOCAI_PROCESSOR_ID` env vars on Render |
| Real outbound email | `SES_FROM_ADDRESS` (after a verified sender domain) |
| Real Stripe checkout | `STRIPE_SECRET_KEY` + a live Price |

Each is its own ~30-min "create the account, paste the keys, restart"
loop. Same shape as Part 1 — set env vars in Render's dashboard.

---

## Cost expectations

- **Render** free tier: $0. Web service sleeps after 15 min idle (cold
  start ~30 s on next request). Postgres free for 90 days then $7/mo.
- **Vercel** free tier: $0. Hobby plan limits are generous.
- **Bedrock**: per-token. Sonnet 4.6 is ~$0.04/triage on the Acme
  sample. Your $15k AWS credits cover ~375k triages.

If your free Postgres expires before you have a paying customer, swap
`DATABASE_URL` in Render's Environment tab to point at a Neon free-tier
DB. `alembic upgrade head` rebuilds the schema on first boot of the new DB.

---

## Troubleshooting

**Render build fails on `pip install psycopg2-binary`** — Render's
Python 3.11 image has the postgres dev headers. If you see a libpq
error, switch to Render's Python 3.11 runtime explicitly via
`PYTHON_VERSION=3.11` (already in `render.yaml`).

**Triage returns 500 with `UnrecognizedClientException`** — your AWS
keys in Render's Environment tab are wrong. Open Render → Environment,
click the eye icon next to `AWS_ACCESS_KEY_ID`, verify it matches what
your local `aws sts get-caller-identity` returns.

**Dashboard shows `CORS error`** — `CORS_ORIGINS` on Render still
contains `*` or doesn't include your Vercel URL. Edit it, save, wait
30 s for restart.

**"Triage" button does nothing** — the dashboard's `NEXT_PUBLIC_API_URL`
isn't set on Vercel. Vercel → Project → Settings → Environment Variables
→ add it → redeploy.
