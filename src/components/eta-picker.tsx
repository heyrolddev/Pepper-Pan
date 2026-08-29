"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderEta } from "@/app/admin/orders/actions";
import { ClockIcon } from "@/components/icons";

/** One tap covers the common cases; the rest is rare enough to type. */
const PRESETS = [15, 20, 30, 45, 60];

export function EtaPicker({
  orderId,
  eta,
}: {
  orderId: string;
  eta: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function set(minutes: number | null) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setOrderEta(orderId, minutes);
        if (res.error) setError(res.error);
        else {
          setOpen(false);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not set the ETA.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
          eta != null
            ? "bg-gold-400 text-ink-950 hover:bg-gold-300"
            : "bg-ink-950/10 text-ink-800 hover:bg-ink-950/20"
        }`}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        {eta != null ? `${eta} min` : "Set ETA"}
      </button>

      {open && (
        <div className="flex flex-wrap justify-end gap-1.5 rounded-2xl bg-cream-50 p-2 ring-1 ring-ink-950/10">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => set(m)}
              disabled={pending}
              className="rounded-full bg-ink-950/10 px-3 py-1 text-xs font-bold text-ink-950 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-60"
            >
              {m}m
            </button>
          ))}
          {eta != null && (
            <button
              onClick={() => set(null)}
              disabled={pending}
              className="rounded-full px-3 py-1 text-xs font-bold text-ink-800 hover:text-brand-600 disabled:opacity-60"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && <span className="text-xs font-semibold text-brand-700">{error}</span>}
    </div>
  );
}
