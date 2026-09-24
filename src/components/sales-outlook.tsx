"use client";

import { useState } from "react";
import { TrendChart } from "@/components/trend-chart";
import { pesoRound as peso } from "@/lib/peso";
import {
  MIN_WEEKS,
  monthlyFrom,
  weeksFor,
  type Direction,
  type Point,
  type Week,
} from "@/lib/forecast";

/**
 * "Is it growing or not?" — answered in a sentence, then shown.
 *
 * The verdict leads and the chart supports it, rather than the other way
 * round. A line going up is only news if it is going up by more than the
 * weeks wobble, and reading that off a picture is exactly the judgement
 * people get wrong — which is why the sentence is computed and printed
 * instead of left to the eye.
 *
 * Both horizons come down from the server together, because the six-month
 * projection IS the first half of the twelve-month one. Switching views is
 * a slice, not a round trip.
 */

const VERDICT: Record<
  Direction,
  { word: string; chip: string; dot: string; line: (a: string, b: string) => string }
> = {
  growing: {
    word: "Growing",
    chip: "bg-jade-600 text-cream-50",
    dot: "bg-jade-300",
    line: (a, b) =>
      `Takings are climbing by more than the week-to-week wobble. At this rate you'd be trading around ${b} a month instead of ${a}.`,
  },
  steady: {
    word: "Holding steady",
    chip: "bg-gold-400 text-ink-950",
    dot: "bg-ink-950/40",
    line: (a) =>
      `Up some weeks, down others, and nothing yet that is bigger than the wobble. The business is holding at about ${a} a month — which is not the same as saying it will stay there.`,
  },
  slowing: {
    word: "Slowing",
    chip: "bg-brand-600 text-cream-50",
    dot: "bg-brand-200",
    line: (a, b) =>
      `Takings are falling by more than the week-to-week wobble. Left alone, that is about ${b} a month instead of ${a}.`,
  },
};

export function SalesOutlook({
  weeks,
  forecast,
  direction,
}: {
  weeks: Week[];
  /** The full twelve months. The shorter view is its own first half. */
  forecast: Point[];
  direction: Direction;
}) {
  const [months, setMonths] = useState<6 | 12>(6);

  if (weeks.length < MIN_WEEKS || forecast.length === 0) {
    return <NotYet weeks={weeks} />;
  }

  const shown = forecast.slice(0, weeksFor(months));
  const now = weeks[weeks.length - 1].revenue;
  const then = shown[shown.length - 1]?.mean ?? now;
  const v = VERDICT[direction];

  // The width of the band at the far end, said in months rather than weeks —
  // the figure the owner would otherwise read off the dashed line alone.
  const end = shown[shown.length - 1];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${v.chip}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden="true" />
            {v.word}
          </span>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-800/75">
            {v.line(peso(monthlyFrom(now)), peso(monthlyFrom(then)))}
          </p>
        </div>

        <div
          className="flex shrink-0 rounded-xl bg-ink-950/5 p-1"
          role="group"
          aria-label="How far ahead to project"
        >
          {([6, 12] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              aria-pressed={months === m}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${
                months === m
                  ? "bg-ink-950 text-gold-400"
                  : "text-ink-800/60 hover:text-ink-950"
              }`}
            >
              {m} months
            </button>
          ))}
        </div>
      </div>

      <TrendChart weeks={weeks} forecast={shown} direction={direction} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="A week now" value={peso(now)} note="Last completed week" />
        <Figure
          label={`A week in ${months} months`}
          value={peso(then)}
          note={end ? `likely ${peso(end.lo80)}–${peso(end.hi80)}` : ""}
        />
        <Figure
          label={`A month in ${months} months`}
          value={peso(monthlyFrom(then))}
          note={`now ${peso(monthlyFrom(now))}`}
        />
      </div>

      {/* Said plainly, because a projection this far out invites more faith
          than it has earned — and the owner cannot see how much history is
          behind the line by looking at it. */}
      <p className="rounded-2xl bg-cream-50 px-4 py-3 text-xs leading-relaxed text-ink-800/60 ring-1 ring-ink-950/10">
        Drawn from{" "}
        <strong className="text-ink-950">{weeks.length} completed weeks</strong>.
        This is what today&apos;s trend carries on to — not a promise. A fiesta,
        a new stall across the road or a month of rain moves it, and none of
        those are in here. The further right you look, the wider the shaded
        band gets, and that width is the honest part of the picture.
      </p>
    </div>
  );
}

/**
 * Not enough trading yet — and it says so instead of drawing a line.
 *
 * Two weeks of a new stall contain no information about next year. Software
 * that projects anyway is not being helpful; it is being confident, which is
 * the one thing a forecast must not be without cause.
 */
function NotYet({ weeks }: { weeks: Week[] }) {
  const need = MIN_WEEKS - weeks.length;
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-50 p-5 text-sm leading-relaxed text-ink-800/75">
        <strong className="text-ink-950">Not enough trading yet to call it.</strong>{" "}
        {weeks.length === 0
          ? "There are no completed weeks of sales on the books."
          : `There ${weeks.length === 1 ? "is" : "are"} ${weeks.length} completed week${
              weeks.length === 1 ? "" : "s"
            } — ${need} more and this will start projecting.`}{" "}
        A trend drawn through a handful of weeks says whatever the last good
        Saturday said, so this waits rather than guessing.
      </p>
      {weeks.length > 1 && (
        <TrendChart weeks={weeks} forecast={[]} direction="steady" />
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl bg-cream-50 px-4 py-3 ring-1 ring-ink-950/10">
      <p className="text-[11px] font-black uppercase tracking-widest text-ink-800/50">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-black tabular-nums text-ink-950">
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-ink-800/55">{note}</p>}
    </div>
  );
}
