import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = {
  title: "What's new",
  description: "Recent changes to AppetiteMatch.",
};

const RELEASES: Release[] = [
  {
    when: "2026-04-26",
    tag: "v0.6",
    items: [
      "**Inbound email triage live.** Brokers can forward an ACORD-attached email to triage+slug@appetitematch.com; AWS SES -> S3 -> Lambda parses the MIME, base64s attachments, and POSTs the signed payload to /webhooks/email. End-to-end smoke-tested.",
      "**Animated /try walkthrough** - autoplays the full broker flow on page load (paste, prefilter, score, draft, send, bound) with step controls and replay. No video recording needed.",
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

interface Release {
  when: string;
  tag: string;
  items: string[];
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          What's new
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          We ship every day. Highlights below; everything is in the public repo.
        </p>

        <ol className="mt-12 space-y-12">
          {RELEASES.map((r) => (
            <li
              key={r.tag}
              className="border-l-2 border-emerald-700/40 pl-6"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-mono text-emerald-300">
                  {r.tag}
                </span>
                <span className="text-xs text-slate-500">{r.when}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
                {r.items.map((it, i) => (
                  <li key={i} dangerouslySetInnerHTML={renderItem(it)} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <SiteFooter />
    </main>
  );
}

/** Render a tiny markdown-ish item: **bold**, `code`, plaintext.
 *  Sufficient for the changelog without pulling in a renderer. */
function renderItem(s: string): { __html: string } {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-medium text-slate-100">$1</strong>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-slate-900 px-1 py-0.5 font-mono text-xs text-slate-200">$1</code>',
    );
  return { __html: html };
}
