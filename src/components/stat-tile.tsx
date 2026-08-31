/**
 * One number, stated once, in a box that cannot cut it off.
 *
 * The old tile set every figure at a fixed 30px. On a phone, two of these sit
 * side by side with about 123px of usable width each — and "₱8,819.00" at
 * 30px in a heavy serif is nearly 200px. The peso sign showed, the last digits
 * didn't. A dashboard that truncates money is worse than one that shows
 * nothing: the owner reads a smaller number than they earned.
 *
 * Two changes fix it, and both are worth having on their own merits.
 */

import type { ReactNode } from "react";

/**
 * Whole pesos on a headline figure.
 *
 * Centavos on a day's takings are three characters that never change a
 * decision, and on an *average* they're false precision. Exact amounts still
 * appear to the centavo where they're actually owed — an order total, a
 * payment, a receipt.
 */
export function pesoRound(n: number): string {
  return "₱" + Math.round(n).toLocaleString("en-PH");
}

export type Tone = "plain" | "alert" | "good";

const RING: Record<Tone, string> = {
  plain: "ring-1 ring-ink-950/10",
  alert: "ring-2 ring-brand-600",
  good: "ring-2 ring-jade-600",
};

/** Big figures get big type, long ones get enough type to stay whole. */
function sizeFor(value: string): string {
  const n = value.length;
  if (n <= 6) return "text-[clamp(1.5rem,6.5vw,1.875rem)]";
  if (n <= 8) return "text-[clamp(1.25rem,5.5vw,1.625rem)]";
  return "text-[clamp(0.95rem,4vw,1.25rem)]";
}

export function StatTile({
  label,
  value,
  detail,
  tone = "plain",
  children,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: Tone;
  /** Anything that belongs under the detail line, like a trend. */
  children?: ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-2xl bg-cream-100 p-5 ${RING[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
        {label}
      </p>
      {/*
        Two things size this, and it needs both.

        The screen: `clamp` lets the figure shrink on a narrow phone and grow
        back to the original 30px once there's room.

        The figure itself: a clamp alone can't know that "₱1,288,190" is nearly
        twice the width of "₱8,819", so a size that fits the shop's takings
        today would clip them on a very good month. Bucketing by length means
        the tile holds whatever it's given — the number stays whole, which is
        the only property that actually matters here.

        `tabular-nums` makes every digit the same width, so the figure doesn't
        jitter as it changes and its width follows its length rather than
        which digits happen to appear.
      */}
      <p
        className={`mt-2 font-display font-black leading-tight tabular-nums text-ink-950 ${sizeFor(value)}`}
      >
        {value}
      </p>
      {detail && <p className="mt-1 text-sm text-ink-800/60">{detail}</p>}
      {children}
    </div>
  );
}

/** Trend against the previous comparable period, in words as well as colour. */
export function Delta({
  now,
  before,
  label,
}: {
  now: number;
  before: number;
  label: string;
}) {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!Number.isFinite(pct) || pct === 0) return null;
  const up = pct > 0;
  return (
    <p className={`mt-1 text-sm font-bold ${up ? "text-jade-700" : "text-brand-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% {up ? "up from" : "down from"} {label}
    </p>
  );
}
