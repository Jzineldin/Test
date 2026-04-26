"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ACME_PLUMBING_SUBMISSION } from "@/lib/sample";
import { DashboardHeader } from "@/components/DashboardChrome";
import { useToast } from "@/components/Toast";
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
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("pdf");
  const [submissionJson, setSubmissionJson] = useState(
    JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2),
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
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
  const [historyQuery, setHistoryQuery] = useState({ insured: "", state: "", carrier_id: "" });
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

  const [historyLimit, setHistoryLimit] = useState(20);

  const loadHistory = useCallback(async () => {
    if (!authChecked) return;
    try {
      const params = new URLSearchParams({ limit: String(historyLimit) });
      if (historyQuery.insured) params.set("insured", historyQuery.insured);
      if (historyQuery.state) params.set("state", historyQuery.state);
      if (historyQuery.carrier_id) params.set("carrier_id", historyQuery.carrier_id);
      const res = await fetch(`${API_URL}/history?${params}`, {
        credentials: "include",
      headers: authHeaders(apiKey),
      });
      if (res.ok) setHistory((await res.json()) as TriageRunSummary[]);
    } catch {
      /* history is best-effort; ignore failures */
    }
  }, [apiKey, historyQuery, authChecked, historyLimit]);

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

  // Cmd/Ctrl+Enter from anywhere on the page triggers Run triage when ready.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const wantsRun =
        (e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey;
      if (!wantsRun) return;
      if (loading) return;
      if (mode === "pdf" && !pdfFile) return;
      e.preventDefault();
      runTriage();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      toast.push("Draft sent to carrier", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.push(msg, "error");
    }
  }

  async function editDraft(
    draftId: number,
    patch: { subject?: string; body?: string },
  ) {
    setError(null);
    const res = await fetch(`${API_URL}/drafts/${draftId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const msg = `Edit failed: ${res.status} ${await res.text()}`;
      setError(msg);
      toast.push(msg, "error");
      return;
    }
    const updated = (await res.json()) as {
      id: number; subject: string; body: string;
    };
    setResult((prev) =>
      prev
        ? {
            ...prev,
            drafted_emails: prev.drafted_emails.map((d) =>
              d.id === updated.id
                ? { ...d, subject: updated.subject, body: updated.body }
                : d,
            ),
          }
        : prev,
    );
    toast.push("Draft updated", "success");
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
      const msg = `API ${res.status}: ${await res.text()}`;
      setError(msg);
      toast.push(msg, "error");
      return;
    }
    toast.push(
      outcome === "bound" ? "Marked bound" : "Marked declined",
      "success",
    );
    loadReport();
    loadCarrierStats();
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

  async function deleteHistoryRun(runId: number, insured: string) {
    if (!confirm(`Delete triage run for ${insured}? Cannot be undone.`)) return;
    const res = await fetch(`${API_URL}/history/${runId}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (res.status === 204) {
      toast.push("Triage run deleted", "success");
      loadHistory();
    } else {
      toast.push(`Delete failed: ${res.status}`, "error");
    }
  }

  async function uploadPdf(): Promise<Response> {
    if (!pdfFile) throw new Error("Drop or pick an ACORD PDF first.");
    const form = new FormData();
    form.append("file", pdfFile);
    for (const f of extraFiles) form.append("extras", f);
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
    <main className="min-h-screen pb-12">
      <DashboardHeader
        title="Triage"
        subtitle="ACORD in, carrier-ready submissions out."
        rightSlot={
          <>
            <HealthPill />
            {usage && <UsageBadge usage={usage} apiKey={apiKey} />}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900"
            >
              Settings
            </button>
          </>
        }
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {showSettings && (
        <SettingsPanel apiKey={apiKey} onClose={() => setShowSettings(false)} />
      )}

      {history.length === 0 && !result && <WelcomeBanner />}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr] lg:gap-8">
        <div>
          <ModeTabs mode={mode} onChange={setMode} />
          {mode === "pdf" ? (
            <PdfDropzone file={pdfFile} onChange={setPdfFile} />
          ) : (
            <JsonEditor value={submissionJson} onChange={setSubmissionJson} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={runTriage}
              disabled={loading || (mode === "pdf" && !pdfFile)}
              title="⌘/Ctrl + Enter"
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Triaging…" : "Run triage"}
            </button>
            {mode === "json" && (
              <>
                <button
                  onClick={async () => {
                    let parsed: unknown;
                    try {
                      parsed = JSON.parse(submissionJson);
                    } catch {
                      toast.push("JSON is invalid; fix it first.", "error");
                      return;
                    }
                    setLoading(true);
                    try {
                      const res = await fetch(`${API_URL}/carriers/check`, {
                        method: "POST",
                        credentials: "include",
                        headers: {
                          "Content-Type": "application/json",
                          ...authHeaders(apiKey),
                        },
                        body: JSON.stringify(parsed),
                      });
                      if (!res.ok) {
                        toast.push(`Check failed: ${res.status}`, "error");
                        return;
                      }
                      const body = (await res.json()) as {
                        in_appetite: { carrier_id: string; name: string }[];
                        out_of_appetite: { carrier_id: string; name: string }[];
                      };
                      const inNames = body.in_appetite.map((c) => c.name).join(", ") || "none";
                      toast.push(
                        `${body.in_appetite.length} in / ${body.out_of_appetite.length} out: ${inNames}`,
                        body.in_appetite.length > 0 ? "success" : "info",
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  title="Run only the deterministic prefilter (no LLM, no quota)"
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  Check appetite
                </button>
                <button
                  onClick={() =>
                    setSubmissionJson(JSON.stringify(ACME_PLUMBING_SUBMISSION, null, 2))
                  }
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
                >
                  Reset to sample
                </button>
                <JsonTemplates
                  current={submissionJson}
                  onLoad={setSubmissionJson}
                />
              </>
            )}
            {mode === "pdf" && pdfFile && (
              <>
                <button
                  onClick={async () => {
                    if (!pdfFile) return;
                    const fd = new FormData();
                    fd.append("file", pdfFile);
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await fetch(`${API_URL}/triage/parse-only`, {
                        method: "POST",
                        credentials: "include",
                        headers: authHeaders(apiKey),
                        body: fd,
                      });
                      if (!res.ok) {
                        throw new Error(`API ${res.status}: ${await res.text()}`);
                      }
                      const parsed = await res.json();
                      setSubmissionJson(JSON.stringify(parsed, null, 2));
                      setMode("json");
                      toast.push(
                        "Parsed - review the extraction, edit if needed, then Run triage.",
                        "success",
                      );
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      setError(msg);
                      toast.push(msg, "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  title="Extract fields without LLM scoring; review before triage"
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 disabled:opacity-50"
                >
                  {loading ? "Parsing…" : "Parse only"}
                </button>
                <button
                  onClick={() => {
                    setPdfFile(null);
                    setExtraFiles([]);
                  }}
                  className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
                >
                  Clear file
                </button>
              </>
            )}
          </div>

          {mode === "pdf" && pdfFile && (
            <ExtraAttachments files={extraFiles} onChange={setExtraFiles} />
          )}

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
              <PriorRuns
                currentRunId={history[0]?.id}
                currentInsured={history[0]?.insured_name}
                history={history}
                onOpen={openHistoryRun}
              />
              <Matches matches={result.matches} summary={result.summary} />
              <DraftedEmails
                drafts={result.drafted_emails}
                onSend={sendDraft}
                onOutcome={setOutcome}
                onEdit={editDraft}
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
        onDelete={deleteHistoryRun}
        apiKey={apiKey}
        query={historyQuery}
        onQueryChange={setHistoryQuery}
        carrierStats={carrierStats}
        canLoadMore={history.length >= historyLimit}
        onLoadMore={() => setHistoryLimit((n) => n + 20)}
      />
      </div>
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
  const toast = useToast();
  const [me, setMe] = useState<{
    name: string;
    slug: string;
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
        slug: b.slug,
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
        <div>
          <Field
            label="Slack/Discord/MS Teams webhook URL"
            value={me.notification_webhook_url ?? ""}
            onChange={(v) =>
              setMe({ ...me, notification_webhook_url: v || null })
            }
            placeholder="https://hooks.slack.com/services/..."
          />
          {me.notification_webhook_url && (
            <button
              type="button"
              onClick={async () => {
                const r = await fetch(
                  `${API_URL}/me/notifications/test`,
                  {
                    method: "POST",
                    credentials: "include",
                    headers: authHeaders(apiKey),
                  },
                );
                if (r.ok) {
                  const body = (await r.json()) as { ok: boolean };
                  toast.push(
                    body.ok
                      ? "Test notification sent - check Slack."
                      : "Webhook set but the post failed (check the URL).",
                    body.ok ? "success" : "error",
                  );
                } else {
                  toast.push(`Test failed: ${r.status}`, "error");
                }
              }}
              className="mt-1 rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-900"
            >
              Send test notification
            </button>
          )}
        </div>
        <Field
          label="Forward-inbox alias (for SES Inbound)"
          value={me.forward_inbox_address ?? ""}
          onChange={(v) =>
            setMe({ ...me, forward_inbox_address: v || null })
          }
          placeholder={`triage+${me.slug}@appetitematch.com`}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Set this to the alias your retail agents will forward ACORDs to.
        Suggested:{" "}
        <button
          type="button"
          onClick={() =>
            setMe({
              ...me,
              forward_inbox_address: `triage+${me.slug}@appetitematch.com`,
            })
          }
          className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-300 hover:bg-slate-900"
        >
          triage+{me.slug}@appetitematch.com
        </button>
      </p>
      {me.forward_inbox_address &&
        !me.forward_inbox_address.toLowerCase().endsWith("@appetitematch.com") && (
          <p className="mt-1 text-xs text-amber-300">
            ⚠ Custom domains (
            <code className="text-amber-200">
              {me.forward_inbox_address.split("@")[1]}
            </code>
            ) need an MX record pointing at our SES inbound endpoint - email
            us to wire it. The shared{" "}
            <code className="text-slate-300">@appetitematch.com</code> path
            works out of the box.
          </p>
        )}
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
      <WebhookSecretManager apiKey={apiKey} />
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

function WebhookSecretManager({ apiKey }: { apiKey: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch(`${API_URL}/me`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    })
      .then((r) => r.json())
      .then((b) => setSecret(b.webhook_secret ?? null));
  }, [apiKey]);

  async function rotate() {
    if (
      !confirm(
        "Rotating invalidates the current webhook_secret immediately. The SES Inbound Lambda (or any other forwarder) will start 401-ing until you update its WEBHOOK_SECRET env var. Continue?",
      )
    ) {
      return;
    }
    setRotating(true);
    const r = await fetch(`${API_URL}/me/webhook-secret/rotate`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    setRotating(false);
    if (r.ok) {
      const next = (await r.json()).webhook_secret as string;
      setSecret(next);
      toast.push("Webhook secret rotated", "success");
    } else {
      toast.push(`Rotate failed: ${r.status}`, "error");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Webhook secret
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        HMAC key the SES Inbound Lambda (and /webhooks/inbound) signs
        payloads with. Header format:{" "}
        <code className="text-slate-300">X-Triage-Signature: sha256=&lt;hex&gt;</code>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {secret ? (
          <code className="break-all rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200">
            {secret}
          </code>
        ) : (
          <span className="text-xs text-slate-500">Loading…</span>
        )}
        <button
          onClick={rotate}
          disabled={rotating}
          className="rounded-md border border-rose-800 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950 disabled:opacity-50"
        >
          {rotating ? "Rotating…" : "Rotate"}
        </button>
        {secret && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(secret);
              toast.push("Copied", "success");
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
  onDelete,
  apiKey,
  query,
  onQueryChange,
  carrierStats,
  canLoadMore,
  onLoadMore,
}: {
  history: TriageRunSummary[];
  onOpen: (id: number) => void;
  onDelete: (id: number, insured: string) => void;
  apiKey: string;
  query: { insured: string; state: string; carrier_id: string };
  onQueryChange: (q: { insured: string; state: string; carrier_id: string }) => void;
  carrierStats: CarrierStats[];
  canLoadMore: boolean;
  onLoadMore: () => void;
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
          {carrierStats.length > 0 && (
            <select
              value={query.carrier_id}
              onChange={(e) =>
                onQueryChange({ ...query, carrier_id: e.target.value })
              }
              className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">Any carrier</option>
              {carrierStats.map((s) => (
                <option key={s.carrier_id} value={s.carrier_id}>
                  {s.carrier_id}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={downloadCsv}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-900"
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
      <div className="min-w-[640px] overflow-hidden rounded-md border border-slate-800">
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
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onOpen(row.id)}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => onDelete(row.id, row.insured_name)}
                      className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                      aria-label={`Delete triage for ${row.insured_name}`}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      {canLoadMore && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onLoadMore}
            className="rounded-md border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Load 20 more
          </button>
        </div>
      )}
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

function ExtraAttachments({
  files,
  onChange,
}: {
  files: File[];
  onChange: (next: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3 rounded-md border border-slate-800 bg-slate-950 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-400">
          Extra attachments (loss runs, dec page, etc.)
        </p>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-900"
        >
          + Add PDF
        </button>
        <input
          ref={ref}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).filter((f) =>
              f.name.toLowerCase().endsWith(".pdf"),
            );
            onChange([...files, ...picked]);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-900/40 px-2 py-1"
            >
              <span className="truncate text-slate-300">
                {f.name}{" "}
                <span className="text-slate-500">
                  ({(f.size / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-rose-300"
                aria-label={`Remove ${f.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length === 0 && (
        <p className="mt-2 text-[11px] text-slate-600">
          Optional. These attachments are listed in the carrier's draft email
          alongside the ACORD.
        </p>
      )}
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

function JsonTemplates({
  current,
  onLoad,
}: {
  current: string;
  onLoad: (v: string) => void;
}) {
  const STORAGE_KEY = "submission-templates";
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTemplates(JSON.parse(raw) as Record<string, string>);
    } catch {
      /* corrupt storage; ignore */
    }
  }, []);

  function persist(next: Record<string, string>) {
    setTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function saveAs() {
    try {
      JSON.parse(current);
    } catch {
      toast.push("JSON is invalid; fix it before saving as a template.", "error");
      return;
    }
    const name = prompt("Template name (e.g. 'Habitational FL', 'HVAC')")?.trim();
    if (!name) return;
    persist({ ...templates, [name]: current });
    toast.push(`Saved template "${name}"`, "success");
    setOpen(false);
  }

  function load(name: string) {
    onLoad(templates[name]);
    toast.push(`Loaded template "${name}"`, "success");
    setOpen(false);
  }

  function remove(name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    const next = { ...templates };
    delete next[name];
    persist(next);
  }

  const names = Object.keys(templates).sort();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
      >
        Templates {names.length > 0 ? `(${names.length})` : ""} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-64 rounded-md border border-slate-800 bg-slate-950 p-1 shadow-xl">
          {names.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              No saved templates yet.
            </p>
          ) : (
            names.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => load(name)}
                  className="flex-1 truncate text-left text-slate-200"
                >
                  {name}
                </button>
                <button
                  type="button"
                  onClick={() => remove(name)}
                  className="text-slate-500 hover:text-rose-300"
                  aria-label={`Delete ${name}`}
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="mt-1 border-t border-slate-800 pt-1">
            <button
              type="button"
              onClick={saveAs}
              className="w-full rounded px-2 py-1.5 text-left text-xs text-emerald-300 hover:bg-slate-900"
            >
              + Save current as…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JsonEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  let parseError: string | null = null;
  try {
    if (value.trim()) JSON.parse(value);
  } catch (e) {
    parseError = e instanceof Error ? e.message : "Invalid JSON";
  }

  function format() {
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
    } catch {
      /* leave as-is, error banner already shows the problem */
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={
          "h-[480px] w-full rounded-md border bg-slate-950 p-3 font-mono text-xs text-slate-200 focus:outline-none " +
          (parseError
            ? "border-rose-700 focus:border-rose-500"
            : "border-slate-800 focus:border-emerald-500")
        }
      />
      <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px]">
        <span
          className={
            parseError ? "truncate text-rose-300" : "text-slate-500"
          }
          title={parseError ?? undefined}
        >
          {parseError ? `JSON: ${parseError}` : "JSON parses cleanly"}
        </span>
        <button
          type="button"
          onClick={format}
          disabled={!!parseError}
          className="shrink-0 rounded border border-slate-800 px-2 py-0.5 text-slate-400 hover:border-slate-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Format
        </button>
      </div>
    </div>
  );
}

function PriorRuns({
  currentRunId,
  currentInsured,
  history,
  onOpen,
}: {
  currentRunId: number | undefined;
  currentInsured: string | undefined;
  history: TriageRunSummary[];
  onOpen: (id: number) => void;
}) {
  if (!currentInsured) return null;
  const needle = currentInsured.trim().toLowerCase();
  const prior = history.filter(
    (r) => r.id !== currentRunId && r.insured_name.trim().toLowerCase() === needle,
  );
  if (prior.length === 0) return null;
  return (
    <section className="mb-6 rounded-md border border-sky-700 bg-sky-500/5 p-4">
      <p className="text-sm font-medium text-sky-200">
        {prior.length === 1
          ? "1 prior triage on this insured"
          : `${prior.length} prior triages on this insured`}{" "}
        <span className="text-sky-400/80">- looks like a renewal.</span>
      </p>
      <ul className="mt-2 space-y-1 text-xs text-sky-300">
        {prior.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3">
            <span className="truncate">
              {new Date(r.created_at).toLocaleDateString()} ·{" "}
              {r.match_count} match{r.match_count === 1 ? "" : "es"} ·{" "}
              {r.draft_count} draft{r.draft_count === 1 ? "" : "s"}
            </span>
            <span className="shrink-0 flex gap-2">
              <button
                onClick={() => onOpen(r.id)}
                className="rounded border border-sky-700/60 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/10"
              >
                Open
              </button>
              {currentRunId != null && (
                <Link
                  href={`/app/compare?a=${currentRunId}&b=${r.id}`}
                  className="rounded border border-sky-700/60 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/10"
                >
                  Compare
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
      <div className="-mx-4 overflow-x-auto sm:mx-0">
      <div className="min-w-[640px] overflow-hidden rounded-md border border-slate-800">
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
        of these next steps when you're ready, or follow the{" "}
        <Link
          href="/app/setup"
          className="font-medium text-emerald-300 underline-offset-2 hover:underline"
        >
          90-second setup walkthrough
        </Link>
        .
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            n: "1",
            title: "Run a sample triage",
            body: "Click Paste JSON → Reset to sample → Run triage. See how Atlas + Keystone score on the Acme Plumbing TX submission.",
          },
          {
            n: "2",
            title: "Wire your forward inbox",
            body: "In Settings, set a forward alias (e.g. triage+yourorg@appetitematch.com). Retail agents forward ACORDs there and triage runs automatically.",
          },
          {
            n: "3",
            title: "Add your real carriers",
            body: "Go to Carriers and add the markets you actually quote with. NAICS prefixes, states, lines, revenue band.",
            href: "/app/carriers",
          },
          {
            n: "4",
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
        Per-carrier performance, this period
      </h2>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
      <div className="min-w-[760px] overflow-hidden rounded-md border border-slate-800">
        <table className="w-full text-left text-sm">
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
      </div>
    </section>
  );
}

function CopyDraftButton({
  subject,
  body,
  to,
}: {
  subject: string;
  body: string;
  to: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
          toast.push("Email copied to clipboard.", "success");
        } catch {
          toast.push("Copy failed.", "error");
        }
      }}
      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DraftedEmails({
  drafts,
  onSend,
  onOutcome,
  onEdit,
}: {
  drafts: TriageResult["drafted_emails"];
  onSend: (id: number) => void;
  onOutcome: (id: number, outcome: "bound" | "declined", premiumCents?: number) => void;
  onEdit?: (id: number, patch: { subject?: string; body?: string }) => Promise<void>;
}) {
  const unsent = drafts.filter((d) => d.id != null && !d.sent_at);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Drafted carrier emails ({drafts.length})
        </h2>
        {unsent.length > 1 && (
          <button
            onClick={() => {
              if (
                confirm(
                  `Send all ${unsent.length} unsent drafts to carriers? Each carrier receives the same submission packet with their tailored cover.`,
                )
              ) {
                unsent.forEach((d) => d.id != null && onSend(d.id));
              }
            }}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Send all {unsent.length}
          </button>
        )}
      </div>
      <div className="space-y-4">
        {drafts.map((d) => {
          const isSent = Boolean(d.sent_at);
          const hasReply = Boolean(d.quote_replied_at);
          const isBound = d.outcome === "bound";
          const isDeclined = d.outcome === "declined";
          return (
            <DraftCard
              key={d.carrier_id}
              draft={d}
              isSent={isSent}
              hasReply={hasReply}
              isBound={isBound}
              isDeclined={isDeclined}
              onSend={onSend}
              onOutcome={onOutcome}
              onEdit={onEdit}
            />
          );
        })}
      </div>
    </section>
  );
}

function DraftCard({
  draft: d,
  isSent,
  hasReply,
  isBound,
  isDeclined,
  onSend,
  onOutcome,
  onEdit,
}: {
  draft: TriageResult["drafted_emails"][number];
  isSent: boolean;
  hasReply: boolean;
  isBound: boolean;
  isDeclined: boolean;
  onSend: (id: number) => void;
  onOutcome: (id: number, outcome: "bound" | "declined", premiumCents?: number) => void;
  onEdit?: (id: number, patch: { subject?: string; body?: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftSubject, setDraftSubject] = useState(d.subject);
  const [draftBody, setDraftBody] = useState(d.body);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraftSubject(d.subject);
    setDraftBody(d.body);
    setEditing(true);
  }

  async function save() {
    if (!d.id || !onEdit) return;
    setSaving(true);
    try {
      const patch: { subject?: string; body?: string } = {};
      if (draftSubject !== d.subject) patch.subject = draftSubject;
      if (draftBody !== d.body) patch.body = draftBody;
      if (Object.keys(patch).length > 0) await onEdit(d.id, patch);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-md border border-slate-800 bg-slate-950 p-4">
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
      {editing ? (
        <>
          <input
            value={draftSubject}
            onChange={(e) => setDraftSubject(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={Math.min(24, draftBody.split("\n").length + 1)}
            className="block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-sans text-sm leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-slate-100">{d.subject}</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">
            {d.body}
          </pre>
        </>
      )}
      {hasReply && d.quote_reply_body && (
        <div className="mt-4 rounded-md border border-sky-800 bg-sky-500/5 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-300">
            Carrier reply
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-200">
            {d.quote_reply_body}
          </pre>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save edits"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
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
            {!isSent && onEdit && d.id != null && (
              <button
                onClick={startEdit}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
              >
                Edit
              </button>
            )}
            <CopyDraftButton subject={d.subject} body={d.body} to={d.to} />
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
          </>
        )}
      </div>
    </article>
  );
}
