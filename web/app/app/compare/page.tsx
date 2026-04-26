"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardChrome";
import type { TriageRunDetail, TriageRunSummary } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function ComparePageInner() {
  const params = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");

  const [apiKey, setApiKey] = useState("");
  const [a, setA] = useState<TriageRunDetail | null>(null);
  const [b, setB] = useState<TriageRunDetail | null>(null);
  const [history, setHistory] = useState<TriageRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const histRes = await fetch(`${API_URL}/history?limit=50`, {
          credentials: "include",
          headers: authHeaders(apiKey),
        });
        if (!cancelled && histRes.ok) {
          setHistory((await histRes.json()) as TriageRunSummary[]);
        }
        const reqs: Promise<Response>[] = [];
        if (aId) reqs.push(fetch(`${API_URL}/history/${aId}`, {
          credentials: "include", headers: authHeaders(apiKey),
        }));
        if (bId) reqs.push(fetch(`${API_URL}/history/${bId}`, {
          credentials: "include", headers: authHeaders(apiKey),
        }));
        const responses = await Promise.all(reqs);
        if (cancelled) return;
        let i = 0;
        if (aId) {
          const r = responses[i++];
          if (r.ok) setA((await r.json()) as TriageRunDetail);
          else setError(`Could not load run ${aId}: ${r.status}`);
        }
        if (bId) {
          const r = responses[i++];
          if (r.ok) setB((await r.json()) as TriageRunDetail);
          else setError(`Could not load run ${bId}: ${r.status}`);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aId, bId, apiKey]);

  return (
    <main className="min-h-screen pb-12">
      <DashboardHeader
        title="Compare runs"
        subtitle="Side-by-side comparison of two triage runs - useful for renewal walkthroughs."
        rightSlot={
          <Link
            href="/app"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            ← Back to triage
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {error && (
          <p className="mb-4 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <RunPicker
            label="Run A"
            history={history}
            currentId={aId}
            otherId={bId}
            param="a"
          />
          <RunPicker
            label="Run B"
            history={history}
            currentId={bId}
            otherId={aId}
            param="b"
          />
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <RunCard run={a} other={b} side="A" />
          <RunCard run={b} other={a} side="B" />
        </div>
      </div>
    </main>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={null}>
      <ComparePageInner />
    </Suspense>
  );
}

function RunPicker({
  label,
  history,
  currentId,
  otherId,
  param,
}: {
  label: string;
  history: TriageRunSummary[];
  currentId: string | null;
  otherId: string | null;
  param: "a" | "b";
}) {
  const otherParam = param === "a" ? "b" : "a";
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <select
        value={currentId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          const sp = new URLSearchParams();
          if (v) sp.set(param, v);
          if (otherId) sp.set(otherParam, otherId);
          window.location.search = sp.toString();
        }}
        className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
      >
        <option value="">Pick a run…</option>
        {history.map((r) => (
          <option key={r.id} value={r.id}>
            {new Date(r.created_at).toLocaleDateString()} · {r.insured_name}{" "}
            ({r.primary_state}) · {r.match_count} matches
          </option>
        ))}
      </select>
    </label>
  );
}

function RunCard({
  run,
  other,
  side,
}: {
  run: TriageRunDetail | null;
  other: TriageRunDetail | null;
  side: "A" | "B";
}) {
  if (!run) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-800 text-sm text-slate-500">
        Pick run {side} to compare.
      </div>
    );
  }
  const myCarriers = new Set(run.result.matches.map((m) => m.carrier_id));
  const otherCarriers = new Set(
    other?.result.matches.map((m) => m.carrier_id) ?? [],
  );
  return (
    <article className="rounded-md border border-slate-800 bg-slate-950 p-5">
      <p className="text-[10px] uppercase tracking-widest text-emerald-400">
        Run {side}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-slate-100">
        {run.insured_name}
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        {new Date(run.created_at).toLocaleString()} · {run.primary_state} ·{" "}
        {run.match_count} matches · {run.draft_count} drafts
      </p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Matches
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {run.result.matches.map((m) => {
          const onlyHere = other && !otherCarriers.has(m.carrier_id);
          return (
            <li
              key={m.carrier_id}
              className={
                "flex items-center justify-between gap-3 rounded border border-slate-800 px-2 py-1 " +
                (onlyHere ? "bg-amber-500/5" : "bg-slate-900/40")
              }
            >
              <span className="truncate text-slate-200">
                {m.carrier_name}{" "}
                {onlyHere && (
                  <span className="ml-1 text-[10px] text-amber-300">
                    only in run {side}
                  </span>
                )}
              </span>
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 font-mono text-xs " +
                  (m.score >= 0.7
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-slate-800 text-slate-400")
                }
              >
                {m.score.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>

      {other && (
        <p className="mt-3 text-[11px] text-slate-500">
          {[...otherCarriers].filter((id) => !myCarriers.has(id)).length} carrier
          {[...otherCarriers].filter((id) => !myCarriers.has(id)).length === 1
            ? ""
            : "s"}{" "}
          appeared in run {side === "A" ? "B" : "A"} but not here.
        </p>
      )}
    </article>
  );
}
