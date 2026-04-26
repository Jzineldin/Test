"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardChrome";
import { useToast } from "@/components/Toast";
import type { DraftStatus } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

const TABS = [
  { key: "drafted", label: "Drafted" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "bound", label: "Bound" },
  { key: "declined", label: "Declined" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function QueuePage() {
  const router = useRouter();
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<TabKey>("drafted");
  const [drafts, setDrafts] = useState<DraftStatus[]>([]);

  useEffect(() => {
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/me`, {
          credentials: "include",
          headers: authHeaders(apiKey),
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
      } catch {
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, router]);

  async function reload() {
    if (!authChecked) return;
    const r = await fetch(`${API_URL}/drafts?status=${tab}&limit=200`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (r.ok) setDrafts((await r.json()) as DraftStatus[]);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, apiKey, tab]);

  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(id: number) {
    const r = await fetch(`${API_URL}/drafts/${id}/send`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (r.ok) {
      toast.push("Sent", "success");
      reload();
    } else {
      toast.push(`Send failed: ${r.status}`, "error");
    }
  }

  async function markSelected(outcome: "bound" | "declined") {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Mark ${selected.size} draft${selected.size === 1 ? "" : "s"} as ${outcome}?`,
      )
    )
      return;
    let ok = 0;
    let failed = 0;
    for (const id of selected) {
      const r = await fetch(`${API_URL}/drafts/${id}/outcome`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({ outcome }),
      });
      if (r.ok) ok += 1;
      else failed += 1;
    }
    toast.push(
      `Marked ${ok}${failed ? `; ${failed} failed` : ""} as ${outcome}`,
      failed ? "error" : "success",
    );
    setSelected(new Set());
    reload();
  }

  async function sendAll() {
    if (drafts.length === 0) return;
    if (
      !confirm(
        `Send all ${drafts.length} drafted emails? Each one goes to its carrier as-is.`,
      )
    ) {
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const d of drafts) {
      const r = await fetch(`${API_URL}/drafts/${d.id}/send`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(apiKey),
      });
      if (r.ok) ok += 1;
      else failed += 1;
    }
    toast.push(
      `Sent ${ok}${failed ? `; ${failed} failed` : ""}`,
      failed ? "error" : "success",
    );
    reload();
  }

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-12">
      <DashboardHeader
        title="Draft queue"
        subtitle="Every drafted carrier email across every triage run, grouped by status. CSR home base."
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
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (tab === t.key
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                  : "border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200")
              }
            >
              {t.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-slate-500">{drafts.length} rows</span>
          {tab === "drafted" && drafts.length > 1 && (
            <button
              onClick={sendAll}
              className="ml-auto rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
            >
              Send all {drafts.length}
            </button>
          )}
          {(tab === "sent" || tab === "replied") && selected.size > 0 && (
            <div className="ml-auto flex gap-2">
              <span className="self-center text-xs text-slate-400">
                {selected.size} selected
              </span>
              <button
                onClick={() => markSelected("bound")}
                className="rounded-md border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
              >
                Mark bound
              </button>
              <button
                onClick={() => markSelected("declined")}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
              >
                Mark declined
              </button>
            </div>
          )}
        </div>

        {drafts.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
            Nothing in this lane yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="rounded-md border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1 flex items-baseline gap-3">
                    {(tab === "sent" || tab === "replied") && (
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggleSelected(d.id)}
                        className="size-4 cursor-pointer accent-emerald-500"
                        aria-label={`Select ${d.subject}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-100">
                      {d.subject}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      To {d.to} · {d.carrier_id}
                      {d.sent_at && (
                        <>
                          {" "}
                          · sent {new Date(d.sent_at).toLocaleString()}
                        </>
                      )}
                      {d.outcome === "bound" && d.bound_premium_cents != null && (
                        <>
                          {" "}
                          · ★ bound $
                          {(d.bound_premium_cents / 100).toLocaleString()}
                        </>
                      )}
                    </p>
                    </div>
                  </div>
                  {tab === "drafted" && (
                    <button
                      onClick={() => send(d.id)}
                      className="shrink-0 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
                    >
                      Send
                    </button>
                  )}
                </div>
                {d.quote_reply_body && (
                  <p className="mt-3 line-clamp-3 rounded border border-sky-800 bg-sky-500/5 p-2 text-xs text-slate-300">
                    {d.quote_reply_body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
