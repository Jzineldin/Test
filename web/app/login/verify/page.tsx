"use client";

import { Suspense, useEffect, useState } from "react";
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
    })();
  }, [token, router]);

  if (error) {
    return (
      <p className="rounded-md border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
        {error}
      </p>
    );
  }
  return <p className="text-sm text-slate-400">Signing you in…</p>;
}

export default function VerifyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
        <VerifyInner />
      </Suspense>
    </main>
  );
}
