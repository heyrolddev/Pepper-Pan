"use client";

import { useEffect } from "react";

/**
 * The one dialog shape HQ uses.
 *
 * Modelled on the sign-out confirmation rather than invented fresh, so the
 * store-room forms feel like the rest of the workspace: same scrim, same
 * corner radius, same way out. Escape closes it and so does the scrim,
 * because a dialog you can only leave by finding the right button is a trap —
 * and these open on a phone, one-handed, mid-service.
 */
export function AdminDialog({
  title,
  subtitle,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** While true, the dialog refuses to close — a half-written row is worse. */
  busy?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] grid place-items-end p-0 sm:place-items-center sm:p-4"
    >
      <button
        aria-label="Close"
        onClick={() => !busy && onClose()}
        className="absolute inset-0 bg-ink-950/70"
      />
      {/* Bottom sheet on a phone, centred card on a laptop. The store room
          gets updated standing at the shelf more often than sitting down. */}
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-cream-50 p-6 shadow-2xl ring-1 ring-ink-950/10 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-black text-ink-950">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-800/60">{subtitle}</p>
            )}
          </div>
          <button
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-950/5 text-ink-800 transition-colors hover:bg-ink-950/10"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A labelled field, so every form in HQ lines up the same way. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/60">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-ink-800/50">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors placeholder:text-ink-800/35 focus:border-gold-400";
