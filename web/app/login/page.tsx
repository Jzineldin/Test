"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If they hit /login while already authed, send them to /app.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/me`, { credentials: "include" })
      .then((r) => {
        if (!cancelled && r.ok) router.replace("/app");
      })
      .catch(() => {
        /* not authed; stay on the form */
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
      <Link
        href="/"
        className="mb-8 text-sm font-semibold tracking-tight text-slate-100 transition hover:text-emerald-400"
      >
        AppetiteMatch
      </Link>

      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-emerald-500/5 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
          Sign in
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          We'll email you a one-time link. No passwords.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-md border border-emerald-700 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Check your inbox at{" "}
            <span className="font-medium">{email}</span>. The link is good
            for 15 minutes.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-slate-500">
                Work email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                placeholder="you@yourbrokerage.com"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send login link"}
            </button>
            {error && (
              <p className="rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
                {error}
              </p>
            )}
          </form>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        Don't have an account?{" "}
        <Link href="/signup" className="text-emerald-400 hover:underline">
          Start a free trial
        </Link>
      </p>
    </main>
  );
}
