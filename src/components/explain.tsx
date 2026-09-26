"use client";

import { useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";

/**
 * A number, and where it came from.
 *
 * Every figure on the Money screen is the end of a sum, and the sum is the
 * part that decides whether to believe it. "₱758 a day to cover everything"
 * is a number to argue with; "₱11,500 of bills plus ₱2,200 of spoilage, over
 * a 68% margin, across 26 open days" is a number to act on — and the owner
 * can see at a glance which input is wrong when it looks off.
 *
 * Deliberately a dialog and not a tooltip. These are read on a phone on a
 * counter, where there is no hover at all, and the explanation is four lines
 * of arithmetic rather than a caption. The whole tile is the trigger, so the
 * target is the size of a thumb.
 */

export type ExplainLine = {
  label: string;
  value: string;
  /** Set on the line that is the answer, so the arithmetic reads as a sum. */
  total?: boolean;
  /** A quiet note under the line — where the figure itself comes from. */
  note?: string;
};

export function Explain({
  title,
  /** One sentence on what the number means, before any arithmetic. */
  what,
  lines,
  /** What moves it, and what to do when it looks wrong. */
  why,
  /**
   * Whether the thing being wrapped is dark.
   *
   * The "?" mark is ink on a 10% ink disc, which is exactly invisible on the
   * charcoal band the Money page now opens with — an affordance that cannot
   * be seen is an affordance that is not there.
   */
  onDark = false,
  children,
}: {
  title: string;
  what: string;
  lines: ExplainLine[];
  why?: string;
  onDark?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Where does this number come from?"
        aria-label={`${title} — where does this number come from?`}
        className="group relative w-full cursor-help text-left transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
      >
        {children}
        {/* The affordance: a quiet mark that firms up on hover, so the tile
            reads as an object you can open without shouting about it. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full text-[11px] font-black transition-colors ${
            onDark
              ? "bg-cream-50/15 text-cream-50/70 group-hover:bg-gold-400 group-hover:text-ink-950"
              : "bg-ink-950/10 text-ink-950/40 group-hover:bg-ink-950 group-hover:text-cream-50"
          }`}
        >
          ?
        </span>
      </button>

      {open && (
        <AdminDialog title={title} subtitle={what} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-cream-100 px-4 py-2 ring-1 ring-ink-950/10">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={`flex items-baseline justify-between gap-4 py-2 ${
                    i < lines.length - 1 ? "border-b border-ink-950/5" : ""
                  } ${line.total ? "border-t-2 border-t-ink-950/15" : ""}`}
                >
                  <span
                    className={`min-w-0 text-sm ${
                      line.total ? "font-bold text-ink-950" : "text-ink-800/75"
                    }`}
                  >
                    {line.label}
                    {line.note && (
                      <span className="mt-0.5 block text-xs text-ink-800/45">
                        {line.note}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-display tabular-nums ${
                      line.total
                        ? "text-lg font-black text-ink-950"
                        : "font-bold text-ink-800/80"
                    }`}
                  >
                    {line.value}
                  </span>
                </div>
              ))}
            </div>

            {why && (
              <p className="text-sm leading-relaxed text-ink-800/70">{why}</p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
              >
                Got it
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
