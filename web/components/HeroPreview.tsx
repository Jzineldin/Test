"use client";

import { useEffect, useState } from "react";

const HERO_MATCHES = [
  {
    name: "Atlas Specialty E&S",
    note: "Artisan contractor, FL in-appetite",
    score: 0.84,
    qb: "4d",
  },
  {
    name: "Keystone Mutual",
    note: "NAICS 238 + GL + auto in-band",
    score: 0.71,
    qb: "7d",
  },
  {
    name: "Redwood Underwriters",
    note: "Property only, skipped",
    score: 0.32,
    qb: "-",
  },
];

// Frames: 0 Pasted, 1 Matches, 2 Sent, 3 Replied, 4 Bound (hold), then loop.
const FRAME_MS = 1900;
const HOLD_MS = 4500;
const TOTAL_FRAMES = 5;

export function HeroPreview() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setFrame(TOTAL_FRAMES - 1);
      return;
    }
    let cancelled = false;
    function tick(next: number) {
      if (cancelled) return;
      setFrame(next);
      const ms = next === TOTAL_FRAMES - 1 ? HOLD_MS : FRAME_MS;
      setTimeout(() => tick((next + 1) % TOTAL_FRAMES), ms);
    }
    const id = setTimeout(() => tick(1), FRAME_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, []);

  const showPasted = frame >= 0;
  const showMatches = frame >= 1;
  const showSent = frame >= 2;
  const showReplied = frame >= 3;
  const showBound = frame >= 4;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 shadow-2xl shadow-emerald-500/5 sm:p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3 text-xs">
        <span className="size-2 rounded-full bg-rose-500/70" />
        <span className="size-2 rounded-full bg-amber-500/70" />
        <span className="size-2 rounded-full bg-emerald-500/70" />
        <span className="ml-3 truncate text-slate-500">
          appetitematch.com/app · Sunrise HVAC, Tampa FL
        </span>
        <span
          className={
            "ml-auto shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-300 transition-opacity duration-500 " +
            (showPasted ? "opacity-100" : "opacity-0")
          }
        >
          Pasted
        </span>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-emerald-400">
        Appetite matches (3)
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {HERO_MATCHES.map((m, i) => (
          <li
            key={m.name}
            className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2 transition-all duration-500"
            style={{
              transitionDelay: showMatches ? `${i * 120}ms` : "0ms",
              opacity: showMatches ? 1 : 0,
              transform: showMatches ? "translateY(0)" : "translateY(6px)",
            }}
          >
            <div className="min-w-0">
              <p className="truncate text-slate-100">{m.name}</p>
              <p className="truncate text-xs text-slate-500">{m.note}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={
                  "rounded-full px-2 py-0.5 font-mono text-xs " +
                  (m.score >= 0.7
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-slate-800 text-slate-400")
                }
              >
                {m.score.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">{m.qb}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex min-h-[26px] flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <Pill show={showSent} className="bg-emerald-500/15 text-emerald-400">
          Sent · Atlas
        </Pill>
        <Pill show={showReplied} className="bg-sky-500/15 text-sky-300">
          Replied · Keystone $42k
        </Pill>
        <Pill
          show={showBound}
          className="bg-emerald-500/20 font-semibold text-emerald-300"
        >
          BOUND $42,000
        </Pill>
      </div>
    </div>
  );
}

function Pill({
  show,
  className,
  children,
}: {
  show: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 transition-all duration-500 " + className
      }
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "scale(1)" : "scale(0.85)",
      }}
    >
      {children}
    </span>
  );
}
