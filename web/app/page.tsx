import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Hero />
      <Problem />
      <HowItWorks />
      <Comparison />
      <UseCases />
      <Pricing />
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pt-20">
      <div>
        <p className="mb-4 text-[11px] uppercase tracking-[0.2em] text-emerald-400 sm:text-xs">
          For wholesale commercial insurance brokers + MGAs
        </p>
        <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight text-slate-100 sm:text-4xl lg:text-5xl">
          Triage every submission in seconds.
          <span className="mt-2 block text-slate-400">
            Send carrier-ready packages without the copy-paste.
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:mt-6">
          Your retail agents drop ACORDs in your inbox. Our agent reads each
          one, matches it to the carriers that actually want the risk, drafts
          the cover email, attaches the original PDF, and waits for your
          reviewer. CSRs go from 200 submissions a month to 1,000 without
          hiring.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Start free trial
          </Link>
          <Link
            href="/try"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-900"
          >
            See it run
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          50 free triages, no credit card.
        </p>
      </div>
      <HeroPreview />
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 shadow-2xl shadow-emerald-500/5 sm:p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-xs">
        <span className="size-2 rounded-full bg-rose-500/70" />
        <span className="size-2 rounded-full bg-amber-500/70" />
        <span className="size-2 rounded-full bg-emerald-500/70" />
        <span className="ml-3 truncate text-slate-500">
          appetitematch.com/app · Sunrise HVAC, Tampa FL
        </span>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-emerald-400">
        Appetite matches (3)
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {HERO_MATCHES.map((m) => (
          <li
            key={m.name}
            className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-slate-100">{m.name}</p>
              <p className="truncate text-xs text-slate-500">{m.note}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={
                  "rounded-full px-2 py-0.5 font-mono text-xs " +
                  (m.score >= 0.7
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-slate-800 text-slate-400")
                }
              >
                {m.score.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">{m.qb}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
          Sent · Atlas
        </span>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">
          Replied · Keystone $42k
        </span>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
          BOUND $42,000
        </span>
      </div>
    </div>
  );
}

const HERO_MATCHES = [
  { name: "Atlas Specialty E&S", note: "Artisan contractor, FL in-appetite", score: 0.84, qb: "4d" },
  { name: "Keystone Mutual", note: "NAICS 238 + GL + auto in-band", score: 0.71, qb: "7d" },
  { name: "Redwood Underwriters", note: "Property only, skipped", score: 0.32, qb: "-" },
];

function Problem() {
  return (
    <section className="border-t border-slate-900 bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              The wholesale broker's bottleneck isn't selling.
              <span className="mt-1 block text-slate-400">
                It's submission triage.
              </span>
            </h2>
            <p className="mt-6 text-base leading-relaxed text-slate-400">
              Every retail submission needs the same boring work before it can
              move: read the ACORD, classify the risk, look up which carriers
              cover it in this state at this revenue, write a custom cover
              note for each one, attach the right forms, send.
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-400">
              A 20-person brokerage processes 200 to 600 of these a month.
              That's 60+ hours of CSR time that could be spent on the calls
              that close.
            </p>
          </div>
          <ul className="space-y-4 text-sm text-slate-300">
            {PROBLEMS.map((p) => (
              <li
                key={p.title}
                className="rounded-lg border border-slate-800 bg-slate-950 p-4 sm:p-5"
              >
                <p className="font-medium text-slate-100">{p.title}</p>
                <p className="mt-1.5 text-slate-400">{p.body}</p>
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
    title: "30 to 90 minutes per submission",
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
    <section id="how" className="border-t border-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          How it works
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">
          Drop an ACORD, get back a reviewable submission package. Three
          steps, all automated, you stay in the loop on every send.
        </p>
        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <article
              key={s.title}
              className="rounded-xl border border-slate-800 bg-slate-950 p-5 sm:p-6"
            >
              <p className="text-[10px] uppercase tracking-widest text-emerald-400">
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
    body: "Drop a PDF or forward an email. We extract every field (insured, NAICS, locations, lines, loss runs) and normalize them into one record.",
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

function Comparison() {
  return (
    <section className="border-t border-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          Why not just use ChatGPT?
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">
          Honest answer: ChatGPT can score one submission against a carrier
          you paste in. It can't run the workflow. Here's what the difference
          looks like at 200 submissions a month.
        </p>

        <div className="mt-10 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="py-3 pr-6"></th>
                <th className="py-3 pr-6">ChatGPT / Claude.ai</th>
                <th className="py-3 pr-6">Your AMS alone</th>
                <th className="py-3 pr-6 text-emerald-400">AppetiteMatch</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {COMPARISON_ROWS.map((r) => (
                <tr key={r.label} className="border-t border-slate-900">
                  <td className="py-3 pr-6 font-medium text-slate-100">
                    {r.label}
                  </td>
                  <td className="py-3 pr-6 text-slate-400">{r.chatgpt}</td>
                  <td className="py-3 pr-6 text-slate-400">{r.ams}</td>
                  <td className="py-3 pr-6 text-emerald-300">{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 max-w-3xl text-sm text-slate-500">
          The agentic LLM is the easy part. The structured carrier appetite
          DB, the org-scoped audit log, the SES outbound with PDF attached,
          the per-org pipeline view, that's where AppetiteMatch lives.
        </p>
      </div>
    </section>
  );
}

const COMPARISON_ROWS = [
  { label: "Reads ACORD PDFs", chatgpt: "Yes (slow, no validation)", ams: "No", us: "Yes, Document AI form parser" },
  { label: "Carrier appetite DB", chatgpt: "You paste it every time", ams: "Static, often stale", us: "Per-org, editable, versioned" },
  { label: "Drafted carrier emails", chatgpt: "Yes, but generic", ams: "Templates only", us: "Carrier-specific, reads each carrier's appetite" },
  { label: "Sends + tracks outbound", chatgpt: "No", ams: "Manual", us: "SES with PDF attached, reply tracked to draft" },
  { label: "Quote-back pipeline", chatgpt: "No", ams: "Spreadsheet", us: "Inbox view, bind/decline outcomes" },
  { label: "Audit log for E&O", chatgpt: "No", ams: "Sometimes", us: "Every state change, exportable" },
  { label: "Multi-user org", chatgpt: "No", ams: "Yes (seat-priced)", us: "Yes, magic-link login" },
  { label: "Time per submission", chatgpt: "10 to 15 min", ams: "30 to 90 min", us: "20 seconds + review" },
];

function UseCases() {
  return (
    <section className="border-t border-slate-900 bg-slate-950/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          Built for the workflows brokers actually run.
        </h2>
        <p className="mt-2 max-w-2xl text-slate-400">
          Same product, different appetites. A few real-world configurations
          we've seen.
        </p>
        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-2">
          {USE_CASES.map((u) => (
            <article
              key={u.title}
              className="rounded-xl border border-slate-800 bg-slate-950 p-5 sm:p-6"
            >
              <p className="text-[10px] uppercase tracking-widest text-emerald-400">
                {u.tag}
              </p>
              <h3 className="mt-2 text-lg font-medium text-slate-100">
                {u.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {u.body}
              </p>
              <ul className="mt-4 space-y-1.5 text-xs leading-relaxed text-slate-500">
                {u.bullets.map((b) => (
                  <li key={b}>· {b}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const USE_CASES = [
  {
    tag: "Artisan contractors",
    title: "Roofer in Texas, plumber in Florida, HVAC in Georgia",
    body: "Mid-market construction trades with $1 to 25M revenue, mostly W-2 staff, GL + Auto + Umbrella. AppetiteMatch flags the carriers in southern in-appetite states with NAICS 23x prefixes and revenue bands that fit, drafts cover emails that reference each carrier's specific underwriting concerns (driver MVRs, subcontractor exposure, loss frequency on auto).",
    bullets: [
      "Auto-flags carriers that exclude the insured's state",
      "Routes umbrella separately when the GL carrier doesn't write umbrella",
      "Surfaces 75%-of-premium decline triggers on auto loss runs",
    ],
  },
  {
    tag: "Habitational property",
    title: "Apartment buildings, condos, mixed-use",
    body: "$5 to 50M TIV property accounts in southern states. Carriers want sprinklered, masonry construction, post-2000 build year, verified loss runs. AppetiteMatch reads the location schedule, identifies the carriers whose habitational appetite fits, and embeds the COPE summary inline in the cover.",
    bullets: [
      "Reads location schedules + construction class out of the ACORD",
      "Skips carriers without habitational lines (no wasted submissions)",
      "Highlights wind/hail exposure for coastal accounts",
    ],
  },
  {
    tag: "Transportation",
    title: "Trucking fleets, freight, last-mile",
    body: "Power-unit count, MVR violations, driver tenure, and loss runs are everything. Routes for-hire trucking risks to the carriers whose appetite includes the insured's mile radius and commodity type, with the FMCSA + MVR data threaded into the cover.",
    bullets: [
      "Power-unit and driver count surfaced at the top of the cover",
      "MVR violation summary disclosed proactively for transparency",
      "Auto loss ratio computed and defended in the email body",
    ],
  },
  {
    tag: "Specialty / E&S",
    title: "Anything your retail can't place",
    body: "Manufacturing tail risks, environmental contractors, restaurants with liquor, cyber. Define each carrier's appetite once in the directory, AppetiteMatch never sends an out-of-appetite submission again. Saves 40 to 90 minutes per declined risk that would have round-tripped to the underwriter.",
    bullets: [
      "Per-org carrier directory, your appetite library, not ours",
      "Deterministic prefilter rejects out-of-appetite before the LLM call",
      "Audit log captures every triage decision for E&O reviews",
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-t border-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
          Pricing
        </h2>
        <p className="mt-2 text-slate-400">
          Outcome-based. You pay for triaged submissions, not seats.
        </p>
        <div className="mt-10 grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((p) => (
            <article
              key={p.name}
              className={
                "flex flex-col rounded-xl border p-6 " +
                (p.highlight
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-slate-800 bg-slate-950")
              }
            >
              <p className="text-sm font-medium text-emerald-400">{p.name}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-100 sm:text-4xl">
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
                  "mt-auto inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium pt-6 " +
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
    cta: "Start free trial",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$499",
    cadence: " /mo",
    target: "Unlimited submissions, full team",
    features: [
      "Everything in Trial",
      "Real outbound email + reply tracking",
      "Slack alerts on quote-backs",
      "Audit log + run history",
    ],
    cta: "Start free trial",
    href: "/signup",
    highlight: true,
  },
  {
    name: "Whale",
    price: "$10k+",
    cadence: " /mo",
    target: "Custom carrier integrations",
    features: [
      "Custom appetite-guide ingestion",
      "AMS write-back (Applied Epic, AMS360)",
      "Dedicated SLA + Slack channel",
      "On-site training for CSR team",
    ],
    cta: "Talk to a human",
    href: "mailto:hello@appetitematch.com",
    highlight: false,
  },
];
