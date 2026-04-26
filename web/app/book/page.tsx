import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = {
  title: "Book a call",
  description: "Pick a 30-minute slot to talk through Whale-tier deployments.",
};

const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || "";
const CONTACT_EMAIL = "hello@appetitematch.com";

export default function BookPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20">
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400 sm:text-xs">
          30-minute call
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-4xl">
          Pick a time. We'll talk through your stack.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">
          Best for MGAs and 50+ CSR shops evaluating AppetiteMatch for
          production. Bring questions on AMS write-back, security review,
          custom appetite-guide ingestion, or pricing for your volume.
        </p>

        {BOOKING_URL ? (
          <div className="mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <iframe
              src={BOOKING_URL}
              title="Book a call"
              className="block h-[720px] w-full"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-emerald-700 bg-emerald-500/5 p-6">
            <p className="text-sm text-slate-200">
              The booking calendar isn't wired in yet. Email us and we'll
              send a calendar link within a business day.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=AppetiteMatch%20Whale%20tier%20call`}
              className="mt-4 inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              Email {CONTACT_EMAIL}
            </a>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500">
          Just want to try the product?{" "}
          <Link href="/signup" className="text-emerald-400 hover:underline">
            Start free
          </Link>{" "}
          - no card, 50 triages on the house.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
