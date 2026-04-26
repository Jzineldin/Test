// Single source of truth for the changelog page and the RSS feed at /feed.xml.

export interface Release {
  when: string;
  tag: string;
  items: string[];
}

export const RELEASES: Release[] = [
  {
    when: "2026-04-26",
    tag: "v0.6",
    items: [
      "**Inbound email triage live.** Brokers can forward an ACORD-attached email to triage+slug@appetitematch.com; AWS SES -> S3 -> Lambda parses the MIME, base64s attachments, and POSTs the signed payload to /webhooks/email. End-to-end smoke-tested.",
      "**Animated /try walkthrough** - autoplays the full broker flow on page load (paste, prefilter, score, draft, send, bound) with step controls and replay. No video recording needed.",
      "**Animated landing hero** - HeroPreview loops paste -> match -> sent -> replied -> bound. Respects prefers-reduced-motion.",
      "**Carrier search + CSV export** at /app/carriers - filter by name, NAICS, state, line; export round-trips with the bulk importer.",
      "**Live JSON validation** in the /app submission editor - red border + Format button, catches malformed paste before Run.",
      "**Keyboard shortcut** Cmd/Ctrl+Enter runs triage from anywhere on /app.",
      "**Webhook secret rotation** in Settings; matches the existing API-key rotate flow with the same audit-log + admin gating.",
      "**/book page** with env-driven calendar embed (NEXT_PUBLIC_BOOKING_URL); Whale-tier CTA on landing + pricing now points there.",
      "**/status auto-refresh** every 30 seconds with last-checked timestamp.",
      "**Audit CSV export** for SOC 2 evidence collection.",
      "**History filter by carrier** - 'show me every triage where Atlas matched'.",
      "**Changelog RSS** at /feed.xml.",
      "**Saved JSON templates** in /app - localStorage-backed; save the current submission shape and reload it later.",
      "**Send test notification** button in Settings - fire a synthetic Slack/Teams ping to verify the webhook URL works without waiting for a real triage.",
      "**Parse only** path on PDF upload - verify Document AI extraction (NAICS, state, lines, loss runs) before the LLM scores. Switches the editor to JSON mode with the parsed result so the broker can correct extraction misses, then Run triage on the corrected data. Doesn't count toward quota.",
      "**/app/setup** wizard - 90-second walkthrough on signup: forward-inbox alias, Slack hook + email signature, carrier directory. Each step is skippable; the WelcomeBanner now links to it.",
      "**Check appetite (no LLM)** button on /app - runs only the deterministic prefilter and toasts the in/out partition. Free, instant 'who could even write this?' check before spending a triage on it.",
      "**Renewals widget** above the result panel: when a triage runs on an insured we've seen before, show prior runs inline with click-to-open links.",
      "**Carrier pause/resume** - active toggle on each carrier; paused carriers are skipped by the prefilter without losing the appetite config.",
      "**Drafts: edit before send + Copy** - PATCH the LLM-drafted email inline (subject + body), or copy the full To/Subject/Body to clipboard. Sent drafts stay immutable.",
      "**/healthz** now reports DB up/down; /status shows a Database row alongside LLM/SES/DocAI/Stripe.",
      "**Magic-link verify** routes first-time admins to /app/setup automatically.",
      "**Magic-link emails** branded AppetiteMatch and point new admins at the setup wizard.",
      "**History pagination** - 'Load 20 more' button on /app history table.",
      "**History delete** - admin-only ✕ button on each row, audit-logged.",
      "**Drafter** uses carrier.underwriter_name in the salutation when set.",
      "**'Most popular' ribbon** on the Pro tier in /pricing.",
      "**'Finish setup' pill** in the dashboard nav until the forward-inbox alias is configured.",
      "**inbound_email.received audit event** so admins can see what landed even when downstream parsing rejected it.",
      "**Inbound email passes through ALL PDF attachments** (not just the first), so loss runs + dec pages flow to carriers untouched.",
      "**/app/users filter** by name/email when 6+ teammates exist.",
      "**/app/compare?a=X&b=Y** - side-by-side comparison of two triage runs with 'only in run A/B' callouts. Renewals widget links to it.",
      "**Per-carrier inline stats** on /app/carriers - 'sent / replied / bound / bind rate' under each card.",
      "**Multi-attachment uploads** - /triage/upload accepts an `extras` list (loss runs, dec page, etc.). UI shows them in a removable list under the primary ACORD dropzone.",
      "**Team role change** - inline admin/csr dropdown on each user, last-admin-protected.",
      "**LLM summary callout** - the per-triage one-line summary is now shown above the matches table.",
      "**Real fix: phantom attachments.** Loss runs / dec pages uploaded alongside the ACORD now actually ride along on outbound carrier emails. Previously the cover letter listed them but SES only sent the primary PDF. Inbound email path also stashes all PDFs.",
      "**Rate limits** on /carriers/check (60/min) and /triage/parse-only (30/min, same as /triage).",
      "**/app/queue** - cross-run draft inbox grouped by status (Drafted | Sent | Replied | Bound | Declined). 'Send all' batch action on the Drafted tab.",
      "**'What we believe' manifesto** section on the landing page.",
      "**Auto-scroll to result** on /app after Run triage on mobile viewports.",
    ],
  },
  {
    when: "2026-04-26",
    tag: "v0.5",
    items: [
      "**Per-carrier analytics** - see which markets actually quote back, sorted by bind rate.",
      "**CSV bulk import** for carriers - paste a 25-row spreadsheet, all carriers added at once.",
      "**Email signature** in Org settings - drafter uses your literal signature instead of placeholders.",
      "**Live health pill** in dashboard header - green/amber indicator showing all subsystems live or some on stubs.",
      "Public **/try** demo page - pre-baked triage result, no signup required.",
      "Public **/docs** REST API reference and **/version** build metadata endpoint.",
    ],
  },
  {
    when: "2026-04-26",
    tag: "v0.4",
    items: [
      "**Multi-user team invites** with admin/csr roles. Magic-link sign-in, no shared passwords.",
      "**Stripe Customer Portal** - paid customers self-serve subscription, card, invoices.",
      "**API key rotate** in Settings - invalidates the old bearer instantly, audit-logged.",
      "**Audit log** page at /app/audit, filterable by event type.",
      "**Notifications on triage.completed** - Slack/Teams pings with top match + draft count.",
      "Reply tracking inline on each draft - sky `↩ replied` badge, full carrier reply panel, `★ BOUND $X` pill.",
    ],
  },
  {
    when: "2026-04-26",
    tag: "v0.3",
    items: [
      "**Self-serve signup** at /signup - name + email + brokerage, magic link in 30 seconds.",
      "**Per-org carrier directory** at /app/carriers - full appetite-rule editor, DB-backed (survives Render restarts).",
      "Sample carriers auto-seed into every new org so the first triage produces matches zero-click.",
      "Cross-site session cookie (SameSite=None+Secure) so dashboard at appetitematch.com can call API at onrender.com.",
      "Phantom ACORD attachments removed - the drafter only references attachments that actually exist.",
      "Uploaded ACORD PDF is now stored and **auto-attached** on /drafts/[id]/send via SES raw email.",
    ],
  },
  {
    when: "2026-04-25",
    tag: "v0.2",
    items: [
      "**Stripe live subscriptions** - Pro tier at $499/mo, Customer + Price + Webhook wired.",
      "**SES outbound** verified on appetitematch.com with DKIM + DMARC alignment.",
      "**GCP Document AI** wired for ACORD PDF parsing.",
      "Custom domain at appetitematch.com with auto-renewing SSL.",
    ],
  },
  {
    when: "2026-04-24",
    tag: "v0.1",
    items: [
      "First public deploy: Render (FastAPI + Postgres) + Vercel (Next.js 15) + AWS Bedrock Claude Sonnet 4.6.",
      "Dashboard with triage flow: ACORD upload or JSON paste → carrier scoring → drafted carrier emails.",
      "53 passing API tests covering parse, score, draft, and persistence paths.",
    ],
  },
];
