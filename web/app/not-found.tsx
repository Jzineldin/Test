import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">
        404
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-100">
        Page not found.
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        Whatever you were looking for - appetite guide, broker, ACORD - it's
        not at this URL. Double-check the link, or jump to one of these:
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
        >
          Home
        </Link>
        <Link
          href="/app"
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Dashboard
        </Link>
        <Link
          href="/pricing"
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Pricing
        </Link>
        <a
          href="mailto:hello@appetitematch.com"
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Email us
        </a>
      </div>
    </main>
  );
}
