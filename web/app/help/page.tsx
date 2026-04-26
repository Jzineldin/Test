import Link from "next/link";

export const metadata = {
  title: "Help & how-to",
  description:
    "How to use AppetiteMatch end to end — from your first triage to wiring inbound forwarding.",
};

export default function HelpPage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-slate-100"
        >
          AppetiteMatch
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-slate-400 hover:text-slate-100">
            Pricing
          </Link>
          <Link href="/docs" className="text-slate-400 hover:text-slate-100">
            API docs
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400"
          >
            Start free trial →
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-slate-300">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          Help & how-to
        </h1>
        <p className="mt-3 text-slate-400">
          Quick answers for the questions brokers ask in the first hour.
          Anything missing → <a className="text-emerald-400 hover:underline" href="mailto:hello@appetitematch.com">email us</a>.
        </p>

        <Section title="Getting started">
          <H3>1. Sign up takes 30 seconds.</H3>
          <p>
            Visit <code className="text-slate-200">/signup</code>, enter
            your name, brokerage, and work email. Click the magic link in
            your inbox (from <code className="text-slate-200">submissions@appetitematch.com</code>)
            — that drops you into <code className="text-slate-200">/app</code> already
            signed in.
          </p>

          <H3>2. Your account ships with four sample carriers.</H3>
          <p>
            So your first triage produces real matches without any setup.
            You can edit, delete, or replace them at <code className="text-slate-200">/app/carriers</code>.
          </p>

          <H3>3. Run a sample triage.</H3>
          <p>
            On <code className="text-slate-200">/app</code>, click{" "}
            <strong>Paste JSON</strong>, then <strong>Reset to sample</strong>{" "}
            (Acme Plumbing TX), then <strong>Run triage</strong>. You'll see
            three carriers scored and 2-3 carrier emails drafted in under 20
            seconds.
          </p>
        </Section>

        <Section title="Adding your real carriers">
          <H3>One at a time.</H3>
          <p>
            <code className="text-slate-200">/app/carriers</code> →{" "}
            <strong>+ New carrier</strong>. Each carrier gets a slug
            (e.g. <code className="text-slate-200">atlas_specialty</code>),
            display name, submission email, and one or more appetite rules
            (NAICS prefixes, allowed/excluded states, lines, revenue band).
          </p>

          <H3>In bulk (CSV).</H3>
          <p>
            <code className="text-slate-200">/app/carriers</code> →{" "}
            <strong>Import CSV</strong>. Header row + one carrier per line.
            Use semicolons to separate list values (NAICS, states, lines).
            Existing carriers (matched on slug) get overwritten.
          </p>

          <H3>The agent uses what's in the directory.</H3>
          <p>
            If a state isn't in <code className="text-slate-200">states_in</code>
            (or is in <code className="text-slate-200">states_out</code>), the
            carrier won't match — even if their NAICS prefix fits. Same for
            revenue band and line of business.
          </p>
        </Section>

        <Section title="Sending submissions to carriers">
          <H3>Click "Send to carrier" on a draft.</H3>
          <p>
            The cover email goes via Amazon SES. If the submission was
            uploaded as a PDF, the original ACORD is auto-attached on send
            — no copy-paste. The recipient is whatever you set as{" "}
            <code className="text-slate-200">submission_email</code> on the
            carrier row.
          </p>

          <H3>Track replies automatically.</H3>
          <p>
            When the carrier replies, our inbound webhook records it against
            the original draft. You'll see a sky-blue ↩ replied badge on the
            draft, plus the carrier's reply body inline. Promote to{" "}
            <strong>Mark bound</strong> with a premium amount, or{" "}
            <strong>Mark declined</strong>, to feed the bind-rate analytics.
          </p>

          <H3>Forward inbound submissions to triage automatically.</H3>
          <p>
            Configure your AMS or email rule to forward retail-agent emails
            to <code className="text-slate-200">triage+yourorgslug@appetitematch.com</code>
            (set the alias in <strong>Settings → Forward-inbox alias</strong>).
            The PDF gets parsed and a triage run starts automatically. (This
            requires the SES Inbound rule to be wired on our side — talk to
            us if you need it activated for your alias.)
          </p>
        </Section>

        <Section title="Working as a team">
          <H3>Invite teammates.</H3>
          <p>
            <code className="text-slate-200">/app/users</code> →{" "}
            <strong>Send invite</strong>. They get a magic-link email and
            land in your org as either an admin (can manage carriers,
            billing, invites) or a CSR (can run triages, send drafts, mark
            outcomes).
          </p>

          <H3>Audit log.</H3>
          <p>
            Every state change is recorded — who triaged what, who sent
            which draft, who promoted an outcome. Visible at{" "}
            <code className="text-slate-200">/app/audit</code>. Useful for
            E&O incident reviews and SOC 2 evidence collection.
          </p>
        </Section>

        <Section title="Billing & quotas">
          <H3>Trial limits.</H3>
          <p>
            50 triaged submissions per month, free, no credit card. Drafts
            keep working past the limit but you can't create new ones until
            you upgrade or the period rolls over.
          </p>

          <H3>Upgrade.</H3>
          <p>
            Click <strong>Upgrade</strong> on the usage badge → Stripe
            Checkout. Pro tier is $499/mo, unlimited triages, full team.
          </p>

          <H3>Manage subscription.</H3>
          <p>
            Settings panel → <strong>Manage subscription →</strong> opens
            Stripe's hosted portal: update card, view invoices, download
            receipts, cancel anytime.
          </p>
        </Section>

        <Section title="Programmatic access">
          <H3>API key.</H3>
          <p>
            Settings panel → <strong>Show key</strong> reveals your bearer
            token. Use it as <code className="text-slate-200">Authorization:
            Bearer &lt;key&gt;</code> on any endpoint. Rotation invalidates
            the old key immediately and is audit-logged.
          </p>
          <H3>Full surface.</H3>
          <p>
            See <Link href="/docs" className="text-emerald-400 hover:underline">/docs</Link>
            for the REST reference, or hit{" "}
            <code className="text-slate-200">/openapi.json</code> on the
            API host for the raw schema.
          </p>
        </Section>

        <Section title="Troubleshooting">
          <H3>"My triage returned 0 matches."</H3>
          <p>
            Likely the submission's primary state isn't in any carrier's{" "}
            <code className="text-slate-200">states_in</code>, or the NAICS
            prefix doesn't match. Open the carrier card on{" "}
            <code className="text-slate-200">/app/carriers</code> and confirm
            the rule covers the submission.
          </p>

          <H3>"DocAI returned mostly labels, not field values."</H3>
          <p>
            The PDF was probably blank (a template, not a filled submission).
            Open it in a PDF reader, fill the input fields, save, re-upload.
          </p>

          <H3>"My carrier email landed in the prospect's spam."</H3>
          <p>
            Outbound is sent from{" "}
            <code className="text-slate-200">submissions@appetitematch.com</code>{" "}
            with DKIM and DMARC aligned on our domain. If it still lands in
            spam, ask the carrier to whitelist
            <code className="text-slate-200">appetitematch.com</code>. Most
            carriers do this for any wholesale broker they work with.
          </p>

          <H3>"The 'Send' button does nothing."</H3>
          <p>
            Check the green/amber pill in the dashboard header. If SES
            shows <strong>stub</strong>, the API isn't configured to send
            real email yet. Email us — usually a 5-min env-var fix.
          </p>
        </Section>

        <p className="mt-12 rounded-md border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400">
          Stuck on something not covered here?{" "}
          <a
            className="text-emerald-400 hover:underline"
            href="mailto:hello@appetitematch.com"
          >
            hello@appetitematch.com
          </a>{" "}
          — we read every email.
        </p>
      </section>

      <footer className="border-t border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
          <span>© 2026 AppetiteMatch</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-slate-300">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-300">
              Terms
            </Link>
            <a
              href="mailto:hello@appetitematch.com"
              className="hover:text-slate-300"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">
        {title}
      </h2>
      <div className="mt-3 space-y-4 text-slate-400">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 text-sm font-medium text-slate-200">{children}</h3>
  );
}
