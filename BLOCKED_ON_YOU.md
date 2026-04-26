# Blocked on you - morning checklist

Tasks I couldn't complete from my sandbox, in priority order. Each is short.

---

## 1. Trigger production deploys (5 min)

40+ commits on `claude/ai-agent-venture-builder-taoWC` aren't live yet.
Render API isn't reachable from my sandbox; you have to kick the deploys.

**Render** (force a redeploy):

```bash
RENDER_KEY="rnd_ZyKZBxmgNrBJ15kIHA6aqUtwnKcl"
SVC="srv-d7mg3c67r5hc7386fe3g"
curl -s -X POST -H "Authorization: Bearer $RENDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' \
  "https://api.render.com/v1/services/$SVC/deploys" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('render deploy:', d['id'], d['status'])"
```

**Vercel** (force build so OG image, favicon, sitemap, robots etc. bake in):

```bash
cd ~/Test && git pull && vercel --prod --force
```

After ~3 min, smoke test:
- `https://appetitematch.com` - new dashboard preview in hero, "Why not ChatGPT?"
  comparison, use-cases section, mobile hamburger drawer, no em dashes anywhere
- `https://appetitematch.com/try` - click "Run triage", see pre-baked result
- `https://appetitematch.com/changelog` - v0.5 release entries
- `https://appetitematch.com/status` - live readout of API health + subsystem modes
- `https://appetitematch.com/help` - broker-focused FAQ
- `https://appetitematch.com/app` - sticky dashboard header, hamburger nav
  on phone, all tables horizontal-scroll inside their containers

---

## 2. Rotate keys leaked in chat (5 min)

These appeared in our conversation history. Rotate them when convenient.

- **Render API key** `rnd_ZyKZBxmgNrBJ15kIHA6aqUtwnKcl` -> Render
  Account Settings -> API Keys -> regenerate
- **Stripe live secret** `sk_live_51TQCEV...` -> Stripe Developers ->
  API keys -> roll
- **Stripe webhook secret** `whsec_dYtCMCa...` -> delete + recreate the
  webhook endpoint in Stripe (then update the Render env var)
- **GCP service account** `appetitematch-docai@...` -> GCP IAM ->
  service accounts -> Keys -> delete the leaked key, create a new one,
  push the new JSON to Render
- **Org webhook secret** `whsec_A46JK4q9...` -> rotate via
  `POST /me/webhook-secret/rotate` (or click "Rotate" in Settings),
  then update the `WEBHOOK_SECRET` env var on the
  `appetitematch-ses-inbound` Lambda

For each, after rotation: update the env var on Render via the API
(or the dashboard) and trigger a new deploy.

---

## 3. Demo recording (~10 min, you on screen)

Highest-impact remaining marketing item.

**Option A - Arcade.software** (recommended, interactive replay)
1. Sign up free at arcade.software
2. Install the Chrome extension
3. Record yourself running through `/app`:
   - Click Paste JSON -> Reset to sample -> Run triage
   - Wait for matches + drafts
   - Click "Send to carrier" on Atlas
   - Click into history, show the persisted run
4. Add 3 hover tooltips on key moments
5. Copy the share/embed URL -> paste it here

**Option B - Loom** (faster, linear)
1. Record a 60-90 sec screen capture doing the same flow
2. Share URL -> paste here

I'll wire the embed into the landing hero and `/try` page when you have the URL.

---

## 4. Cloudflare DNS sanity check (5 min)

While you're rotating keys: confirm the SES DKIM CNAMEs and DMARC TXT
for `appetitematch.com` are still set to "DNS only" (gray cloud). If
they ever flip to proxied (orange), DKIM breaks and emails go back
to spam.

---

## 5. Browser smoke test on phone + tablet (5 min)

Big UI overhaul shipped tonight. Open `https://appetitematch.com`
in Chrome dev-tools mobile mode (or actual phone) and verify:
- Landing hero stacks cleanly on iPhone 12 width (390px)
- Hamburger drawer works on the marketing pages and `/app`
- `/app/carriers` list cards don't overflow
- `/app/audit` table scrolls horizontally inside its container
- `/login` and `/signup` cards are centered and not cut off
- No em dashes anywhere in copy or AI output

---

## Optional, when you have appetite

- **SOC2 prep**: drop me a yes when you want to start the Vanta/
  Drata onboarding. Real customers above $5k MRR will start asking.
- **Cal.com booking link** for "Talk to a human" in the Whale tier
  CTA. Currently mailto, booking is higher conversion.
- **Statuspage.io** mirror of `/version` for ambient social proof
  (we already have a basic `/status` page that pings `/version`).
- **Stripe tax** - turn on Stripe Tax in dashboard so EU/CA customers
  charge correctly without you touching invoices.
- **Real customer testimonials** on landing once you have 3+ paying
  brokers. Replace the use-case strip with quotes.

---

Last updated: 2026-04-26.
Branch: `claude/ai-agent-venture-builder-taoWC` · 134 tests green.

## Just shipped

- **AWS SES Inbound is live end-to-end.** Lambda
  `appetitematch-ses-inbound` (us-east-1) reads raw mail from
  `s3://appetitematch-ses-inbound/incoming/`, parses MIME,
  HMAC-signs, and POSTs to `/webhooks/email`. Smoke test passed
  (see triage history). Code lives at `infra/lambda/ses_inbound.py`,
  setup notes at `infra/lambda/SES_INBOUND_SETUP.md`.

## What landed this session (high-level)

- Em-dash + en-dash removed from 55 source files; LLM drafter prompt
  now forbids them and a defensive translate strips any leftovers
  before they hit the carrier email or dashboard.
- Shared SiteHeader / SiteFooter on every marketing page with a
  hamburger drawer below md so phones get a real nav.
- Shared DashboardHeader on /app, /app/carriers, /app/users,
  /app/audit. Sticky nav + admin-gated links + sign-out + drawer.
- Auth pages (login, signup, verify) are now centered cards with
  brand mark, password-manager hints, focus rings, spinner on
  verify, "request new link" CTA on failure.
- Mobile responsive pass: tables wrap in horizontal-scroll
  containers, list rows truncate properly, content widths adapt
  from 4xl/5xl/6xl/7xl by surface.
- Toast notification system (provider in layout, useToast in
  pages). Wired into carrier save/delete, user invite/remove,
  draft send, outcome promotion.
- Per-carrier email_intro + email_outro fields. Each carrier's
  underwriter quirks codified once; drafter honors them verbatim.
- "Send all" bulk action when a triage produces 2+ unsent drafts.
- Public /status page consuming /version (system mode + latency).
- /changelog page listing v0.1 to v0.5 with bold-styled features.
- /help page with broker-focused FAQ.
- /docs REST API reference.
- /try public demo (pre-baked, no signup).
- Custom 404, dynamic OG card, branded Æ favicon, sitemap, robots.
- Sentry SDK init (DSN-gated; no-op without DSN).
- Multi-user invites with admin/csr roles + last-admin protection.
- Server-side admin gating on every mutation endpoint.
- Stripe Customer Portal endpoint + Settings panel button.
- Per-carrier analytics endpoint + dashboard table.
- Bulk triage endpoint (POST /triage/bulk, max 50).
- CSV bulk-import for carriers.
- Email signature in Org settings.
- /version endpoint with subsystem mode.
- 23+ new tests covering all of the above.
