"use client";

import { useState } from "react";
import { ACME_PLUMBING_SUBMISSION } from "@/lib/sample";
import type { TriageResult } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const [submissionJson, setSubmissionJson] = useState(
    JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2),
  );
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runTriage() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(submissionJson);
      const res = await fetch(`${API_URL}/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }
      setResult((await res.json()) as TriageResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 flex items-baseline justify-between border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submission Triage</h1>
          <p className="mt-1 text-sm text-slate-400">
            Wholesale broker workflow — ACORD in, carrier-ready submissions out.
          </p>
        </div>
        <span className="text-xs uppercase tracking-widest text-slate-500">v0 demo</span>
      </header>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[400px_1fr]">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Submission JSON
          </label>
          <textarea
            value={submissionJson}
            onChange={(e) => setSubmissionJson(e.target.value)}
            spellCheck={false}
            className="h-[480px] w-full rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={runTriage}
              disabled={loading}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Triaging…" : "Run triage"}
            </button>
            <button
              onClick={() =>
                setSubmissionJson(JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2))
              }
              className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
            >
              Reset to sample
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            POSTs to <code>{API_URL}/triage</code>. Start the API with{" "}
            <code>uvicorn app.main:app --reload</code> from the <code>api/</code> directory.
          </p>
        </div>

        <div>
          {error && (
            <div className="mb-4 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {!result && !error && (
            <div className="flex h-full min-h-[480px] items-center justify-center rounded-md border border-dashed border-slate-800 text-sm text-slate-500">
              Run triage to see appetite matches and drafted emails.
            </div>
          )}

          {result && (
            <>
              <Matches matches={result.matches} summary={result.summary} />
              <DraftedEmails drafts={result.drafted_emails} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Matches({
  matches,
  summary,
}: {
  matches: TriageResult["matches"];
  summary: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Appetite matches ({matches.length})
      </h2>
      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Carrier</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
              <th className="px-3 py-2 text-right font-medium">Quote-back</th>
              <th className="px-3 py-2 font-medium">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.carrier_id} className="border-t border-slate-800 align-top">
                <td className="px-3 py-3 font-medium text-slate-200">{m.carrier_name}</td>
                <td className="px-3 py-3 text-right">
                  <span
                    className={
                      m.score >= 0.7
                        ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400"
                        : m.score >= 0.5
                        ? "rounded-full bg-amber-500/15 px-2 py-1 text-xs text-amber-400"
                        : "rounded-full bg-slate-700/40 px-2 py-1 text-xs text-slate-400"
                    }
                  >
                    {m.score.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-slate-300">
                  {m.typical_quote_back_days}d
                </td>
                <td className="px-3 py-3 text-slate-300">
                  <p>{m.rationale}</p>
                  {m.risk_flags.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-amber-300">
                      {m.risk_flags.map((flag) => (
                        <li key={flag}>⚠ {flag}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs italic text-slate-400">{summary}</p>
    </section>
  );
}

function DraftedEmails({ drafts }: { drafts: TriageResult["drafted_emails"] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Drafted carrier emails ({drafts.length})
      </h2>
      <div className="space-y-4">
        {drafts.map((d) => (
          <article
            key={d.carrier_id}
            className="rounded-md border border-slate-800 bg-slate-950 p-4"
          >
            <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>To: <span className="text-slate-200">{d.to}</span></span>
              <span>Attach: {d.attachments.join(", ")}</span>
            </div>
            <p className="mb-3 text-sm font-semibold text-slate-100">{d.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
              {d.body}
            </pre>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400">
                Send to carrier
              </button>
              <button className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">
                Edit draft
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
