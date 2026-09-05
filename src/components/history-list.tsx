"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * A list that shows the few that matter and keeps the rest within reach.
 *
 * Four screens wanted this within a week of each other — shifts, money in and
 * out, the reorder list, and whatever comes next — which is the point at
 * which writing it a fourth time stops being pragmatic and starts being a
 * decision to keep four things in sync by hand. They would not stay in sync:
 * the first one already had a subtly different rule about whether picking
 * dates should also collapse the list.
 *
 * Two behaviours, and the second one is the one that is easy to get wrong:
 *
 *   By default it shows the newest few. Everything older sits behind one
 *   button, because a long list on a phone is a scroll past the thing you
 *   opened the page for.
 *
 *   Picking dates answers in full. A range is a deliberate question — "what
 *   happened that week" — and truncating the answer to five rows would look
 *   like the filter had failed rather than like a summary.
 *
 * Dates are compared as whole Manila days by slicing the ISO string rather
 * than by constructing a Date. A `new Date("2026-09-04")` is midnight UTC,
 * which is 8am here — so an evening entry lands on the following day and the
 * owner sees a shift they know happened on Friday filed under Saturday.
 */
export function HistoryList<T>({
  items,
  dateOf,
  render,
  keyOf,
  initial = 5,
  empty,
  noun = "entries",
  className = "",
}: {
  items: T[];
  /** The ISO timestamp this row belongs to. */
  dateOf: (item: T) => string;
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string | number;
  /** How many to show before "see more". */
  initial?: number;
  empty: string;
  /** For the counts and the button — "shifts", "entries", "items". */
  noun?: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ranged = Boolean(from || to);

  const matching = useMemo(() => {
    if (!ranged) return items;
    return items.filter((i) => {
      const day = dateOf(i).slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [items, dateOf, from, to, ranged]);

  const shown = showAll || ranged ? matching : matching.slice(0, initial);
  const hidden = matching.length - shown.length;

  return (
    <div className={className}>
      {/* The dates sit above the list rather than below it: they change what
          the list contains, and a control that changes a thing belongs where
          it is read before the thing, not after. */}
      {(items.length > initial || ranged) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-2 font-bold text-ink-800/60">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border-2 border-ink-950/10 bg-cream-100 px-3 py-1.5 font-semibold text-ink-950 outline-none focus:border-gold-400"
            />
          </label>
          <label className="flex items-center gap-2 font-bold text-ink-800/60">
            to
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border-2 border-ink-950/10 bg-cream-100 px-3 py-1.5 font-semibold text-ink-950 outline-none focus:border-gold-400"
            />
          </label>
          {ranged && (
            <>
              <button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="rounded-full bg-ink-950/5 px-3 py-1.5 font-bold text-ink-800/70 transition-colors hover:bg-brand-600 hover:text-cream-50"
              >
                Clear dates
              </button>
              <span className="font-semibold text-ink-800/50">
                {matching.length} {noun} in range
              </span>
            </>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-ink-950/15 bg-cream-100 p-5 text-sm text-ink-800/60">
          {ranged ? "Nothing in those dates. Try a wider range, or clear them." : empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => (
            <li key={keyOf(item)}>{render(item)}</li>
          ))}
        </ul>
      )}

      {/* Only when there is more. A button that reveals nothing teaches
          people not to press buttons. */}
      {!ranged && hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 rounded-full bg-cream-100 px-4 py-2 text-xs font-bold text-ink-800/75 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
        >
          See history — {hidden} more
        </button>
      )}
      {!ranged && showAll && matching.length > initial && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-3 rounded-full px-4 py-2 text-xs font-bold text-ink-800/60 transition-colors hover:text-ink-950"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
