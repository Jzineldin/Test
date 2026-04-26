"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardChrome";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

interface User {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "csr";
  created_at: string;
  last_login_at: string | null;
}

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

export default function UsersPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<{ user_role?: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "csr">("csr");
  const [invitedAt, setInvitedAt] = useState<string | null>(null);

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
        if (res.ok) setMe(await res.json());
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
    const res = await fetch(`${API_URL}/me/users`, {
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (res.ok) setUsers((await res.json()) as User[]);
  }, [apiKey, authChecked]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvitedAt(null);
    try {
      const res = await fetch(`${API_URL}/me/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || null,
          role: inviteRole,
        }),
      });
      if (!res.ok) {
        setError(`Invite failed: ${res.status} ${await res.text()}`);
        return;
      }
      setInvitedAt(new Date().toLocaleTimeString());
      setInviteEmail("");
      setInviteName("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Remove ${u.email}? They'll lose access immediately.`)) return;
    const res = await fetch(`${API_URL}/me/users/${u.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders(apiKey),
    });
    if (!res.ok) {
      setError(`Remove failed: ${res.status} ${await res.text()}`);
      return;
    }
    reload();
  }

  const isAdmin = !me?.user_role || me.user_role === "admin";

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
        title="Team"
        subtitle="Invite CSRs and other admins. Magic-link sign-in, no shared passwords."
      />

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
      {error && (
        <div className="mb-6 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isAdmin && (
        <form
          onSubmit={invite}
          className="mb-10 rounded-md border border-emerald-700 bg-emerald-500/5 p-5"
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-emerald-300">
            Invite a teammate
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Work email
              </span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className={inputClass}
                placeholder="csr@yourbrokerage.com"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Role
              </span>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "admin" | "csr")
                }
                className={inputClass}
              >
                <option value="csr">CSR (run triages, send drafts)</option>
                <option value="admin">
                  Admin (carriers, billing, invites)
                </option>
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Name (optional)
              </span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className={inputClass}
                placeholder="Pat Reyes"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
            {invitedAt && (
              <span className="text-xs text-emerald-400">
                ✓ invite sent at {invitedAt}
              </span>
            )}
          </div>
        </form>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">
          Current users ({users.length})
        </h2>
        <ul className="overflow-hidden rounded-md border border-slate-800">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 bg-slate-950 px-4 py-3 last:border-b-0"
            >
              <div>
                <p className="text-sm text-slate-100">
                  {u.name ?? <span className="text-slate-500">unnamed</span>}{" "}
                  <span className="text-xs text-slate-500">{u.email}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Role:{" "}
                  <span
                    className={
                      u.role === "admin"
                        ? "text-emerald-400"
                        : "text-slate-400"
                    }
                  >
                    {u.role}
                  </span>{" "}
                  · joined {new Date(u.created_at).toLocaleDateString()}
                  {u.last_login_at && (
                    <>
                      {" "}
                      · last login{" "}
                      {new Date(u.last_login_at).toLocaleDateString()}
                    </>
                  )}
                </p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => remove(u)}
                  className="rounded-md border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
          {users.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No users yet.
            </li>
          )}
        </ul>
      </section>
      </div>
    </main>
  );
}

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none";
