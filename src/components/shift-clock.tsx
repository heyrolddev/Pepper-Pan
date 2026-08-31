"use client";

import { useEffect, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { endShift, startShift } from "@/app/admin/shift-actions";

/**
 * Clocking in and out, from the rail.
 *
 * Put here rather than on a page of its own because it has to be seen without
 * being looked for: a clock you have to navigate to is a clock people forget
 * to start, and a shift nobody started is a shift nobody gets paid for.
 *
 * While a shift is running the rail shows how long it has been going, ticking
 * — which is both the reassurance that it is recording and the reminder to
 * end it.
 */
export function ShiftClock({
  open,
  startedAt,
}: {
  open: boolean;
  /** ISO timestamp of the running shift, when there is one. */
  startedAt: string | null;
}) {
  const [asking, setAsking] = useState(false);
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState("");

  // Rendered from a timer rather than on the server, because a server-
  // rendered duration is wrong the second after it is sent — and this one is
  // looked at for hours.
  useEffect(() => {
    if (!open || !startedAt) return;
    const tick = () => {
      const mins = Math.max(
        0,
        Math.round((Date.now() - new Date(startedAt).getTime()) / 60000)
      );
      const h = Math.floor(mins / 60);
      setElapsed(h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [open, startedAt]);

  function begin() {
    setError(null);
    startTransition(async () => {
      const r = await startShift();
      if (r.error !== null) setError(r.error);
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const r = await endShift({
        // Empty means nobody counted, which is not the same as counting zero.
        closingCash: cash.trim() === "" ? null : Number(cash),
        note,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      setAsking(false);
      setCash("");
      setNote("");
    });
  }

  if (!open) {
    return (
      <>
        <button
          onClick={begin}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-xl bg-jade-600/20 px-3 py-2.5 text-sm font-bold text-jade-300 transition-colors hover:bg-jade-600 hover:text-cream-50 disabled:opacity-60"
        >
          <span aria-hidden className="w-4 shrink-0 text-center text-xs opacity-70">
            ◷
          </span>
          {busy ? "Clocking in…" : "Clock in"}
        </button>
        {error && (
          <p className="mt-1 px-3 text-[11px] font-semibold text-brand-300">{error}</p>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        className="flex w-full items-center gap-3 rounded-xl bg-cream-50/10 px-3 py-2.5 text-sm font-bold text-cream-100 transition-colors hover:bg-brand-600 hover:text-cream-50"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-jade-400"
        />
        <span className="min-w-0 flex-1 text-left">On shift</span>
        <span className="shrink-0 text-xs font-black tabular-nums text-gold-400">
          {elapsed}
        </span>
      </button>

      {asking && (
        <AdminDialog
          title="Clock out"
          subtitle="Count the drawer before you go — it's the only way a shortfall ever shows up."
          onClose={() => !busy && setAsking(false)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Cash in the drawer (₱)"
              hint="Leave it blank if nobody counted. Blank is not the same as zero."
            >
              <input
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                autoFocus
                className={inputClass}
              />
            </Field>

            <Field label="Anything worth noting" hint="Optional.">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. ran out of pork at 8pm"
                className={inputClass}
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
                {error}
              </p>
            )}

            <button
              onClick={finish}
              disabled={busy}
              className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
            >
              {busy ? "Ending the shift…" : "End my shift"}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
