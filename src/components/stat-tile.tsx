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

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";

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

/**
 * The first number in a tile's value, commas and all.
 *
 * A tile can read "₱12,450", "41 / 12 / 7", "4%" or "3/12" — one figure, or a
 * headline figure followed by others that are different facts. Only the first
 * one is the tile's subject; counting the rest as well turns it into a slot
 * machine.
 */
const FIRST_NUMBER = /[\d,]*\d(?:\.\d+)?/;

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

/**
 * A figure that counts up to itself.
 *
 * The point is not decoration. Eight tiles of static type all arrive at once
 * and the eye has nowhere to start; a number that moves for half a second
 * draws the eye to the figures, which is what this screen is for. It also
 * makes a changed number legible as *changed* — after a sale is recorded, the
 * takings tile counts again, so the shop can see the money land.
 *
 * Rules it follows, because an animation that breaks any of them is worse
 * than none:
 *
 *   It animates the DIGITS INSIDE the existing string, so "₱1,240" keeps its
 *   peso sign and its commas the whole way and never renders as a bare number.
 *
 *   It starts from the rendered value, so with JavaScript off or before
 *   hydration the real figure is already on screen. Nothing here is the only
 *   copy of anything.
 *
 *   It respects `prefers-reduced-motion`, and it stops. A dashboard that never
 *   settles is a dashboard nobody can read.
 */
function useCountUp(value: string, still: boolean): string {
  // `null` means "not animating — show the real value". Kept as its own state
  // rather than seeding `shown` with `value`, because the effect may then
  // never write anything, and an effect whose body calls setState to say
  // "nothing to do" is the cascading-render pattern React warns about.
  const [anim, setAnim] = useState<string | null>(null);

  // Reset the moment the figure changes, during render rather than in an
  // effect. React's documented way to adjust state when a prop changes: the
  // component re-renders immediately with the new value and the stale frame
  // is never painted.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setAnim(null);
  }

  useEffect(() => {
    if (still) return;
    // The FIRST run of digits, and only that one. Stripping every non-digit
    // from the whole string instead reads "41 / 12 / 7" as forty-one thousand
    // one hundred and twenty-seven: the tile then counts toward a number that
    // does not exist and only lands on the right one because the last frame
    // swaps the real string back in. It looked fine and was nonsense the whole
    // way — which is why this is measured frame by frame in a browser rather
    // than eyeballed.
    const first = value.match(FIRST_NUMBER)?.[0];
    const target = first ? Number(first.replace(/,/g, "")) : NaN;
    if (!Number.isFinite(target) || target === 0) return;

    const started = performance.now();
    const DURATION = 550;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / DURATION);
      // Ease out: quick to begin with, settling rather than stopping dead.
      const at = target * (1 - Math.pow(1 - t, 3));
      if (t < 1) {
        // Substituted back into the rendered string, so "₱1,240" keeps its
        // peso sign and its commas the whole way and never flashes as a bare
        // number. The same regex that found the target does the replacing, so
        // the two can't drift apart — they are one decision about which number
        // on the tile is the one that counts.
        setAnim(value.replace(FIRST_NUMBER, () => Math.round(at).toLocaleString("en-PH")));
        frame = requestAnimationFrame(tick);
      } else {
        setAnim(null);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, still]);

  // The real figure is what renders on the server and before the first frame,
  // so with JavaScript off the number is simply there. Nothing here is the
  // only copy of anything.
  return anim ?? value;
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
  const still = useReducedMotion() ?? false;
  const shown = useCountUp(value, still);
  return (
    <div
      className={`min-w-0 rounded-2xl bg-cream-100 p-5 transition-shadow hover:shadow-[0_2px_16px_-4px] hover:shadow-ink-950/15 ${RING[tone]}`}
    >
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
        {shown}
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
