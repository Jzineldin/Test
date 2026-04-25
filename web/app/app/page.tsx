"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACME_PLUMBING_SUBMISSION } from "@/lib/sample";
import type {
  BillingUsage,
  ReportPayload,
  TriageResult,
  TriageRunDetail,
  TriageRunSummary,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";
const DEFAULT_DEMO_KEY = "demo-key-change-in-prod";
type Mode = "pdf" | "json";

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("pdf");
  const [submissionJson, setSubmissionJson] = useState(
    JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2),
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<TriageRunSummary[]>([]);
  const [apiKey, setApiKey] = useState<string>("");
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);

  // Hydrate API key from localStorage; default to demo key on first visit.
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE);
    setApiKey(stored ?? DEFAULT_DEMO_KEY);
  }, []);

  function persistKey(key: string) {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE, key);
  }

  const loadHistory = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_URL}/history?limit=20`, {
        headers: authHeaders(apiKey),
      });
      if (res.ok) setHistory((await res.json()) as TriageRunSummary[]);
    } catch {
      /* history is best-effort; ignore failures */
    }
  }, [apiKey]);

  const loadUsage = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_URL}/billing/usage`, {
        headers: authHeaders(apiKey),
      });
      if (res.ok) setUsage((await res.json()) as BillingUsage);
    } catch {
      /* usage is best-effort */
    }
  }, [apiKey]);

  const loadReport = useCallback(async () => {
    if (!apiKey) return;
    try {
      const res = await fetch(`${API_URL}/reports/summary`, {
        headers: authHeaders(apiKey),
      });
      if (res.ok) setReport((await res.json()) as ReportPayload);
    } catch {
      /* report is best-effort */
    }
  }, [apiKey]);

  useEffect(() => {
    loadHistory();
    loadUsage();
    loadReport();
  }, [loadHistory, loadUsage, loadReport]);

  async function runTriage() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = mode === "pdf" ? await uploadPdf() : await postJson();
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      setResult((await res.json()) as TriageResult);
      loadHistory();
      loadUsage();
      loadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sendDraft(draftId: number) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/drafts/${draftId}/send`, {
        method: "POST",
        headers: authHeaders(apiKey),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      const updated = (await res.json()) as { id: number; sent_at: string | null };
      // Patch the local result state so the button flips to "Sent" without a refetch.
      setResult((prev) =>
        prev
          ? {
              ...prev,
              drafted_emails: prev.drafted_emails.map((d) =>
                d.id === updated.id ? { ...d, sent_at: updated.sent_at } : d,
              ),
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function openHistoryRun(runId: number) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/history/${runId}`, {
        headers: authHeaders(apiKey),
      });
      if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
      const detail = (await res.json()) as TriageRunDetail;
      setResult(detail.result);
      setSubmissionJson(JSON.stringify(detail.submission_json, null, 2));
      setMode("json");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function uploadPdf(): Promise<Response> {
    if (!pdfFile) throw new Error("Drop or pick an ACORD PDF first.");
    const form = new FormData();
    form.append("file", pdfFile);
    return fetch(`${API_URL}/triage/upload`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: form,
    });
  }

  async function postJson(): Promise<Response> {
    const parsed = JSON.parse(submissionJson);
    return fetch(`${API_URL}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(parsed),
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submission Triage</h1>
          <p className="mt-1 text-sm text-slate-400">
            Wholesale broker workflow — ACORD in, carrier-ready submissions out.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {usage && <UsageBadge usage={usage} apiKey={apiKey} />}
          <ApiKeyInput value={apiKey} onChange={persistKey} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
        <div>
          <ModeTabs mode={mode} onChange={setMode} />
          {mode === "pdf" ? (
            <PdfDropzone file={pdfFile} onChange={setPdfFile} />
          ) : (
            <JsonEditor value={submissionJson} onChange={setSubmissionJson} />
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={runTriage}
              disabled={loading || (mode === "pdf" && !pdfFile)}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Triaging…" : "Run triage"}
            </button>
            {mode === "json" && (
              <button
                onClick={() =>
                  setSubmissionJson(JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2))
                }
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              >
                Reset to sample
              </button>
            )}
            {mode === "pdf" && pdfFile && (
              <button
                onClick={() => setPdfFile(null)}
                className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              >
                Clear file
              </button>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            POSTs to{" "}
            <code>{API_URL}{mode === "pdf" ? "/triage/upload" : "/triage"}</code>.
            {mode === "pdf" && (
              <>
                {" "}PDF parsing requires GCP Document AI env vars on the API
                — without them, the endpoint returns 503.
              </>
            )}
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
              <DocAiGaps result={result} />
              <Matches matches={result.matches} summary={result.summary} />
              <DraftedEmails drafts={result.drafted_emails} onSend={sendDraft} />
            </>
          )}
        </div>
      </section>

      {report && <ReportStrip report={report} />}
      <History history={history} onOpen={openHistoryRun} />
    </main>
  );
}

function ReportStrip({ report }: { report: ReportPayload }) {
  const stats: { label: string; value: string }[] = [
    { label: "Submissions this period", value: String(report.submissions_triaged) },
    { label: "Drafts sent", value: String(report.drafts_sent) },
    {
      label: "Quote-back rate",
      value: `${(report.quote_back_rate * 100).toFixed(0)}%`,
    },
    {
      label: "Bind rate",
      value: `${(report.bind_rate * 100).toFixed(0)}%`,
    },
    {
      label: "Avg time-to-quote",
      value: report.avg_hours_to_quote != null
        ? `${report.avg_hours_to_quote.toFixed(1)}h`
        : "—",
    },
    {
      label: "Bound premium",
      value: report.bound_premium_dollars > 0
        ? `$${report.bound_premium_dollars.toLocaleString()}`
        : "—",
    },
  ];
  return (
    <section className="mt-12 border-t border-slate-800 pt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        This period
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-md border border-slate-800 bg-slate-950 p-3"
          >
            <p className="text-xs uppercase tracking-widest text-slate-500">
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function History({
  history,
  onOpen,
}: {
  history: TriageRunSummary[];
  onOpen: (id: number) => void;
}) {
  if (history.length === 0) return null;
  return (
    <section className="mt-12 border-t border-slate-800 pt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Recent triage runs ({history.length})
      </h2>
      <div className="overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Insured</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 text-right font-medium">Matches</th>
              <th className="px-3 py-2 text-right font-medium">Drafts</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-400">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-medium text-slate-200">
                  {row.insured_name}
                </td>
                <td className="px-3 py-2 text-slate-300">{row.primary_state}</td>
                <td className="px-3 py-2 text-right text-slate-300">
                  {row.match_count}
                </td>
                <td className="px-3 py-2 text-right text-slate-300">
                  {row.draft_count}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => onOpen(row.id)}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsageBadge({
  usage,
  apiKey,
}: {
  usage: BillingUsage;
  apiKey: string;
}) {
  async function upgrade() {
    const res = await fetch(`${API_URL}/billing/checkout-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify({
        price_id: "price_demo",
        success_url: `${window.location.origin}/?upgraded=1`,
        cancel_url: window.location.origin,
      }),
    });
    if (!res.ok) {
      alert(`Could not create checkout link: ${await res.text()}`);
      return;
    }
    const body = (await res.json()) as { url: string };
    window.open(body.url, "_blank");
  }

  const pct = Math.min(
    100,
    Math.round((usage.submissions_this_period / Math.max(1, usage.monthly_submission_quota)) * 100),
  );
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-800 px-3 py-1.5 text-xs">
      <div>
        <div className="text-slate-400">
          {usage.plan} ·{" "}
          <span className={usage.over_quota ? "text-amber-400" : "text-slate-200"}>
            {usage.submissions_this_period}/{usage.monthly_submission_quota}
          </span>
        </div>
        <div className="mt-1 h-1 w-32 overflow-hidden rounded bg-slate-800">
          <div
            className={
              "h-full " + (usage.over_quota ? "bg-amber-500" : "bg-emerald-500")
            }
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {usage.plan === "trial" && (
        <button
          onClick={upgrade}
          className="rounded-md bg-emerald-500 px-2 py-1 font-medium text-slate-950 hover:bg-emerald-400"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

function ApiKeyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="uppercase tracking-widest">API key</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder={DEFAULT_DEMO_KEY}
        className="w-56 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mb-3 inline-flex rounded-md border border-slate-800 p-1 text-xs">
      {(["pdf", "json"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={
            "rounded px-3 py-1.5 font-medium transition-colors " +
            (mode === m
              ? "bg-emerald-500 text-slate-950"
              : "text-slate-400 hover:text-slate-200")
          }
        >
          {m === "pdf" ? "Upload ACORD PDF" : "Paste JSON"}
        </button>
      ))}
    </div>
  );
}

function PdfDropzone({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      alert("Please drop a PDF file (ACORD 125 / 126 / 140).");
      return;
    }
    onChange(f);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={
        "flex h-[480px] cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 text-center transition-colors " +
        (dragOver
          ? "border-emerald-500 bg-emerald-500/5"
          : file
          ? "border-emerald-700 bg-slate-950"
          : "border-slate-800 bg-slate-950 hover:border-slate-700")
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {file ? (
        <>
          <p className="text-sm font-medium text-emerald-400">✓ {file.name}</p>
          <p className="mt-1 text-xs text-slate-400">
            {(file.size / 1024).toFixed(1)} KB · ready to triage
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-300">
            Drop an ACORD PDF here
          </p>
          <p className="mt-1 text-xs text-slate-500">
            or click to pick a file (ACORD 125 / 126 / 140)
          </p>
        </>
      )}
    </label>
  );
}

function JsonEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      className="h-[480px] w-full rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
    />
  );
}

function DocAiGaps({ result }: { result: TriageResult }) {
  // Surfaced via extra.docai_gaps; the API doesn't currently echo extra back
  // through the TriageResult model, so this is a no-op until we extend it.
  // Placeholder retained so the dashboard structure is in place.
  void result;
  return null;
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

function DraftedEmails({
  drafts,
  onSend,
}: {
  drafts: TriageResult["drafted_emails"];
  onSend: (id: number) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Drafted carrier emails ({drafts.length})
      </h2>
      <div className="space-y-4">
        {drafts.map((d) => {
          const isSent = Boolean(d.sent_at);
          return (
            <article
              key={d.carrier_id}
              className="rounded-md border border-slate-800 bg-slate-950 p-4"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>To: <span className="text-slate-200">{d.to}</span></span>
                <span>Attach: {d.attachments.join(", ")}</span>
                {isSent && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
                    ✓ sent {new Date(d.sent_at!).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="mb-3 text-sm font-semibold text-slate-100">{d.subject}</p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                {d.body}
              </pre>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => d.id && onSend(d.id)}
                  disabled={!d.id || isSent}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed " +
                    (isSent
                      ? "border border-emerald-700 bg-transparent text-emerald-400"
                      : "bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50")
                  }
                >
                  {isSent ? "Sent" : "Send to carrier"}
                </button>
                <button
                  disabled
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  Edit draft
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
