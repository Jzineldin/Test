"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/try", label: "Live demo" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
            AppetiteMatch
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-emerald-400/80 sm:inline">
            beta
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {NAV_ITEMS.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-slate-400 transition hover:text-slate-100"
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-slate-400 transition hover:text-slate-100"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Start free trial
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="flex size-10 items-center justify-center rounded-md border border-slate-800 text-slate-300 md:hidden"
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

      {/* Mobile drawer */}
      {open && (
        <nav className="border-t border-slate-900 bg-slate-950 md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm">
            {NAV_ITEMS.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-slate-300 hover:bg-slate-900"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-slate-300 hover:bg-slate-900"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-md bg-emerald-500 px-3 py-2 text-center text-sm font-medium text-slate-950"
            >
              Start free trial
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>© 2026 AppetiteMatch</span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/help" className="hover:text-slate-300">Help</Link>
          <Link href="/docs" className="hover:text-slate-300">Docs</Link>
          <Link href="/status" className="hover:text-slate-300">Status</Link>
          <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-300">Terms</Link>
          <a href="mailto:hello@appetitematch.com" className="hover:text-slate-300">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
