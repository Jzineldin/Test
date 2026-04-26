import Link from "next/link";

export const metadata = {
  title: "Pricing — AppetiteMatch",
  description:
    "Transparent monthly pricing for wholesale brokers. Free trial, no credit card to start.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-slate-100"
        >
          AppetiteMatch
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/" className="text-slate-400 hover:text-slate-100">
            Home
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

      <section className="mx-auto max-w-6xl px-6 pt-12 pb-16">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-5xl">
          Pricing for wholesale brokers.
          <span className="block text-slate-400">No seats. No surprises.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">
          Pick a plan based on how many submissions you triage. Switch tiers
          anytime — your card is charged month-to-month.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={
                "rounded-lg border p-6 " +
                (p.highlight
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-slate-800 bg-slate-950")
              }
            >
              <p className="text-sm font-medium text-emerald-400">{p.name}</p>
              <p className="mt-3 text-4xl font-semibold text-slate-100">
                {p.price}
                <span className="text-sm font-normal text-slate-500">
                  {p.cadence}
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-400">{p.target}</p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={
                  "mt-8 inline-block w-full rounded-md px-4 py-2 text-center text-sm font-medium " +
                  (p.highlight
                    ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                    : "border border-slate-700 text-slate-200 hover:bg-slate-900")
                }
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-950/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
            Frequently asked
          </h2>
          <dl className="mt-10 space-y-8">
            {FAQ.map((q) => (
              <div key={q.q}>
                <dt className="font-medium text-slate-100">{q.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">
                  {q.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
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

const PLANS = [
  {
    name: "Trial",
    price: "Free",
    cadence: "",
    target: "50 triaged submissions / month",
    features: [
      "ACORD PDF + JSON ingest",
      "Carrier appetite matching",
      "Drafted carrier emails",
      "Run history + reply tracking",
      "1 admin user",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$499",
    cadence: " /month",
    target: "Unlimited submissions, your whole team",
    features: [
      "Everything in Trial",
      "Real outbound email + reply tracking",
      "PDF auto-attached on send (no copy-paste)",
      "Slack alerts on quote-backs",
      "Audit log for E&O reviews",
      "Multiple users per org",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Whale",
    price: "$10k+",
    cadence: " /month",
    target: "MGAs and 50+ CSR shops",
    features: [
      "AMS write-back (Applied Epic, AMS360)",
      "Custom appetite-guide ingestion",
      "Dedicated SLA + Slack channel",
      "On-site CSR onboarding",
      "SOC 2 + DPA on request",
    ],
    cta: "Talk to a human",
    href: "mailto:hello@appetitematch.com?subject=AppetiteMatch%20Whale%20tier",
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Do you train your AI on my submissions?",
    a: "No. Submissions you upload are sent to Anthropic via AWS Bedrock and Google Document AI under their no-training enterprise terms. Your underwriting data stays yours.",
  },
  {
    q: "What happens after the 50 free triages?",
    a: "Triage continues to work, but you can't draft new carrier emails until you upgrade. Existing data, history, and configured carriers stay intact.",
  },
  {
    q: "Do I need to use ACORD PDFs?",
    a: "No. You can upload PDFs (we OCR them via Document AI) or post normalized JSON to /triage. Most brokers paste from their AMS export and the result is the same.",
  },
  {
    q: "Can I bring my own carrier list?",
    a: "Yes — that's the whole point. Each org gets a private carrier directory at /app/carriers. Add NAICS prefixes, allowed/excluded states, lines, revenue band, contact email. The agent only matches against carriers you configured.",
  },
  {
    q: "Is the data encrypted?",
    a: "Yes. All traffic is HTTPS. Data at rest is encrypted on AWS RDS (Render's managed Postgres) and AWS S3. Service-account credentials are stored as encrypted environment variables. SOC 2 Type II is on the 2026 H2 roadmap.",
  },
  {
    q: "Can I cancel?",
    a: "Anytime, from inside the dashboard or by emailing us. You stay on the paid tier until the end of your billing period.",
  },
  {
    q: "Will it integrate with my AMS?",
    a: "Applied Epic and AMS360 write-back is the Whale-tier feature, available on contract. The Pro tier exposes a REST API + bearer key today, so you can wire your own integrations now.",
  },
  {
    q: "Who's behind this?",
    a: "A small team obsessed with the wholesale broker workflow. Reach us at hello@appetitematch.com — we read every email.",
  },
];
