import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Problem />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight text-slate-100">
          Submission Triage
        </span>
        <span className="text-xs uppercase tracking-widest text-slate-500">v0</span>
      </div>
      <nav className="flex items-center gap-6 text-sm">
        <Link href="#how" className="text-slate-400 hover:text-slate-100">
          How it works
        </Link>
        <Link href="#pricing" className="text-slate-400 hover:text-slate-100">
          Pricing
        </Link>
        <Link
          href="/app"
          className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-400"
        >
          Open the demo →
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-12 pb-20 lg:pt-24">
      <p className="mb-4 text-xs uppercase tracking-[0.2em] text-emerald-400">
        For wholesale commercial insurance brokers + MGAs
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-5xl">
        Triage every submission in seconds.
        <span className="block text-slate-400">
          Send carrier-ready packages without the copy-paste.
        </span>
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">
        Your retail agents drop ACORDs in your inbox. Our agent reads each one,
        matches it to the carriers that actually want the risk, drafts the cover
        email, and waits for your reviewer. CSRs go from 200 submissions a month
        to 1,000 — without hiring.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/app"
          className="rounded-md bg-emerald-500 px-5 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Try the live demo
        </Link>
        <a
          href="mailto:hello@example.com"
          className="rounded-md border border-slate-700 px-5 py-3 text-sm text-slate-300 hover:bg-slate-900"
        >
          Talk to a human
        </a>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="border-t border-slate-800 bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
              The wholesale broker's bottleneck isn't selling.
              <span className="block text-slate-400">It's submission triage.</span>
            </h2>
            <p className="mt-6 text-slate-400">
              Every retail submission needs the same boring work before it can
              move: read the ACORD, classify the risk, look up which carriers
              cover it in this state at this revenue, write a custom cover note
              for each one, attach the right forms, send.
            </p>
            <p className="mt-4 text-slate-400">
              A 20-person brokerage processes 200–600 of these a month. That's
              60+ hours of CSR time that could be spent on the calls that close.
            </p>
          </div>
          <ul className="space-y-4 text-sm text-slate-300">
            {PROBLEMS.map((p) => (
              <li
                key={p.title}
                className="rounded-lg border border-slate-800 bg-slate-950 p-4"
              >
                <p className="font-medium text-slate-100">{p.title}</p>
                <p className="mt-1 text-slate-400">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const PROBLEMS = [
  {
    title: "30–90 minutes per submission",
    body: "Read the ACORD, normalize the data, look up carrier appetite, write the cover email, attach the right forms.",
  },
  {
    title: "Carrier appetite changes weekly",
    body: "Tribal knowledge in a CSR's head doesn't scale to new hires or new programs.",
  },
  {
    title: "Lost submissions = lost revenue",
    body: "Inbox triage is lossy. The ones you skip are the ones that would have bound.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-t border-slate-800">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          How it works
        </h2>
        <p className="mt-2 text-slate-400">
          Drop an ACORD, get back a reviewable submission package. Three steps,
          all automated, you stay in the loop on every send.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <article
              key={s.title}
              className="rounded-lg border border-slate-800 bg-slate-950 p-6"
            >
              <p className="text-xs uppercase tracking-widest text-emerald-400">
                Step {i + 1}
              </p>
              <h3 className="mt-2 text-lg font-medium text-slate-100">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Ingest the ACORD",
    body: "Drop a PDF or forward an email. We extract every field — insured, NAICS, locations, lines, loss runs — and normalize them into one record.",
  },
  {
    title: "Match carrier appetite",
    body: "We score every carrier in your appetite library against the risk and surface the ones in-band, with rationale and risk flags called out for the underwriter.",
  },
  {
    title: "Draft + send the package",
    body: "A custom cover email is drafted for each viable carrier, leading with the facts that matter to their appetite. You review, click send, and we track the quote-back.",
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-t border-slate-800 bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Pricing
        </h2>
        <p className="mt-2 text-slate-400">
          Outcome-based. You pay for triaged submissions, not seats.
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
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
              <p className="mt-3 text-3xl font-semibold text-slate-100">
                {p.price}
                <span className="text-sm font-normal text-slate-500">{p.cadence}</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">{p.target}</p>
              <ul className="mt-6 space-y-2 text-sm text-slate-300">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
              <Link
                href="/app"
                className={
                  "mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium " +
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
      </div>
    </section>
  );
}

const PLANS = [
  {
    name: "Trial",
    price: "Free",
    cadence: "",
    target: "50 triaged submissions / month",
    features: [
      "Drag-and-drop ACORD upload",
      "Carrier appetite matching",
      "Drafted carrier emails",
      "Run history",
    ],
    cta: "Open the demo",
    highlight: false,
  },
  {
    name: "Production",
    price: "$2,500",
    cadence: " /month",
    target: "Up to 500 submissions, then $5 each",
    features: [
      "Everything in Trial",
      "AWS SES outbound + reply tracking",
      "Stripe-backed seat billing",
      "Slack alerts on quote-backs",
    ],
    cta: "Start checkout",
    highlight: true,
  },
  {
    name: "Whale",
    price: "$10k+",
    cadence: " /month",
    target: "Custom carrier integrations",
    features: [
      "Custom appetite-guide ingestion",
      "AMS write-back (Applied Epic, AMS360)",
      "Dedicated SLA + Slack channel",
      "On-site training for CSR team",
    ],
    cta: "Talk to a human",
    highlight: false,
  },
];

function Footer() {
  return (
    <footer className="border-t border-slate-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
        <span>© 2026 Submission Triage</span>
        <span>Built on Claude · GCP Document AI · AWS · Stripe</span>
      </div>
    </footer>
  );
}
