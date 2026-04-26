"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

interface MeShape {
  org_name?: string;
  user_role?: "admin" | "csr" | null;
}

/**
 * Header for /app/* sub-pages (carriers, users, audit). Renders the
 * brokerage name, a contextual subtitle, the org-scoped nav, sign-out,
 * and a hamburger drawer below the md breakpoint so phone viewports
 * stay legible.
 */
export function DashboardHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<MeShape | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const apiKey = localStorage.getItem(API_KEY_STORAGE) ?? "";
    fetch(`${API_URL}/me`, {
      credentials: "include",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setMe(b))
      .catch(() => null);
  }, []);

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    localStorage.removeItem(API_KEY_STORAGE);
    router.replace("/login");
  }

  const isAdmin = !me?.user_role || me.user_role === "admin";

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/app"
            className="flex items-baseline gap-2 text-sm font-semibold tracking-tight text-slate-100 hover:text-emerald-400"
          >
            AppetiteMatch
            {me?.org_name && (
              <span className="hidden text-xs font-normal text-slate-500 sm:inline">
                · {me.org_name}
              </span>
            )}
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            <NavLink href="/app">Triage</NavLink>
            {isAdmin && <NavLink href="/app/carriers">Carriers</NavLink>}
            {isAdmin && <NavLink href="/app/users">Team</NavLink>}
            <NavLink href="/app/audit">Audit</NavLink>
            <button
              onClick={logout}
              className="ml-2 rounded-md border border-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900"
            >
              Sign out
            </button>
          </nav>
          <button
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-md border border-slate-800 text-slate-300 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M4 7h16" strokeLinecap="round" />
                  <path d="M4 12h16" strokeLinecap="round" />
                  <path d="M4 17h16" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        {open && (
          <nav className="border-t border-slate-900 bg-slate-950 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 text-sm">
              <DrawerLink href="/app" onClose={() => setOpen(false)}>Triage</DrawerLink>
              {isAdmin && (
                <DrawerLink href="/app/carriers" onClose={() => setOpen(false)}>
                  Carriers
                </DrawerLink>
              )}
              {isAdmin && (
                <DrawerLink href="/app/users" onClose={() => setOpen(false)}>
                  Team
                </DrawerLink>
              )}
              <DrawerLink href="/app/audit" onClose={() => setOpen(false)}>Audit</DrawerLink>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="mt-1 rounded-md border border-slate-800 px-3 py-2 text-left text-sm text-slate-300"
              >
                Sign out
              </button>
            </div>
          </nav>
        )}
      </div>

      <header className="mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>
            )}
          </div>
          {rightSlot && (
            <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>
          )}
        </div>
      </header>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-900 hover:text-slate-100"
    >
      {children}
    </Link>
  );
}

function DrawerLink({
  href,
  children,
  onClose,
}: {
  href: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="rounded-md px-3 py-2 text-slate-300 hover:bg-slate-900"
    >
      {children}
    </Link>
  );
}
