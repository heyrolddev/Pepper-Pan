"use client";

import { motion } from "motion/react";
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  STATUS_TONES,
  type OrderStatus,
} from "@/lib/orders";

/**
 * The seven queues a food stall actually runs, as one strip you can read
 * without opening anything.
 *
 * Before this, HQ split orders into "Open" and "History" — which answers "is
 * there work?" but not "what kind?". Those are different questions during a
 * lunch rush: four orders on the wok and four waiting to be accepted are the
 * same "8 open", and they need completely different things from the owner.
 *
 * So each status gets its own tab with its own live count, and the counts stay
 * visible at zero. An empty Ready queue is information — it's the difference
 * between "nothing to hand over" and "I haven't looked".
 *
 * `Open` stays as the first tab and the default, because during service that
 * is the working view: everything the shop still owes someone, oldest problem
 * first. The per-status tabs are for answering a specific question.
 */

export type View = "open" | OrderStatus;

const OPEN_TONE = {
  chip: "bg-ink-950 text-gold-400",
  dot: "bg-ink-950",
  hint: "Everything the shop still owes someone, newest first.",
};

export function OrderBoard({
  view,
  onView,
  counts,
}: {
  view: View;
  onView: (v: View) => void;
  /** How many orders each tab would show, given the search that's applied. */
  counts: Record<View, number>;
}) {
  const tabs: View[] = ["open", ...ORDER_STATUSES];

  const hint =
    view === "open" ? OPEN_TONE.hint : STATUS_TONES[view].hint;

  return (
    <div className="flex flex-col gap-3">
      {/* Scrolls sideways on a phone, wraps on anything wider. Eight tabs
          don't fit a laptop either, and a tab scrolled off the right-hand edge
          is a tab nobody knows exists — which for Cancelled means an order
          that quietly vanished. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
        <div
          role="tablist"
          aria-label="Order status"
          className="flex w-max min-w-full gap-1.5 sm:w-full sm:flex-wrap"
        >
          {tabs.map((tab) => {
            const active = view === tab;
            const n = counts[tab] ?? 0;
            const tone = tab === "open" ? OPEN_TONE : STATUS_TONES[tab];
            const label = tab === "open" ? "Open" : STATUS_LABELS[tab];

            return (
              <button
                key={tab}
                role="tab"
                aria-selected={active}
                onClick={() => onView(tab)}
                className={`relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                  active
                    // The ring, not the fill, is what makes "selected"
                    // unambiguous. Completed and Cancelled are deliberately
                    // quiet colours, and a quiet fill alone reads as just
                    // another tab even when it's the one you're looking at.
                    ? `${tone.chip} ring-2 ring-ink-950/20`
                    : n === 0
                      ? "text-ink-800/40 hover:bg-ink-950/5"
                      : "text-ink-800 hover:bg-ink-950/5"
                }`}
              >
                {/* The dot carries the colour while the tab is unselected, so
                    the queue keeps its identity without seven filled pills
                    shouting at once. */}
                {!active && (
                  <span
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${
                      n === 0 ? "opacity-30" : ""
                    }`}
                  />
                )}
                <span className="whitespace-nowrap">{label}</span>
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-black tabular-nums ${
                    active
                      ? "bg-ink-950/15"
                      : n === 0
                        ? "text-ink-800/35"
                        : "bg-ink-950/8 text-ink-950"
                  }`}
                >
                  {n > 999 ? "999+" : n}
                </span>

                {active && (
                  <motion.span
                    layoutId="order-tab"
                    className="absolute inset-0 -z-10 rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* One line saying what this queue is for. The status names are the
          shop's own words but "Confirmed" still doesn't tell a new staff
          member what they're supposed to do about it. */}
      <p className="text-sm text-ink-800/60">{hint}</p>
    </div>
  );
}
