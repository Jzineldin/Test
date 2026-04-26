"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing token in URL.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          credentials: "include",
        });
        if (!res.ok) {
          setError(`Could not verify: ${res.status}. Request a fresh link.`);
          return;
        }
        router.replace("/app");
      } catch (e) {
        setError(
          `Network error: ${e instanceof Error ? e.message : String(e)}. Request a fresh link.`,
        );
      }
    })();
  }, [token, router]);

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          {error}
        </div>
        <Link
          href="/login"
          className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
        >
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-3 text-sm text-slate-400">
      <span className="size-4 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
      Signing you in…
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
      <Link
        href="/"
        className="mb-8 text-sm font-semibold tracking-tight text-slate-100 transition hover:text-emerald-400"
      >
        AppetiteMatch
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6 text-center sm:p-8">
        <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
          <VerifyInner />
        </Suspense>
      </div>
    </main>
  );
}
