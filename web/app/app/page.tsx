"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACME_PLUMBING_SUBMISSION } from "@/lib/sample";
import type {
  BillingUsage,
  CarrierStats,
  DigestItem,
  ReportPayload,
  TriageResult,
  TriageRunDetail,
  TriageRunSummary,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STRIPE_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ?? "price_demo";
const API_KEY_STORAGE = "submission-triage-api-key";
type Mode = "pdf" | "json";

type Me = {
  org_id: number;
  org_name: string;
  slug: string;
  plan: string;
  monthly_submission_quota: number;
  user_role?: "admin" | "csr" | null;
};

/** Bearer header for the optional api-key path. Always co-fired with
 *  `credentials: "include"` so the cookie session is also sent. */
function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function requestInit(apiKey: string, base: RequestInit = {}): RequestInit {
  return { ...base, credentials: "include", headers: { ...authHeaders(apiKey), ...(base.headers as Record<string, string>) } };
}

export default function Home() {
  const router = useRouter();
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
  const [me, setMe] = useState<Me | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [carrierStats, setCarrierStats] = useState<CarrierStats[]>([]);
  const [historyQuery, setHistoryQuery] = useState({ insured: "", state: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [digest, setDigest] = useState<DigestItem[]>([]);

  // Hydrate any manually-set api key (legacy / dev users).
  useEffect(() => {
    setApiKey(localStorage.getItem(API_KEY_STORAGE) ?? "");
  }, []);

  // Gate the page behind /me. Cookie OR api key both unlock it; failing
  // both we punt to /login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/me`, requestInit(apiKey));
        if (cancelled) return;
        if (res.ok) {
          setMe((await res.json()) as Me);
        } else if (res.status === 401) {
          router.replace("/login");
          return;
        }
      } catch {
        /* network blip - leave authChecked false so we retry on rerender */
        return;
      }
      setAuthChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, router]);

  function persistKey(key: string) {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE, key);
  }

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    localStorage.removeItem(API_KEY_STORAGE);
    router.replace("/login");
  }

  const loadHistory = useCallback(async () => {
    if (!authChecked) return;
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (historyQuery.insured) params.set("insured", historyQuery.insured);
      if (historyQuery.state) params.set("state", historyQuery.state);
      const res = await fetch(`${API_URL}/history?${params}`, {
        credentials: "include",
      headers: authHeaders(apiKey),
      });
      if (res.ok) setHistory((await res.json()) as TriageRunSummary[]);
    } catch {
      /* history is best-effort; ignore failures */
    }
  }, [apiKey, historyQuery, authChecked]);

  const loadUsage = useCallback(async () => {
    if (!authChecked) return;
    try {
      const res = await fetch(`${API_URL}/billing/usage`, {
        credentials: "include",
      headers: authHeaders(apiKey),
      });
      if (res.ok) setUsage((await res.json()) as BillingUsage);
    } catch {
      /* usage is best-effort */
    }
  }, [apiKey, authChecked]);

  const loadReport = useCallback(async () => {
    if (!authChecked) return;
    try {
      const res = await fetch(`${API_URL}/reports/summary`, {
        credentials: "include",
      headers: authHeaders(apiKey),
      });
      if (res.ok) setReport((await res.json()) as ReportPayload);
    } catch {
      /* report is best-effort */
    }
  }, [apiKey, authChecked]);

  const loadDigest = useCallback(async () => {
    if (!authChecked) return;
    try {
      const res = await fetch(`${API_URL}/reports/digest`, {
        credentials: "include",
      headers: authHeaders(apiKey),
      });
      if (res.ok) setDigest((await res.json()) as DigestItem[]);
    } catch {
      /* digest is best-effort */
    }
  }, [apiKey, authChecked]);

  const loadCarrierStats = useCallback(async () => {
    if (!authChecked) return;
    try {
      const res = await fetch(`${API_URL}/reports/by-carrier`, {
        credentials: "include",
        headers: authHeaders(apiKey),
      });
      if (res.ok) setCarrierStats((await res.json()) as CarrierStats[]);
    } catch {
      /* best-effort */
    }
  }, [apiKey, authChecked]);

  useEffect(() => {
    loadHistory();
    loadUsage();
    loadReport();
    loadDigest();
    loadCarrierStats();
  }, [loadHistory, loadUsage, loadReport, loadDigest, loadCarrierStats]);

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
        credentials: "include",
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

  async function setOutcome(
    draftId: number,
    outcome: "bound" | "declined",
    bound_premium_cents?: number,
  ) {
    const body: Record<string, unknown> = { outcome };
    if (bound_premium_cents != null) body.bound_premium_cents = bound_premium_cents;
    const res = await fetch(`${API_URL}/drafts/${draftId}/outcome`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(`API ${res.status}: ${await res.text()}`);
      return;
    }
    loadReport();
  }

  async function openHistoryRun(runId: number) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/history/${runId}`, {
        credentials: "include",
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
      credentials: "include",
      headers: authHeaders(apiKey),
      body: form,
    });
  }

  async function postJson(): Promise<Response> {
    const parsed = JSON.parse(submissionJson);
    return fetch(`${API_URL}/triage`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(parsed),
    });
  }

  if (!authChecked) {
    return <DashboardSkeleton />;
  }

  // API-key auth has no user context - treat as admin for the surfaces.
  // Cookie-authed users are gated by their actual role.
  const isAdmin = !me?.user_role || me.user_role === "admin";

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {me?.org_name ?? "AppetiteMatch"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Wholesale broker workflow - ACORD in, carrier-ready submissions out.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <HealthPill />
          {usage && <UsageBadge usage={usage} apiKey={apiKey} />}
          {isAdmin && (
            <Link
              href="/app/carriers"
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
            >
              Carriers
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/app/users"
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
            >
              Team
            </Link>
          )}
          <Link
            href="/app/audit"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Audit
          </Link>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Settings
          </button>
          <button
            onClick={logout}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Sign out
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel apiKey={apiKey} onClose={() => setShowSettings(false)} />
      )}

      {history.length === 0 && !result && <WelcomeBanner />}

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
                - without them, the endpoint returns 503.
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
            <div className="flex h-full min-h-[480px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-slate-800 px-8 text-center text-sm text-slate-500">
              <p className="text-slate-300">First time? Try a sample.</p>
              <ol className="space-y-1 text-xs leading-relaxed text-slate-500">
                <li>
                  1. Click <span className="text-slate-300">Paste JSON</span> ·
                  then <span className="text-slate-300">Reset to sample</span>
                </li>
                <li>
                  2. Hit <span className="text-slate-300">Run triage</span> -
                  Acme Plumbing, TX gets scored against 4 carriers
                </li>
                <li>3. Review matches → click "Send" on the top draft</li>
              </ol>
              <p className="text-xs text-slate-600">
                Or drop a real ACORD PDF on the left to use yours.
              </p>
            </div>
          )}

          {result && (
            <>
              <DocAiGaps result={result} />
              <Matches matches={result.matches} summary={result.summary} />
              <DraftedEmails
                drafts={result.drafted_emails}
                onSend={sendDraft}
                onOutcome={setOutcome}
              />
            </>
          )}
        </div>
      </section>

      {report && <ReportStrip report={report} />}
      {carrierStats.length > 0 && <CarrierStatsTable stats={carrierStats} />}
      {digest.length > 0 && <DigestPanel items={digest} />}
      <History
        history={history}
        onOpen={openHistoryRun}
        apiKey={apiKey}
        query={historyQuery}
        onQueryChange={setHistoryQuery}
      />
    </main>
  );
}

function SettingsPanel({
  apiKey,
  onClose,
}: {
  apiKey: string;
  onClose: () => void;
}) {
  const [me, setMe] = useState<{
    name: string;
    notification_webhook_url: string | null;
    forward_inbox_address: string | null;
    email_signature: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/me`, { headers: authHeaders(apiKey), credentials: "include" })
      .then((r) => r.json())
      .then((b) => setMe({
        name: b.org_name,
        notification_webhook_url: b.notification_webhook_url,
        forward_inbox_address: b.forward_inbox_address,
        email_signature: b.email_signature,
      }));
  }, [apiKey]);

  async function save() {
    if (!me) return;
    setSaving(true);
    const r = await fetch(`${API_URL}/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(me),
    });
    setSaving(false);
    if (r.ok) setSavedAt(new Date().toLocaleTimeString());
  }

  if (!me) return null;
  return (
    <section className="mb-8 rounded-md border border-slate-800 bg-slate-950 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Org settings
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Close
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="Display name"
          value={me.name}
          onChange={(v) => setMe({ ...me, name: v })}
        />
        <Field
          label="Slack/Discord/MS Teams webhook URL"
          value={me.notification_webhook_url ?? ""}
          onChange={(v) =>
            setMe({ ...me, notification_webhook_url: v || null })
          }
          placeholder="https://hooks.slack.com/services/..."
        />
        <Field
          label="Forward-inbox alias (for SES Inbound)"
          value={me.forward_inbox_address ?? ""}
          onChange={(v) =>
            setMe({ ...me, forward_inbox_address: v || null })
          }
          placeholder="triage+yourorg@yourdomain.com"
        />
      </div>
      <div className="mt-4">
        <label className="block text-xs uppercase tracking-widest text-slate-500">
          Email signature (used on every drafted carrier email)
        </label>
        <textarea
          rows={6}
          value={me.email_signature ?? ""}
          onChange={(e) =>
            setMe({ ...me, email_signature: e.target.value || null })
          }
          placeholder={
            "Pat Reyes\nSenior Wholesale Broker\nTale Forge Specialty\n(555) 123-4567 · pat@taleforge.example"
          }
          className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt && <span className="text-xs text-emerald-400">✓ saved {savedAt}</span>}
      </div>

      <ApiKeyManager apiKey={apiKey} />
      <BillingPortalButton apiKey={apiKey} />
    </section>
  );
}

function BillingPortalButton({ apiKey }: { apiKey: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await fetch(`${API_URL}/billing/portal-link`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify({ return_url: window.location.href }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const body = (await res.json()) as { url: string };
    window.open(body.url, "_blank");
  }

  return (
    <div className="mt-6 rounded-md border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Billing
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Manage your subscription, update card, view invoices on Stripe's
        hosted portal.
      </p>
      <button
        onClick={open}
        disabled={busy}
        className="mt-3 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Manage subscription →"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-rose-300">{error}</p>
      )}
    </div>
  );
}

function ApiKeyManager({ apiKey }: { apiKey: string }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  async function reveal() {
    const r = await fetch(`${API_URL}/me/api-key`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (r.ok) setRevealed((await r.json()).api_key as string);
  }

  async function rotate() {
    if (
      !confirm(
        "Rotating invalidates the current key immediately. Anything using it (curl, Zapier, AMS integrations) will start failing until you paste in the new key. Continue?",
      )
    ) {
      return;
    }
    setRotating(true);
    const r = await fetch(`${API_URL}/me/api-key/rotate`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    setRotating(false);
    if (r.ok) setRevealed((await r.json()).api_key as string);
  }

  return (
    <div className="mt-8 rounded-md border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        API key
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Bearer token for programmatic access. Use it as{" "}
        <code className="text-slate-300">Authorization: Bearer &lt;key&gt;</code>{" "}
        when calling the API directly.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {revealed ? (
          <code className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 break-all">
            {revealed}
          </code>
        ) : (
          <button
            onClick={reveal}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Show key
          </button>
        )}
        <button
          onClick={rotate}
          disabled={rotating}
          className="rounded-md border border-rose-800 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
        >
          {rotating ? "Rotating…" : "Rotate"}
        </button>
        {revealed && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(revealed);
            }}
            className="text-xs text-emerald-400 hover:underline"
          >
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
      />
    </label>
  );
}

function DigestPanel({ items }: { items: DigestItem[] }) {
  return (
    <section className="mt-12 border-t border-slate-800 pt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Recent activity ({items.length})
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.draft_id}-${item.when}`}
            className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-950 p-3 text-sm"
          >
            <span
              className={
                "mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium " +
                (item.kind === "bound"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : item.kind === "declined"
                  ? "bg-slate-700/40 text-slate-300"
                  : "bg-amber-500/15 text-amber-400")
              }
            >
              {item.kind}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-slate-200">
                <span className="font-medium">{item.insured_name}</span>{" "}
                <span className="text-slate-500">·</span>{" "}
                <span className="text-slate-400">{item.carrier_id}</span>
              </p>
              <p className="truncate text-xs text-slate-500">{item.summary}</p>
            </div>
            <span className="whitespace-nowrap text-xs text-slate-500">
              {new Date(item.when).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
        : "-",
    },
    {
      label: "Bound premium",
      value: report.bound_premium_dollars > 0
        ? `$${report.bound_premium_dollars.toLocaleString()}`
        : "-",
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
  apiKey,
  query,
  onQueryChange,
}: {
  history: TriageRunSummary[];
  onOpen: (id: number) => void;
  apiKey: string;
  query: { insured: string; state: string };
  onQueryChange: (q: { insured: string; state: string }) => void;
}) {
  function downloadCsv() {
    // Trigger an authed download via a temporary anchor + fetch.
    fetch(`${API_URL}/history/export.csv`, { headers: authHeaders(apiKey), credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "triage-history.csv";
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <section className="mt-12 border-t border-slate-800 pt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Recent triage runs ({history.length})
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query.insured}
            onChange={(e) => onQueryChange({ ...query, insured: e.target.value })}
            placeholder="Filter by insured…"
            className="w-56 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <input
            value={query.state}
            onChange={(e) =>
              onQueryChange({ ...query, state: e.target.value.toUpperCase().slice(0, 2) })
            }
            placeholder="ST"
            className="w-16 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-center text-xs uppercase text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={downloadCsv}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
          >
            Export CSV
          </button>
        </div>
      </div>
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
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify({
        price_id: STRIPE_PRICE_ID,
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
        placeholder="paste a key (or leave blank for cookie auth)"
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

function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <section className="mb-8 rounded-md border border-emerald-700 bg-emerald-500/5 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
          Welcome - let's get you running
        </h2>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Dismiss
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-300">
        Your account ships with four sample carriers (Atlas, Keystone,
        Redwood, Great Basin) so the demo flow works zero-click. Take any
        of these next steps when you're ready:
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          {
            n: "1",
            title: "Run a sample triage",
            body: "Click Paste JSON → Reset to sample → Run triage. See how Atlas + Keystone score on the Acme Plumbing TX submission.",
          },
          {
            n: "2",
            title: "Add your real carriers",
            body: "Go to Carriers and add the markets you actually quote with. NAICS prefixes, states, lines, revenue band.",
            href: "/app/carriers",
          },
          {
            n: "3",
            title: "Invite your CSRs",
            body: "Add teammates from the Team page so they can run triages under the same org.",
            href: "/app/users",
          },
        ].map((s) => (
          <li
            key={s.n}
            className="rounded-md border border-slate-800 bg-slate-950 p-3"
          >
            <p className="text-xs uppercase tracking-widest text-emerald-400">
              Step {s.n}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              {s.body}
            </p>
            {s.href && (
              <Link
                href={s.href}
                className="mt-2 inline-block text-xs text-emerald-400 hover:underline"
              >
                Go →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-slate-800" />
          <div className="h-3 w-72 animate-pulse rounded bg-slate-900" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-7 w-16 animate-pulse rounded bg-slate-900"
            />
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
        <div className="space-y-3">
          <div className="h-8 w-40 animate-pulse rounded bg-slate-900" />
          <div className="h-72 animate-pulse rounded-md bg-slate-900" />
          <div className="h-9 w-32 animate-pulse rounded bg-slate-800" />
        </div>
        <div className="h-[480px] animate-pulse rounded-md border border-dashed border-slate-800 bg-slate-950/50" />
      </div>
    </main>
  );
}

function HealthPill() {
  const [info, setInfo] = useState<{
    git_sha?: string;
    stripe?: string;
    ses?: string;
    docai?: string;
    llm?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/version`)
      .then((r) => r.ok ? r.json() : null)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info) return null;

  const subsystems = [
    { k: "llm", v: info.llm ?? "?" },
    { k: "ses", v: info.ses ?? "?" },
    { k: "docai", v: info.docai ?? "?" },
    { k: "stripe", v: info.stripe ?? "?" },
  ];
  const allLive = subsystems.every((s) => s.v !== "stub" && s.v !== "?");

  return (
    <div className="group relative">
      <span
        className={
          "inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] " +
          (allLive
            ? "border border-emerald-700/40 bg-emerald-500/10 text-emerald-300"
            : "border border-amber-700/40 bg-amber-500/10 text-amber-300")
        }
      >
        <span
          className={
            "size-1.5 rounded-full " +
            (allLive ? "bg-emerald-400" : "bg-amber-400")
          }
        />
        {allLive ? "All systems live" : "Some subsystems on stubs"}
      </span>
      <div className="invisible absolute right-0 top-full z-10 mt-2 w-72 rounded-md border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          build {info.git_sha ?? "dev"}
        </p>
        {subsystems.map((s) => (
          <p key={s.k} className="flex justify-between py-0.5">
            <span className="text-slate-500">{s.k}</span>
            <span
              className={
                s.v === "stub" || s.v === "?"
                  ? "text-amber-300"
                  : "text-emerald-300"
              }
            >
              {s.v}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

function CarrierStatsTable({ stats }: { stats: CarrierStats[] }) {
  return (
    <section className="mt-12 border-t border-slate-800 pt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Per-carrier performance - this period
      </h2>
      <div className="overflow-x-auto rounded-md border border-slate-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-900/40 text-xs uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Replied</th>
              <th className="px-4 py-3">Bound</th>
              <th className="px-4 py-3">Quote-back</th>
              <th className="px-4 py-3">Bind rate</th>
              <th className="px-4 py-3">Avg time-to-quote</th>
              <th className="px-4 py-3">Bound premium</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr
                key={s.carrier_id}
                className="border-t border-slate-900 text-slate-300"
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-100">
                  {s.carrier_id}
                </td>
                <td className="px-4 py-3">{s.drafts_sent}</td>
                <td className="px-4 py-3">{s.drafts_replied}</td>
                <td className="px-4 py-3 text-emerald-300">{s.drafts_bound}</td>
                <td className="px-4 py-3">
                  {s.drafts_sent ? `${(s.quote_back_rate * 100).toFixed(0)}%` : "-"}
                </td>
                <td className="px-4 py-3">
                  {s.drafts_replied ? `${(s.bind_rate * 100).toFixed(0)}%` : "-"}
                </td>
                <td className="px-4 py-3">
                  {s.avg_hours_to_quote != null
                    ? `${s.avg_hours_to_quote.toFixed(1)}h`
                    : "-"}
                </td>
                <td className="px-4 py-3 text-emerald-300">
                  {s.bound_premium_dollars > 0
                    ? `$${s.bound_premium_dollars.toLocaleString()}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DraftedEmails({
  drafts,
  onSend,
  onOutcome,
}: {
  drafts: TriageResult["drafted_emails"];
  onSend: (id: number) => void;
  onOutcome: (id: number, outcome: "bound" | "declined", premiumCents?: number) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
        Drafted carrier emails ({drafts.length})
      </h2>
      <div className="space-y-4">
        {drafts.map((d) => {
          const isSent = Boolean(d.sent_at);
          const hasReply = Boolean(d.quote_replied_at);
          const isBound = d.outcome === "bound";
          const isDeclined = d.outcome === "declined";
          return (
            <article
              key={d.carrier_id}
              className="rounded-md border border-slate-800 bg-slate-950 p-4"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>To: <span className="text-slate-200">{d.to}</span></span>
                {d.attachments.length > 0 && (
                  <span>Attach: {d.attachments.join(", ")}</span>
                )}
                {isSent && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
                    ✓ sent {new Date(d.sent_at!).toLocaleString()}
                  </span>
                )}
                {hasReply && (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">
                    ↩ replied {new Date(d.quote_replied_at!).toLocaleString()}
                  </span>
                )}
                {isBound && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
                    ★ BOUND
                    {d.bound_premium_cents != null &&
                      ` · $${(d.bound_premium_cents / 100).toLocaleString()}`}
                  </span>
                )}
                {isDeclined && (
                  <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-slate-400">
                    declined
                  </span>
                )}
              </div>
              <p className="mb-3 text-sm font-semibold text-slate-100">{d.subject}</p>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                {d.body}
              </pre>
              {hasReply && d.quote_reply_body && (
                <div className="mt-4 rounded-md border border-sky-800 bg-sky-500/5 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-300">
                    Carrier reply
                  </p>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">
                    {d.quote_reply_body}
                  </pre>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                {isSent && d.id && (
                  <>
                    <span className="ml-2 text-xs text-slate-500">Outcome:</span>
                    <button
                      onClick={() => {
                        const raw = prompt("Bound premium ($):");
                        if (raw == null) return;
                        const cents = Math.round(parseFloat(raw) * 100);
                        if (!Number.isFinite(cents)) return;
                        onOutcome(d.id!, "bound", cents);
                      }}
                      className="rounded-md border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                    >
                      Mark bound
                    </button>
                    <button
                      onClick={() => onOutcome(d.id!, "declined")}
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
                    >
                      Mark declined
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
