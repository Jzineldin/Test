"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardChrome";
import { useToast } from "@/components/Toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_KEY_STORAGE = "submission-triage-api-key";

function authHeaders(apiKey: string): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

interface Me {
  org_name: string;
  slug: string;
  notification_webhook_url: string | null;
  forward_inbox_address: string | null;
  email_signature: string | null;
}

const STEPS = [
  "Welcome",
  "Forward inbox",
  "Notifications",
  "Carriers",
] as const;

export default function SetupPage() {
  const router = useRouter();
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [step, setStep] = useState(0);

  // Local form state - flushed to /me on Continue.
  const [forward, setForward] = useState("");
  const [webhook, setWebhook] = useState("");
  const [signature, setSignature] = useState("");

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
        const body = (await res.json()) as Me;
        setMe(body);
        setForward(
          body.forward_inbox_address ??
            `triage+${body.slug}@appetitematch.com`,
        );
        setWebhook(body.notification_webhook_url ?? "");
        setSignature(body.email_signature ?? "");
        setAuthChecked(true);
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, router]);

  async function patchMe(changes: Partial<Me>): Promise<boolean> {
    const res = await fetch(`${API_URL}/me`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      toast.push(`Save failed: ${res.status}`, "error");
      return false;
    }
    return true;
  }

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function finish() {
    toast.push("All set. Run your first triage.", "success");
    router.replace("/app");
  }

  if (!authChecked || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-12">
      <DashboardHeader
        title="Setup"
        subtitle="A 90-second walkthrough so your first inbound submission lands in the right place."
        rightSlot={
          <Link
            href="/app"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-900"
          >
            Skip to dashboard
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={
                "rounded-full border px-3 py-1 text-[11px] " +
                (i === step
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                  : i < step
                  ? "border-emerald-700/50 text-emerald-300/70"
                  : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300")
              }
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <Card>
            <h2 className="text-xl font-semibold text-slate-100">
              Welcome, {me.org_name}.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              You're already signed in and your org has four sample carriers
              seeded. The rest of this wizard wires up the bits that turn
              AppetiteMatch into background plumbing: a forward inbox so
              retail agents' emails route here automatically, a Slack hook
              for quote-back pings, and your real carrier list.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Each step has a Skip - you can come back to any of them in
              Settings later.
            </p>
            <Actions onNext={next} nextLabel="Get started" />
          </Card>
        )}

        {step === 1 && (
          <Card>
            <h2 className="text-xl font-semibold text-slate-100">
              Forward-inbox alias
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Set the email address your retail agents forward ACORDs to.
              AWS SES catches the email, our Lambda parses MIME, and a
              triage run hits your dashboard within ~10 seconds. The shared{" "}
              <code className="text-slate-200">@appetitematch.com</code>{" "}
              path works without any DNS work on your side.
            </p>
            <label className="mt-6 block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Forward-inbox address
              </span>
              <input
                value={forward}
                onChange={(e) => setForward(e.target.value)}
                placeholder={`triage+${me.slug}@appetitematch.com`}
                className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </label>
            {forward &&
              !forward.toLowerCase().endsWith("@appetitematch.com") && (
                <p className="mt-2 text-xs text-amber-300">
                  Custom domains need an MX record pointing at our SES
                  endpoint - email us to wire that. The shared
                  appetitematch.com path works zero-setup.
                </p>
              )}
            <Actions
              onSkip={next}
              onNext={async () => {
                const ok = await patchMe({
                  forward_inbox_address: forward.trim() || null,
                });
                if (ok) {
                  setMe({ ...me, forward_inbox_address: forward.trim() || null });
                  next();
                }
              }}
              nextLabel="Save & continue"
            />
          </Card>
        )}

        {step === 2 && (
          <Card>
            <h2 className="text-xl font-semibold text-slate-100">
              Slack / Teams pings (optional)
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Drop a Slack incoming webhook URL (or MS Teams / Discord) and
              we'll fire a message on{" "}
              <code className="text-slate-200">triage.completed</code> and{" "}
              <code className="text-slate-200">quote.received</code>. You
              can change this anytime in Settings.
            </p>
            <label className="mt-6 block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Webhook URL
              </span>
              <input
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <label className="mt-6 block">
              <span className="text-xs uppercase tracking-widest text-slate-500">
                Email signature (optional)
              </span>
              <textarea
                rows={4}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={
                  "Pat Reyes\nSenior Wholesale Broker\nTale Forge Specialty\n(555) 123-4567"
                }
                className="mt-1 block w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <Actions
              onSkip={next}
              onNext={async () => {
                const ok = await patchMe({
                  notification_webhook_url: webhook.trim() || null,
                  email_signature: signature.trim() || null,
                });
                if (ok) {
                  setMe({
                    ...me,
                    notification_webhook_url: webhook.trim() || null,
                    email_signature: signature.trim() || null,
                  });
                  next();
                }
              }}
              nextLabel="Save & continue"
            />
          </Card>
        )}

        {step === 3 && (
          <Card>
            <h2 className="text-xl font-semibold text-slate-100">Carriers</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Your org ships with four sample carriers (Atlas, Keystone,
              Redwood, Great Basin) so the demo flow works out of the box.
              Replace them with your real markets when you're ready - one
              at a time, or via CSV bulk-import.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/app/carriers"
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
              >
                Open carrier directory
              </Link>
              <Link
                href="/app"
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
              >
                I'll do it later - keep samples
              </Link>
            </div>

            <div className="mt-8 border-t border-slate-800 pt-6">
              <button
                onClick={finish}
                className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
              >
                Finish setup &amp; run first triage
              </button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950 p-6 sm:p-8">
      {children}
    </section>
  );
}

function Actions({
  onNext,
  onSkip,
  nextLabel,
}: {
  onNext: () => void | Promise<void>;
  onSkip?: () => void;
  nextLabel: string;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <button
        onClick={() => void onNext()}
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
      >
        {nextLabel}
      </button>
      {onSkip && (
        <button
          onClick={onSkip}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900"
        >
          Skip
        </button>
      )}
    </div>
  );
}
