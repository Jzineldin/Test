import Link from "next/link";

export const metadata = {
  title: "Terms of Service - AppetiteMatch",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-slate-300">
      <Link href="/" className="text-xs text-emerald-400 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-100">
        Terms of Service
      </h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: April 2026</p>

      <Section title="1. Who we serve">
        <p>
          AppetiteMatch is provided exclusively to licensed insurance brokers,
          MGAs, and the agents acting under their supervision. By creating an
          account, you represent that you or your organization holds an active
          insurance broker / producer license in the jurisdictions where you
          operate.
        </p>
      </Section>

      <Section title="2. The service">
        <p>
          AppetiteMatch ingests submissions you provide, matches them against
          carrier appetite guidelines, drafts carrier-ready emails, and
          optionally sends those emails on your behalf. The service is a tool -
          all underwriting and binding decisions remain with you and the
          carriers you submit to. Carrier appetite scores and draft language
          are AI-generated suggestions, not advice.
        </p>
      </Section>

      <Section title="3. Acceptable use">
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            Don't upload submissions or PII you don't have authority to share
            with carriers.
          </li>
          <li>
            Don't send drafts on behalf of brokers who haven't authorized you
            to.
          </li>
          <li>
            Don't reverse-engineer the service or attempt to extract carrier
            guidelines from other organizations' accounts.
          </li>
          <li>
            Don't use the service for any non-insurance commercial purpose.
          </li>
        </ul>
      </Section>

      <Section title="4. Subscription, billing, refunds">
        <p>
          Paid plans are billed monthly via Stripe. You can cancel anytime; your
          plan stays active through the end of the current billing period.
          Refunds for partial months are not standard but we will issue them on
          request for legitimate good-faith reasons (service outage,
          accidental double-billing, etc.).
        </p>
      </Section>

      <Section title="5. Service availability">
        <p>
          We target 99.5% uptime. There's no hard SLA on the trial or Pro
          tiers; the Whale tier ships with a contractual SLA. We do scheduled
          maintenance on a best-effort no-disruption basis and notify
          subscribers in advance via email when we expect downtime.
        </p>
      </Section>

      <Section title="6. Liability">
        <p>
          The service is provided "as is" without warranty. Our maximum
          aggregate liability is the amount you paid us in the trailing 12
          months. We are not liable for indirect, consequential, or
          underwriting-decision damages, including but not limited to declined
          quotes, missed binders, or E&O claims arising from carrier responses.
        </p>
      </Section>

      <Section title="7. Termination">
        <p>
          You can close your account at any time from the dashboard, or by
          emailing us. We may terminate accounts that violate Section 3, with
          notice unless the violation is severe (e.g. credential abuse, fraud).
        </p>
      </Section>

      <Section title="8. Governing law">
        <p>
          These terms are governed by the laws of Sweden. Disputes will first
          attempt good-faith resolution by email; failing that, the
          jurisdiction is the District Court of Stockholm.
        </p>
      </Section>

      <Section title="9. Contact">
        <p>
          <a
            className="text-emerald-400 hover:underline"
            href="mailto:legal@appetitematch.com"
          >
            legal@appetitematch.com
          </a>
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-slate-400">{children}</div>
    </section>
  );
}
