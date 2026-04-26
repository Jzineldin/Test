"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Carrier, CarrierAppetiteRule } from "@/lib/types";
import { DashboardHeader } from "@/components/DashboardChrome";
import { useToast } from "@/components/Toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export default function CarriersPage() {
  const router = useRouter();
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const reload = useCallback(async () => {
    if (!authChecked) return;
    const res = await fetch(`${API_URL}/carriers`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (res.ok) setCarriers((await res.json()) as Carrier[]);
  }, [apiKey, authChecked]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save(c: Carrier) {
    setError(null);
    const res = await fetch(`${API_URL}/carriers`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(c),
    });
    if (!res.ok) {
      const msg = `Save failed: ${res.status} ${await res.text()}`;
      setError(msg);
      toast.push(msg, "error");
      return;
    }
    setEditing(null);
    toast.push(`Saved carrier ${c.name}`, "success");
    reload();
  }

  async function importCsv(file: File) {
    setError(null);
    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setError(`Could not read file: ${String(e)}`);
      return;
    }
    let rows: Carrier[];
    try {
      rows = parseCsvCarriers(text);
    } catch (e) {
      setError(`CSV parse error: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (rows.length === 0) {
      setError("No data rows found in CSV.");
      return;
    }
    const res = await fetch(`${API_URL}/carriers/bulk`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      setError(`Import failed: ${res.status} ${await res.text()}`);
      return;
    }
    const body = await res.json();
    setError(
      `✓ Imported ${body.created} new, updated ${body.updated}` +
        (body.failed?.length ? `, ${body.failed.length} failed` : ""),
    );
    reload();
  }

  async function remove(carrier_id: string) {
    if (!confirm(`Delete ${carrier_id}? This can't be undone.`)) return;
    const res = await fetch(
      `${API_URL}/carriers/${encodeURIComponent(carrier_id)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(apiKey),
      },
    );
    if (!res.ok) {
      const msg = `Delete failed: ${res.status} ${await res.text()}`;
      setError(msg);
      toast.push(msg, "error");
      return;
    }
    toast.push(`Removed ${carrier_id}`, "success");
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
          title="Carrier directory"
          subtitle="Add the carriers you actually quote with. Each rule defines an appetite slice (NAICS prefix, states, lines, revenue band)."
          rightSlot={<><Link
            href="/app"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            ← Back to triage
          </Link>
          <label className="cursor-pointer rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  importCsv(f);
                  e.target.value = ""; // allow re-uploading the same file
                }
              }}
            />
          </label>
          <button
            onClick={() => setEditing(blankCarrier())}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400"
          >
            + New carrier
          </button></>}
        />

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <details className="mb-6 rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-300">
          CSV format
        </summary>
        <p className="mt-2 leading-relaxed">
          One carrier per row, comma-separated. Header line:
        </p>
        <pre className="mt-2 overflow-auto rounded border border-slate-800 bg-slate-900 p-2 font-mono text-[11px]">
          {`carrier_id,name,submission_email,typical_quote_back_days,naics_prefixes,states_in,states_out,lines,revenue_min,revenue_max,notes`}
        </pre>
        <p className="mt-2">
          Use semicolons (
          <code className="text-slate-200">;</code>) to separate multiple
          values inside a list field - e.g.{" "}
          <code className="text-slate-200">238;236</code> for NAICS prefixes,{" "}
          <code className="text-slate-200">general_liability;commercial_auto</code>{" "}
          for lines. Existing carriers (matched on carrier_id) are
          overwritten.
        </p>
      </details>

      {error && (
        <div className="mb-6 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {editing && (
        <CarrierEditor
          initial={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="space-y-3">
        {carriers.map((c) => (
          <li
            key={c.carrier_id}
            className="rounded-md border border-slate-800 bg-slate-950 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">
                  {c.name}{" "}
                  <span className="text-xs text-slate-500">{c.carrier_id}</span>
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {c.submission_email} · quotes back ~
                  {c.typical_quote_back_days}d
                </p>
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button
                  onClick={() => setEditing(c)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(c.carrier_id)}
                  className="rounded-md border border-red-800 px-2 py-1 text-red-300 hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-400">
              {c.appetite.map((r, i) => (
                <div
                  key={i}
                  className="rounded border border-slate-800 bg-slate-900/40 p-2"
                >
                  NAICS{" "}
                  <span className="text-slate-200">
                    {r.naics_prefixes.join(", ") || "-"}
                  </span>{" "}
                  · Lines{" "}
                  <span className="text-slate-200">
                    {r.lines.join(", ")}
                  </span>{" "}
                  · States{" "}
                  <span className="text-slate-200">
                    {r.states_in.length ? r.states_in.join(", ") : "any"}
                  </span>
                  {r.states_out.length > 0 && (
                    <>
                      {" "}
                      · Excl{" "}
                      <span className="text-rose-400">
                        {r.states_out.join(", ")}
                      </span>
                    </>
                  )}
                  {(r.revenue_min || r.revenue_max) && (
                    <>
                      {" "}
                      · Rev{" "}
                      <span className="text-slate-200">
                        {fmtRev(r.revenue_min)}-{fmtRev(r.revenue_max)}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {carriers.length === 0 && !editing && (
        <p className="rounded-md border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
          No carriers yet. Click <strong>+ New carrier</strong> to add one.
        </p>
      )}
      </div>
    </main>
  );
}

function fmtRev(v?: string): string {
  if (!v) return "any";
  const n = Number(v);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function blankCarrier(): Carrier {
  return {
    carrier_id: "",
    name: "",
    submission_email: "",
    underwriter_name: null,
    typical_quote_back_days: 5,
    notes: null,
    appetite: [
      {
        naics_prefixes: [],
        states_in: [],
        states_out: [],
        lines: [],
        revenue_min: undefined,
        revenue_max: undefined,
        notes: null,
      },
    ],
  };
}

function CarrierEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Carrier;
  onSave: (c: Carrier) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Carrier>(initial);

  function setRule(i: number, patch: Partial<CarrierAppetiteRule>) {
    setForm({
      ...form,
      appetite: form.appetite.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    });
  }

  function addRule() {
    setForm({
      ...form,
      appetite: [
        ...form.appetite,
        {
          naics_prefixes: [],
          states_in: [],
          states_out: [],
          lines: [],
          revenue_min: undefined,
          revenue_max: undefined,
          notes: null,
        },
      ],
    });
  }

  function dropRule(i: number) {
    setForm({
      ...form,
      appetite: form.appetite.filter((_, idx) => idx !== i),
    });
  }

  return (
    <div className="mb-8 rounded-md border border-emerald-700 bg-emerald-500/5 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-300">
        {initial.carrier_id ? "Edit carrier" : "New carrier"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Carrier ID (slug, lowercase, _)">
          <input
            value={form.carrier_id}
            onChange={(e) => setForm({ ...form, carrier_id: e.target.value })}
            disabled={Boolean(initial.carrier_id)}
            placeholder="atlas_specialty"
            className={inputClass}
          />
        </Field>
        <Field label="Display name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Atlas Specialty E&S"
            className={inputClass}
          />
        </Field>
        <Field label="Submission email">
          <input
            value={form.submission_email}
            onChange={(e) =>
              setForm({ ...form, submission_email: e.target.value })
            }
            placeholder="newbiz@atlas.example"
            className={inputClass}
          />
        </Field>
        <Field label="Underwriter contact (optional)">
          <input
            value={form.underwriter_name ?? ""}
            onChange={(e) =>
              setForm({ ...form, underwriter_name: e.target.value || null })
            }
            placeholder="Janet Wu"
            className={inputClass}
          />
        </Field>
        <Field label="Typical quote-back (days)">
          <input
            type="number"
            min={1}
            max={30}
            value={form.typical_quote_back_days}
            onChange={(e) =>
              setForm({
                ...form,
                typical_quote_back_days: parseInt(e.target.value, 10) || 5,
              })
            }
            className={inputClass}
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            value={form.notes ?? ""}
            onChange={(e) =>
              setForm({ ...form, notes: e.target.value || null })
            }
            placeholder="Strong on artisan contractors in southern states"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Appetite rules ({form.appetite.length})
          </h3>
          <button
            onClick={addRule}
            className="text-xs text-emerald-400 hover:underline"
          >
            + Add rule
          </button>
        </div>
        {form.appetite.map((r, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-md border border-slate-800 bg-slate-950 p-4 sm:grid-cols-2"
          >
            <Field label="NAICS prefixes (comma-sep)">
              <input
                value={r.naics_prefixes.join(",")}
                onChange={(e) =>
                  setRule(i, {
                    naics_prefixes: splitList(e.target.value),
                  })
                }
                placeholder="238, 236"
                className={inputClass}
              />
            </Field>
            <Field label="Lines (comma-sep)">
              <input
                value={r.lines.join(",")}
                onChange={(e) =>
                  setRule(i, { lines: splitList(e.target.value) })
                }
                placeholder="general_liability, commercial_auto"
                className={inputClass}
              />
            </Field>
            <Field label="States allowed (comma-sep, blank = any)">
              <input
                value={r.states_in.join(",")}
                onChange={(e) =>
                  setRule(i, { states_in: splitList(e.target.value).map(upper) })
                }
                placeholder="TX, FL, GA"
                className={inputClass}
              />
            </Field>
            <Field label="States excluded">
              <input
                value={r.states_out.join(",")}
                onChange={(e) =>
                  setRule(i, { states_out: splitList(e.target.value).map(upper) })
                }
                placeholder="NY, CA"
                className={inputClass}
              />
            </Field>
            <Field label="Min revenue (USD)">
              <input
                value={r.revenue_min ?? ""}
                onChange={(e) =>
                  setRule(i, { revenue_min: e.target.value || undefined })
                }
                placeholder="500000"
                className={inputClass}
              />
            </Field>
            <Field label="Max revenue (USD)">
              <input
                value={r.revenue_max ?? ""}
                onChange={(e) =>
                  setRule(i, { revenue_max: e.target.value || undefined })
                }
                placeholder="15000000"
                className={inputClass}
              />
            </Field>
            <Field label="Rule notes (optional)" wide>
              <input
                value={r.notes ?? ""}
                onChange={(e) =>
                  setRule(i, { notes: e.target.value || null })
                }
                placeholder="Artisan contractors only - no new construction GCs."
                className={inputClass}
              />
            </Field>
            {form.appetite.length > 1 && (
              <div className="sm:col-span-2 flex justify-end">
                <button
                  onClick={() => dropRule(i)}
                  className="text-xs text-rose-300 hover:underline"
                >
                  Remove this rule
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={!form.carrier_id || !form.name || !form.submission_email}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          Save carrier
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50";

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "sm:col-span-2" : "")}>
      <span className="text-xs uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function upper(s: string): string {
  return s.toUpperCase();
}

/** Minimal CSV → Carrier[] parser. Handles double-quoted fields with
 *  embedded commas; semicolons split list-typed fields (NAICS, states,
 *  lines). Strict on header presence - throws if the required carrier_id
 *  column is missing. */
function parseCsvCarriers(text: string): Carrier[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCsvRow(lines[0]).map((h) => h.toLowerCase());
  if (!header.includes("carrier_id")) {
    throw new Error("Header row missing required 'carrier_id' column");
  }

  function get(row: string[], col: string): string {
    const i = header.indexOf(col);
    return i >= 0 ? (row[i] ?? "") : "";
  }

  const carriers: Carrier[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvRow(lines[i]);
    const cid = get(row, "carrier_id").trim();
    if (!cid) continue;
    carriers.push({
      carrier_id: cid,
      name: get(row, "name").trim() || cid,
      submission_email: get(row, "submission_email").trim(),
      underwriter_name: get(row, "underwriter_name").trim() || null,
      typical_quote_back_days:
        parseInt(get(row, "typical_quote_back_days"), 10) || 5,
      notes: get(row, "notes").trim() || null,
      appetite: [
        {
          naics_prefixes: splitSemis(get(row, "naics_prefixes")),
          states_in: splitSemis(get(row, "states_in")).map((s) =>
            s.toUpperCase(),
          ),
          states_out: splitSemis(get(row, "states_out")).map((s) =>
            s.toUpperCase(),
          ),
          lines: splitSemis(get(row, "lines")),
          revenue_min: get(row, "revenue_min").trim() || undefined,
          revenue_max: get(row, "revenue_max").trim() || undefined,
        },
      ],
    });
  }
  return carriers;
}

function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function splitSemis(v: string): string[] {
  return v
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
