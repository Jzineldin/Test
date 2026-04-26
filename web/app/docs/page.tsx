import Link from "next/link";

export const metadata = {
  title: "API docs - AppetiteMatch",
  description:
    "REST API reference for AppetiteMatch. Triage submissions, manage carriers, and track quote-backs programmatically.",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://submission-triage-api.onrender.com";

export default function DocsPage() {
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
          <Link href="/login" className="text-slate-400 hover:text-slate-100">
            Sign in
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
          API docs
        </h1>
        <p className="mt-3 text-slate-400">
          Every dashboard action is also exposed as a REST endpoint so you can
          wire AppetiteMatch directly into your AMS, CRM, or batch import.
        </p>

        <Section title="Authentication">
          <p>
            Every request needs a bearer token. Generate yours from{" "}
            <code className="text-slate-200">
              Settings → API key → Show key
            </code>{" "}
            in the dashboard, or via cookie auth if you're calling from the
            same origin.
          </p>
          <pre className="mt-3 rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
            {`curl -H "Authorization: Bearer <your-key>" \\
  ${API_URL}/me`}
          </pre>
        </Section>

        <Section title="Triage a submission (JSON)">
          <pre className="rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
            {`curl -X POST -H "Authorization: Bearer <your-key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "submission_id": "SUB-1",
    "received_at": "2026-04-26",
    "insured": {
      "legal_name": "Acme HVAC LLC",
      "naics": "238220",
      "primary_state": "TX",
      "annual_revenue": "5000000"
    },
    "coverages": [{"line": "general_liability"}]
  }' \\
  ${API_URL}/triage`}
          </pre>
          <p className="mt-3">
            Returns ranked carrier matches and drafted cover emails.
          </p>
        </Section>

        <Section title="Triage from an ACORD PDF">
          <pre className="rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
            {`curl -X POST -H "Authorization: Bearer <your-key>" \\
  -F "file=@./acord_125.pdf" \\
  ${API_URL}/triage/upload`}
          </pre>
          <p className="mt-3">
            Document AI extracts fields, the triage runs as above, and the
            uploaded PDF is stashed so the next{" "}
            <code className="text-slate-200">/drafts/[id]/send</code>{" "}
            attaches the original to the carrier email.
          </p>
        </Section>

        <Section title="Manage carriers">
          <pre className="rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
            {`# List
curl -H "Authorization: Bearer <key>" ${API_URL}/carriers

# Upsert
curl -X POST -H "Authorization: Bearer <key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "carrier_id": "atlas_specialty",
    "name": "Atlas Specialty E&S",
    "submission_email": "newbiz@atlas.example",
    "typical_quote_back_days": 4,
    "appetite": [{
      "naics_prefixes": ["238","236"],
      "states_in": ["TX","FL","GA"],
      "states_out": ["NY","CA"],
      "lines": ["general_liability","commercial_auto"],
      "revenue_min": "500000",
      "revenue_max": "15000000"
    }]
  }' \\
  ${API_URL}/carriers

# Delete
curl -X DELETE -H "Authorization: Bearer <key>" \\
  ${API_URL}/carriers/atlas_specialty`}
          </pre>
        </Section>

        <Section title="Inbound quote-back webhook">
          <p>
            When a carrier replies via email, your inbound mail handler should
            forward to:
          </p>
          <pre className="mt-3 rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
            {`POST ${API_URL}/webhooks/inbound

# Body
{
  "provider_message_id": "<SES Message-ID we returned on send>",
  "body": "Quoting at $42,000. Effective 06/01/2026."
}

# Signed with HMAC-SHA256 of body using your org's webhook_secret:
X-Triage-Signature: sha256=...`}
          </pre>
        </Section>

        <Section title="Full OpenAPI surface">
          <p>
            Every endpoint is documented with request/response schemas at the{" "}
            <a
              href={`${API_URL}/docs`}
              className="text-emerald-400 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              interactive Swagger UI
            </a>{" "}
            (also available as raw JSON at{" "}
            <a
              href={`${API_URL}/openapi.json`}
              className="text-emerald-400 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {API_URL}/openapi.json
            </a>
            ).
          </p>
        </Section>

        <Section title="Rate limits">
          <p>
            Triage endpoints (
            <code className="text-slate-200">/triage</code>,{" "}
            <code className="text-slate-200">/triage/upload</code>) are limited
            to 30 requests/minute per IP by default. Inbound webhook
            endpoints are 300 requests/minute. If you need higher, hit Pro
            tier or talk to us.
          </p>
        </Section>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-slate-100">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-slate-400">{children}</div>
    </section>
  );
}
