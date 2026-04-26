import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { RELEASES } from "@/lib/releases";

export const metadata = {
  title: "What's new",
  description: "Recent changes to AppetiteMatch.",
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
};

export default function ChangelogPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
            What's new
          </h1>
          <a
            href="/feed.xml"
            className="rounded-md border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200"
          >
            RSS
          </a>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          We ship every day. Highlights below; everything is in the public repo.
        </p>

        <ol className="mt-12 space-y-12">
          {RELEASES.map((r) => (
            <li
              key={r.tag}
              className="border-l-2 border-emerald-700/40 pl-6"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-sm font-mono text-emerald-300">
                  {r.tag}
                </span>
                <span className="text-xs text-slate-500">{r.when}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-300">
                {r.items.map((it, i) => (
                  <li key={i} dangerouslySetInnerHTML={renderItem(it)} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <SiteFooter />
    </main>
  );
}

/** Render a tiny markdown-ish item: **bold**, `code`, plaintext.
 *  Sufficient for the changelog without pulling in a renderer. */
function renderItem(s: string): { __html: string } {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-medium text-slate-100">$1</strong>',
    )
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-slate-900 px-1 py-0.5 font-mono text-xs text-slate-200">$1</code>',
    );
  return { __html: html };
}
