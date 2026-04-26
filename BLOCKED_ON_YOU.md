# Blocked on you — morning checklist

These are the tasks I couldn't complete from my sandbox. Each is short.
Order them however you want.

---

## 1. Trigger production deploys (5 min)

There are 23 commits on `claude/ai-agent-venture-builder-taoWC` that
aren't live yet. Render API isn't reachable from my sandbox.

**Render** (auto-deploys on commit but flaky — force it):

```bash
RENDER_KEY="rnd_ZyKZBxmgNrBJ15kIHA6aqUtwnKcl"
SVC="srv-d7mg3c67r5hc7386fe3g"
curl -s -X POST -H "Authorization: Bearer $RENDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' \
  "https://api.render.com/v1/services/$SVC/deploys" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('render deploy:', d['id'], d['status'])"
```

**Vercel** (force build so OG image + favicon assets bake in):

```bash
cd ~/Test && git pull && vercel --prod --force
```

After ~3 min, smoke test:
- `https://appetitematch.com` → see the new dashboard preview in hero + "Why not ChatGPT?" comparison table
- `https://appetitematch.com/try` → click "Run triage", see pre-baked result
- `https://appetitematch.com/changelog` → see the v0.5 release
- `https://appetitematch.com/app` → green pill in header (or amber if any subsystem stub)

---

## 2. Rotate keys leaked in chat (5 min)

These are visible in our conversation history. Rotate them when convenient.

- **Render API key** `rnd_ZyKZBxmgNrBJ15kIHA6aqUtwnKcl` → Render
  Account Settings → API Keys → regenerate
- **Stripe live secret** `sk_live_51TQCEV...` → Stripe Developers →
  API keys → roll
- **Stripe webhook secret** `whsec_dYtCMCa...` → delete + recreate the
  webhook endpoint in Stripe (then update Render env var)
- **GCP service account** `appetitematch-docai@...` → GCP IAM →
  service accounts → that account → Keys → delete the leaked key,
  create a new one, push the new JSON to Render

For each, after rotation:
1. Update the env var on Render via the API (or the dashboard)
2. Trigger a new deploy

---

## 3. AWS SES Inbound rule (15 min, one-time)

Backend webhook (`/webhooks/email`) is wired and tested. AWS Console
side isn't done yet — without it, the "broker forwards an inbound to
triage+slug@appetitematch.com" flow doesn't trigger.

Steps in AWS Console:
1. SES → Email receiving → Receipt rule sets → Create rule set
2. Add a rule:
   - Recipient: `triage+*@appetitematch.com` (catch-all on the local part)
   - Action: **Invoke Lambda** (or **Publish to SNS** → call our webhook)
3. Lambda forwards the parsed message + base64'd attachments to:
   `POST https://submission-triage-api.onrender.com/webhooks/email`
   (the body shape is documented in /docs)
4. HMAC-sign the body using the org's `webhook_secret` (from Settings)

Tell me when it's set up; I can sanity-check the Lambda code shape.

---

## 4. Demo recording (~10 min, you on screen)

Highest-impact remaining marketing item. Two options:

**Option A — Arcade.software** (recommended, interactive replay)
1. Sign up free at arcade.software
2. Install the Chrome extension
3. Record yourself running through `/app`:
   - Click Paste JSON → Reset to sample → Run triage
   - Wait for matches + drafts
   - Click "Send to carrier" on Atlas
   - Click into history, show the persisted run
4. Add 3 hover tooltips on key moments
5. Copy the share/embed URL → paste it here

**Option B — Loom** (faster but linear)
1. Record a 60-90 sec screen capture doing the same flow
2. Share URL → paste here

I'll wire the embed into the landing hero + /try page when you have the URL.

---

## 5. Cloudflare DNS sanity check (5 min)

While you're rotating keys: confirm the SES DKIM CNAMEs and DMARC
TXT for `appetitematch.com` are still set to "DNS only" (gray
cloud). If they ever flip to proxied (orange), DKIM breaks and
emails go back to spam.

---

## Optional — when you have appetite

- **SOC2 prep**: drop me a yes when you want to start the Vanta /
  Drata onboarding. Real customers above $5k MRR will start asking.
- **Cal.com booking link** for "Talk to a human" in the Whale tier
  CTA. Currently mailto: — booking is higher conversion.
- **Statuspage.io** mirror of `/version` for ambient social proof.
- **Stripe tax** — turn on Stripe Tax in dashboard so EU/CA
  customers charge correctly without you touching invoices.

---

Last updated: while you sleep on 2026-04-26.
Branch: `claude/ai-agent-venture-builder-taoWC` · 129 tests green.
