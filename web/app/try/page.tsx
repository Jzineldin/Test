"use client";

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { useEffect, useRef, useState } from "react";

const SAMPLE_PASTED_JSON = `{
  "submission_id": "SUB-DEMO-2087",
  "received_at": "2026-04-26",
  "retail_agent_email": "tariq@gulfcoast-insurance.example",
  "insured": {
    "legal_name": "Sunrise Mechanical Solutions Inc",
    "naics": "238220",
    "primary_state": "FL",
    "annual_revenue": "5800000",
    "employee_count": 31,
    "business_description": "Commercial HVAC installation and service across Tampa Bay metro. No residential. W-2 technicians only.",
    "years_in_business": 18,
    "mailing_address": "4220 W Cypress St, Tampa, FL 33607"
  },
  "coverages": [
    {"line": "general_liability", "limit_per_occurrence": "1000000", "limit_aggregate": "2000000", "expiring_premium": "26500"},
    {"line": "commercial_auto", "limit_per_occurrence": "1000000", "expiring_premium": "31200"},
    {"line": "umbrella", "limit_per_occurrence": "5000000", "expiring_premium": "8400"}
  ],
  "loss_history": [
    {"policy_year": 2022, "line": "general_liability", "claim_count": 1, "incurred": "8200"},
    {"policy_year": 2024, "line": "commercial_auto", "claim_count": 2, "incurred": "18900"}
  ]
}`;

type Match = {
  carrier: string;
  score: number;
  qb: string;
  rationale: string;
  flags: string[];
  inAppetite: boolean;
};

const DEMO_MATCHES: Match[] = [
  {
    carrier: "Atlas Specialty E&S",
    score: 0.84,
    qb: "4 days",
    inAppetite: true,
    rationale:
      "NAICS 238220 (HVAC) sits in Atlas's artisan-contractor 238/236 prefix. Florida is in-appetite (TX/FL/GA/AZ/NV/TN/NC/SC/OK/AL). $5.8M revenue is comfortably inside the $500K-$15M band. GL + Auto + Umbrella all covered. 18 years in business with clean GL and modest auto frequency - low risk profile fits Atlas's appetite for stable artisan operations.",
    flags: [
      "2024 auto incurred ($18,900) is ~61% of expiring premium - within Atlas's typical thresholds but worth flagging",
      "Open reserve $2,800 on 2024 auto - request status from retail agent",
      "MVR: 2 violations across 16 drivers (3-year) - modest, transparent disclosure",
    ],
  },
  {
    carrier: "Keystone Mutual",
    score: 0.71,
    qb: "7 days",
    inAppetite: true,
    rationale:
      "238 prefix matches Keystone's appetite (238/236/237/484/561). FL not in states_out (LA, MS). $5.8M revenue inside $1M-$50M band. GL + Auto are core lines for Keystone. The 75%-of-premium decline rule on auto is checked: 2024 incurred $18,900 / $31,200 expiring premium = 61%, within threshold. Umbrella isn't in Keystone's appetite - placing that line elsewhere.",
    flags: [
      "Umbrella outside Keystone appetite - auto-split, placing $5M umbrella with separate market",
      "Auto loss ratio approaches the 75%-of-premium decline rule - full loss runs attached for transparency",
    ],
  },
  {
    carrier: "Redwood Underwriters",
    score: 0.32,
    qb: "-",
    inAppetite: false,
    rationale:
      "Redwood's appetite is property-only in southern states with $25M revenue cap. This submission is GL/auto/umbrella, no property line requested. Skipping draft generation - submission would not be in-appetite even on a generous read.",
    flags: ["Not drafting - out of appetite (no property line)"],
  },
];

const ATLAS_DRAFT = `Subject: Submission - Sunrise Mechanical Solutions Inc (Sunrise HVAC) | GL / CA / Umbrella | NAICS 238220 | FL | Eff. 07/01/2026

Hi Janet,

Please find attached an ACORD packet for Sunrise Mechanical Solutions Inc (dba Sunrise HVAC) - a commercial HVAC contractor in Tampa, FL that aligns closely with Atlas's artisan contractor appetite.

KEY RISK PROFILE
- NAICS: 238220 | 18 years in business
- Operations: Commercial HVAC installation (60%) + service contracts (40%), Tampa Bay metro. No residential. No GC new construction. All W-2 technicians - no 1099 subs.
- Annual revenue: $5,800,000 (within your $500K-$15M band)
- Employees: 31 | Primary state: FL (in-appetite)
- Expiring carrier: Berkshire Hathaway

LINES REQUESTED (all eff. 07/01/2026)
- General Liability: $1M occ / $2M agg | $5K ded | Expiring premium: $26,500
- Commercial Auto: $1M occ | $1K ded | 14 power units / 16 drivers | Expiring premium: $31,200
- Umbrella: $5M occ | $0 ded | Expiring premium: $8,400

LOSS HISTORY (5 years)
GL: 2 claims in 5 years, both closed, total incurred $20,600.
Auto: 2024 had 2 claims, $18,900 incurred ($16,100 paid, $2,800 open reserve). 2023 single claim closed at $9,700.

ITEMS FOR YOUR REVIEW
1. Auto 2024 open reserve $2,800 - getting status from retail agent.
2. MVR: 2 violations across 16 drivers (3-yr) - disclosed for transparency.

Atlas typically quotes back inside 4 business days. Insured needs three quotes by June 1.

Thank you,
Tale Forge AB`;

// Step indices and human labels for the progress strip.
const STEPS = [
  "Submission received",
  "Pre-filter carriers",
  "Score appetite",
  "Draft cover email",
  "Send via SES",
  "Carrier replies, bound",
] as const;

const STEP_DELAYS_MS = [1400, 2400, 2600, 5200, 1800, 2400];

export default function TryPage() {
  // step is the index of the *currently animating* phase. When step === STEPS.length
  // the run is finished; replay rewinds to 0.
  const [step, setStep] = useState(0);
  const [draftLen, setDraftLen] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function start(fromStep = 0) {
    clearTimers();
    setStep(fromStep);
    setDraftLen(fromStep > 3 ? ATLAS_DRAFT.length : 0);
    let cumulative = 0;
    for (let i = fromStep; i < STEPS.length; i++) {
      cumulative += STEP_DELAYS_MS[i];
      const next = i + 1;
      timers.current.push(setTimeout(() => setStep(next), cumulative));
    }
  }

  function skipToEnd() {
    clearTimers();
    setStep(STEPS.length);
    setDraftLen(ATLAS_DRAFT.length);
  }

  // Autoplay on mount.
  useEffect(() => {
    start(0);
    return clearTimers;
  }, []);

  // Typewriter the draft body during the drafting step (step index 3).
  useEffect(() => {
    if (step !== 3) return;
    const total = ATLAS_DRAFT.length;
    const tickMs = 12;
    const charsPerTick = Math.ceil(total / (STEP_DELAYS_MS[3] / tickMs));
    setDraftLen(0);
    const id = setInterval(() => {
      setDraftLen((n) => {
        const next = Math.min(total, n + charsPerTick);
        if (next >= total) clearInterval(id);
        return next;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [step]);

  // After the drafting step ends, ensure the body is fully shown.
  useEffect(() => {
    if (step >= 4) setDraftLen(ATLAS_DRAFT.length);
  }, [step]);

  const showPrefilter = step >= 1;
  const showScores = step >= 2;
  const showDraft = step >= 3;
  const showSent = step >= 4;
  const showBound = step >= 5;
  const isDone = step >= STEPS.length;

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pb-20">
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400 sm:text-xs">
          Live demo, no signup required
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-4xl">
          See it run on a real submission.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">
          Tampa HVAC contractor, $5.8M revenue, GL + Auto + Umbrella, 5-year
          loss runs. The agent prefilters carriers, scores appetite, drafts a
          cover email, sends it, and tracks the reply. Auto-plays below.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => start(i)}
              className={
                "rounded-full border px-3 py-1 text-[11px] transition-colors " +
                (i < step
                  ? "border-emerald-700 bg-emerald-500/15 text-emerald-300"
                  : i === step && !isDone
                  ? "border-emerald-500 bg-emerald-500/25 text-emerald-200"
                  : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300")
              }
            >
              {i + 1}. {label}
            </button>
          ))}
          {isDone ? (
            <button
              onClick={() => start(0)}
              className="ml-auto rounded-md border border-emerald-500 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
            >
              Replay
            </button>
          ) : (
            <button
              onClick={skipToEnd}
              className="ml-auto rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200"
            >
              Skip to end
            </button>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[400px_1fr] lg:gap-8">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-slate-500">
              <span>Submission JSON</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] normal-case tracking-normal text-emerald-300">
                Pasted
              </span>
            </div>
            <pre className="max-h-[480px] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
              {SAMPLE_PASTED_JSON}
            </pre>
          </div>

          <div className="space-y-8">
            <Section
              title={`Pre-filter (${
                DEMO_MATCHES.filter((m) => m.inAppetite).length
              } pass, ${
                DEMO_MATCHES.filter((m) => !m.inAppetite).length
              } skipped)`}
              show={showPrefilter}
            >
              <ul className="space-y-2 text-sm">
                {DEMO_MATCHES.map((m, i) => (
                  <li
                    key={m.carrier}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 transition-all"
                    style={{
                      transitionDelay: `${i * 120}ms`,
                      opacity: showPrefilter ? 1 : 0,
                      transform: showPrefilter
                        ? "translateY(0)"
                        : "translateY(6px)",
                    }}
                  >
                    <span className="truncate text-slate-200">{m.carrier}</span>
                    {m.inAppetite ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                        ✓ in appetite
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                        ✗ skipped
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title={`Appetite matches (${
                DEMO_MATCHES.filter((m) => m.inAppetite).length
              })`}
              show={showScores}
            >
              <ul className="space-y-3">
                {DEMO_MATCHES.filter((m) => m.inAppetite).map((m) => (
                  <li
                    key={m.carrier}
                    className="rounded-md border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-100">
                        {m.carrier}
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 font-mono " +
                            (m.score >= 0.7
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-800 text-slate-400")
                          }
                        >
                          {m.score.toFixed(2)}
                        </span>
                        <span className="text-slate-500">
                          quote-back: {m.qb}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {m.rationale}
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-amber-300">
                      {m.flags.map((f) => (
                        <li key={f}>⚠️ {f}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Drafted carrier email - Atlas Specialty"
              show={showDraft}
              right={
                showSent ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      Sent · 11:42 AM
                    </span>
                    {showBound && (
                      <>
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300">
                          Replied · Quote $42k
                        </span>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          BOUND $42,000
                        </span>
                      </>
                    )}
                  </div>
                ) : null
              }
            >
              <pre className="whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 p-4 font-sans text-sm leading-relaxed text-slate-300">
                {ATLAS_DRAFT.slice(0, draftLen)}
                {draftLen < ATLAS_DRAFT.length && (
                  <span className="ml-px inline-block w-1.5 animate-pulse bg-emerald-400 align-middle">
                    &nbsp;
                  </span>
                )}
              </pre>
              <p className="mt-2 text-xs text-slate-500">
                Plus a Keystone-specific draft with auto-split umbrella
                reasoning. Full output unlocks on signup.
              </p>
            </Section>

            {!showPrefilter && (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-dashed border-emerald-700 text-sm text-emerald-300">
                <div className="flex items-center gap-3">
                  <div className="size-3 animate-pulse rounded-full bg-emerald-400" />
                  Submission received. Loading carrier directory…
                </div>
              </div>
            )}

            <div className="rounded-md border border-emerald-700 bg-emerald-500/5 p-5">
              <p className="text-sm text-slate-100">
                <span className="font-semibold text-emerald-300">
                  Like what you see?
                </span>{" "}
                Sign up free, drop your own ACORD or paste JSON, get the same
                output for your real submission in 20 seconds.
              </p>
              <Link
                href="/signup"
                className="mt-4 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
              >
                Start free trial - no card
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Section({
  title,
  show,
  right,
  children,
}: {
  title: string;
  show: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="transition-all duration-500"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(8px)",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}
