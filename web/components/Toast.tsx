"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  push: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      push: (m: string) => {
        // Fallback when used outside a provider, e.g. in pages that
        // haven't been wrapped yet. Browsers ignore alert() in most
        // headless test envs which is fine.
        if (typeof window !== "undefined") console.log("[toast]", m);
      },
    }
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) =>
        setToasts((t) => t.filter((x) => x.id !== id))} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:right-6">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setEnter(true));
  }, []);
  const palette = {
    success: "border-emerald-700 bg-emerald-500/10 text-emerald-200",
    error: "border-rose-800 bg-rose-950/60 text-rose-200",
    info: "border-slate-700 bg-slate-950/90 text-slate-200",
  }[toast.variant];
  return (
    <div
      className={
        "max-w-sm rounded-md border px-4 py-3 text-sm shadow-2xl transition-all duration-200 " +
        palette +
        (enter ? " translate-y-0 opacity-100" : " translate-y-2 opacity-0")
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex-1">{toast.message}</span>
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          className="text-xs text-current opacity-70 transition hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
