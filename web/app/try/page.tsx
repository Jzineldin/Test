"use client";

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { useState } from "react";

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

const DEMO_MATCHES = [
  {
    carrier: "Atlas Specialty E&S",
    score: 0.84,
    qb: "4 days",
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
    rationale:
      "Redwood's appetite is property-only in southern states with $25M revenue cap. This submission is GL/auto/umbrella, no property line requested. Skipping draft generation - submission would not be in-appetite even on a generous read.",
    flags: ["Not drafting - out of appetite (no property line)"],
  },
];

const ATLAS_DRAFT = `Subject: Submission - Sunrise Mechanical Solutions Inc (Sunrise HVAC) | GL / CA / Umbrella | NAICS 238220 | FL | Eff. 07/01/2026

Hi Janet,

Please find attached an ACORD packet for Sunrise Mechanical Solutions Inc (dba Sunrise HVAC) - a commercial HVAC contractor in Tampa, FL that aligns closely with Atlas's artisan contractor appetite.

KEY RISK PROFILE
• NAICS: 238220 | 18 years in business
• Operations: Commercial HVAC installation (60%) + service contracts (40%), Tampa Bay metro. No residential. No GC new construction. All W-2 technicians - no 1099 subs.
• Annual revenue: $5,800,000 (within your $500K-$15M band)
• Employees: 31 | Primary state: FL (in-appetite)
• Expiring carrier: Berkshire Hathaway

LINES REQUESTED (all eff. 07/01/2026)
• General Liability: $1M occ / $2M agg | $5K ded | Expiring premium: $26,500
• Commercial Auto: $1M occ | $1K ded | 14 power units / 16 drivers | Expiring premium: $31,200
• Umbrella: $5M occ | $0 ded | Expiring premium: $8,400

LOSS HISTORY (5 years)
GL: 2 claims in 5 years, both closed, total incurred $20,600.
Auto: 2024 had 2 claims, $18,900 incurred ($16,100 paid, $2,800 open reserve). 2023 single claim closed at $9,700.

ITEMS FOR YOUR REVIEW
1. Auto 2024 open reserve $2,800 - getting status from retail agent.
2. MVR: 2 violations across 16 drivers (3-yr) - disclosed for transparency.

Atlas typically quotes back inside 4 business days. Insured needs three quotes by June 1.

Thank you,
Tale Forge AB`;

export default function TryPage() {
  const [stage, setStage] = useState<"input" | "running" | "result">("input");

  function run() {
    setStage("running");
    setTimeout(() => setStage("result"), 1800);
  }

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-20">
        <p className="mb-3 text-xs uppercase tracking-[0.2em] text-emerald-400">
          Live demo · no signup required
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
          See it run on a real submission.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">
          Below is a Tampa HVAC contractor - $5.8M revenue, GL + Auto +
          Umbrella, 5-year loss runs. Click run to see how the agent scores
          carriers and drafts the cover email. (This page is pre-baked so you
          don't burn LLM tokens - sign up for the real triage.)
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[420px_1fr]">
          <div>
            <div className="mb-2 text-xs uppercase tracking-widest text-slate-500">
              Submission JSON
            </div>
            <pre className="max-h-[480px] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
              {SAMPLE_PASTED_JSON}
            </pre>
            <button
              onClick={run}
              disabled={stage !== "input"}
              className="mt-3 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {stage === "input"
                ? "Run triage"
                : stage === "running"
                ? "Scoring carriers…"
                : "Done"}
            </button>
          </div>

          <div>
            {stage === "input" && (
              <div className="flex h-full min-h-[480px] items-center justify-center rounded-md border border-dashed border-slate-800 text-sm text-slate-500">
                Click <span className="mx-1 text-emerald-400">Run triage</span>{" "}
                to see appetite scores and drafted emails.
              </div>
            )}
            {stage === "running" && (
              <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-3 rounded-md border border-dashed border-emerald-700 text-sm text-emerald-300">
                <div className="size-8 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
                Scoring 4 carriers · drafting cover emails…
              </div>
            )}
            {stage === "result" && (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Appetite matches (3)
                </h2>
                <ul className="mt-3 space-y-3">
                  {DEMO_MATCHES.map((m) => (
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

                <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  Drafted carrier email - Atlas Specialty
                </h2>
                <pre className="mt-3 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-950 p-4 font-sans text-sm leading-relaxed text-slate-300">
                  {ATLAS_DRAFT}
                </pre>
                <p className="mt-2 text-xs text-slate-500">
                  Plus a Keystone-specific draft (with auto-split umbrella
                  reasoning) - full output unlocks on signup.
                </p>

                <div className="mt-8 rounded-md border border-emerald-700 bg-emerald-500/5 p-5">
                  <p className="text-sm text-slate-100">
                    <span className="font-semibold text-emerald-300">
                      Like what you see?
                    </span>{" "}
                    Sign up free, drop your own ACORD or paste JSON, get the
                    same output for your real submission in 20 seconds.
                  </p>
                  <Link
                    href="/signup"
                    className="mt-4 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
                  >
                    Start free trial - no card
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
