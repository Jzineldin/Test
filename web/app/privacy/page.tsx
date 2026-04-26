import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - AppetiteMatch",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-slate-300">
      <Link href="/" className="text-xs text-emerald-400 hover:underline">
        ← Back
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: April 2026</p>

      <Section title="1. What we collect">
        <p>
          AppetiteMatch is a B2B service for licensed wholesale insurance
          brokers. We collect the following data, and only this data:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            <strong>Account data</strong> you provide on signup - your name,
            work email, and brokerage name.
          </li>
          <li>
            <strong>Submission content</strong> you upload - the ACORD PDFs and
            normalized JSON submissions you choose to triage. We store these so
            the dashboard can show you run history.
          </li>
          <li>
            <strong>Carrier appetite library</strong> you configure for your
            org.
          </li>
          <li>
            <strong>Usage metadata</strong> - submission counts, draft counts,
            send timestamps, quote-back timestamps.
          </li>
        </ul>
      </Section>

      <Section title="2. What we don't collect">
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            We don't sell your data, ever. Not to other brokers, not to
            carriers, not to advertisers.
          </li>
          <li>
            We don't train AI models on your submissions. Submissions you upload
            are sent to model providers (Anthropic via AWS Bedrock; Google
            Document AI for OCR) under their no-training enterprise terms.
          </li>
          <li>
            We don't use third-party analytics or tracking pixels on the
            authenticated dashboard.
          </li>
        </ul>
      </Section>

      <Section title="3. Subprocessors">
        <p>We rely on the following infrastructure providers:</p>
        <ul className="mt-3 list-disc space-y-2 pl-6">
          <li>
            <strong>AWS</strong> (Render-managed compute, Postgres, S3, SES) -
            hosting + outbound email
          </li>
          <li>
            <strong>Anthropic via AWS Bedrock</strong> - appetite scoring +
            email drafting
          </li>
          <li>
            <strong>Google Cloud (Document AI)</strong> - ACORD PDF field
            extraction
          </li>
          <li>
            <strong>Stripe</strong> - subscription billing
          </li>
          <li>
            <strong>Cloudflare</strong> - DNS + edge proxy
          </li>
        </ul>
      </Section>

      <Section title="4. Data retention">
        <p>
          Submission and triage data are retained for the lifetime of your
          account. On account deletion, we hard-delete your data within 30 days.
          Backups are pruned within 90 days.
        </p>
      </Section>

      <Section title="5. Security">
        <p>
          All traffic is HTTPS. Authentication uses HTTP-only cookies with
          SameSite=None+Secure. Service-account credentials are stored as
          encrypted environment variables on Render. We don't yet have SOC 2 -
          that's planned for the second half of 2026. If you need a DPA before
          purchase, email us.
        </p>
      </Section>

      <Section title="6. Contact">
        <p>
          Questions, deletion requests, GDPR / CCPA inquiries:{" "}
          <a
            className="text-emerald-400 hover:underline"
            href="mailto:privacy@appetitematch.com"
          >
            privacy@appetitematch.com
          </a>
          .
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
