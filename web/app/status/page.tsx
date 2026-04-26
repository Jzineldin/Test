"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://submission-triage-api.onrender.com";

interface Version {
  git_sha?: string;
  branch?: string;
  service?: string;
  started_at?: string;
  stripe?: string;
  ses?: string;
  docai?: string;
  llm?: string;
}

export default function StatusPage() {
  const [version, setVersion] = useState<Version | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t0 = performance.now();
      try {
        const [healthRes, versionRes] = await Promise.all([
          fetch(`${API_URL}/healthz`),
          fetch(`${API_URL}/version`),
        ]);
        if (cancelled) return;
        setLatencyMs(Math.round(performance.now() - t0));
        setHealthy(healthRes.ok);
        if (versionRes.ok) setVersion(await versionRes.json());
      } catch {
        if (!cancelled) setHealthy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-slate-100"
        >
          AppetiteMatch
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/pricing" className="text-slate-400 hover:text-slate-100">
            Pricing
          </Link>
          <Link
            href="/changelog"
            className="text-slate-400 hover:text-slate-100"
          >
            Changelog
          </Link>
          <Link href="/docs" className="text-slate-400 hover:text-slate-100">
            Docs
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
          Status
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          Live readout of the production API. Refresh this page anytime.
        </p>

        <div className="mt-8 rounded-md border border-slate-800 bg-slate-950 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={
                  "size-3 rounded-full " +
                  (healthy === null
                    ? "bg-slate-600 animate-pulse"
                    : healthy
                    ? "bg-emerald-400"
                    : "bg-rose-500")
                }
              />
              <p className="text-sm font-medium text-slate-100">
                {healthy === null
                  ? "Checking…"
                  : healthy
                  ? "All systems operational"
                  : "API unreachable"}
              </p>
            </div>
            {latencyMs != null && (
              <span className="text-xs text-slate-500">
                round-trip {latencyMs}ms
              </span>
            )}
          </div>

          {version && (
            <dl className="mt-6 grid grid-cols-2 gap-y-3 text-xs">
              <Row label="Build">{version.git_sha ?? "dev"}</Row>
              <Row label="Branch">{version.branch ?? "—"}</Row>
              <Row label="LLM">
                <Badge mode={version.llm ?? "?"} />
              </Row>
              <Row label="Document AI">
                <Badge mode={version.docai ?? "?"} />
              </Row>
              <Row label="Outbound email (SES)">
                <Badge mode={version.ses ?? "?"} />
              </Row>
              <Row label="Billing (Stripe)">
                <Badge mode={version.stripe ?? "?"} />
              </Row>
              <Row label="Started">
                {version.started_at
                  ? new Date(version.started_at).toLocaleString()
                  : "—"}
              </Row>
            </dl>
          )}
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Subscribe to incident updates by emailing{" "}
          <a
            className="text-emerald-400 hover:underline"
            href="mailto:status@appetitematch.com"
          >
            status@appetitematch.com
          </a>
          . SLA + dedicated channel available on the Whale tier.
        </p>
      </section>

      <footer className="border-t border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500">
          <span>© 2026 AppetiteMatch</span>
          <div className="flex gap-5">
            <Link href="/privacy" className="hover:text-slate-300">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-300">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200 font-mono">{children}</dd>
    </>
  );
}

function Badge({ mode }: { mode: string }) {
  const live = mode !== "stub" && mode !== "?";
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-[11px] " +
        (live
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-amber-500/15 text-amber-300")
      }
    >
      {mode}
    </span>
  );
}
