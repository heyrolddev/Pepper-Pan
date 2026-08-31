"use client";

import { useState, type ReactNode } from "react";

/**
 * The one accordion, used by the orders board and the payments ledger.
 *
 * It had a chevron in a black circle, which is the generic answer — every
 * accordion on the web has one, it says nothing about what's inside, and the
 * up/down flip is a detail you have to look for rather than see. So there is
 * no chevron here at all. Two things carry the state instead:
 *
 *   - A coloured rail down the left edge, in the row's own status colour. It
 *     tells you *what* the row is at the same time as showing it can open,
 *     and a column of rails reads as a queue at a glance.
 *   - When open, a full-width bar across the top of the card, in that same
 *     colour, that closes it. Top rather than bottom, because that's where
 *     the row you just tapped still is — a control at the foot of a tall card
 *     is a scroll away from the thing that opened it.
 *
 * The whole bar is the button, not a small ✕ in its corner. One thumb, in a
 * hurry, holding a ladle.
 */
export function Foldable({
  /** Tailwind background+text for this row's status, e.g. "bg-gold-400 text-ink-950". */
  chip,
  /** Tailwind border colour for the left rail, e.g. "border-gold-400". */
  rail,
  /** Shown in the folded row — one line, whatever's worth scanning. */
  folded,
  /** Shown in the open card's top bar, beside the close affordance. */
  title,
  startOpen = false,
  children,
}: {
  chip: string;
  rail: string;
  folded: ReactNode;
  title: ReactNode;
  startOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);

  if (!open) {
    return (
      <li>
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className={`flex w-full items-center gap-3 overflow-hidden rounded-2xl border-l-[6px] bg-cream-100 py-2.5 pl-3 pr-3 text-left ring-1 ring-ink-950/10 transition-colors hover:bg-cream-200/70 ${rail}`}
        >
          {folded}
        </button>
      </li>
    );
  }

  return (
    <li
      className={`overflow-hidden rounded-2xl border-l-[6px] ring-1 ring-ink-950/10 ${rail}`}
    >
      {/* Deliberately quiet. A full-width bar in the status colour did read as
          "this closes", but four open cards became four saturated stripes
          competing with the cards themselves — and its title repeated the one
          printed directly beneath it. The status chip is enough to say which
          row this is; the dark pill is the only thing that needs to shout. */}
      <button
        onClick={() => setOpen(false)}
        aria-expanded
        className="flex w-full items-center gap-3 border-b border-ink-950/10 bg-ink-950/[0.04] px-3 py-2 text-left transition-colors hover:bg-ink-950/10"
      >
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${chip}`}
        >
          {title}
        </span>
        <span className="flex-1" />
        <span className="shrink-0 rounded-full bg-ink-950 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cream-50">
          Close ✕
        </span>
      </button>
      {children}
    </li>
  );
}
