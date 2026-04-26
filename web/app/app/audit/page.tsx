"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

interface AuditEvent {
  id: number;
  event_type: string;
  actor: string;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export default function AuditPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState<string>("");

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

  useEffect(() => {
    if (!authChecked) return;
    fetch(`${API_URL}/audit?limit=200`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    })
      .then((r) => r.json())
      .then((b) => setEvents(b as AuditEvent[]));
  }, [apiKey, authChecked]);

  const filtered = filter
    ? events.filter((e) =>
        e.event_type.toLowerCase().includes(filter.toLowerCase()),
      )
    : events;

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Audit log
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Every state change is recorded — useful for E&O incident reviews
            and SOC 2 evidence collection.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by event type…"
            className="w-56 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <Link
            href="/app"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            ← Back
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/50 text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.id}
                className="border-t border-slate-900 align-top text-slate-300"
              >
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                  {e.event_type}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{e.actor}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {e.target_id ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {Object.keys(e.details).length > 0 ? (
                    <code className="text-slate-400">
                      {JSON.stringify(e.details)}
                    </code>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No events yet. Run a triage or change a setting to populate
                  this log.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
