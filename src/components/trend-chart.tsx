"use client";

import { useEffect, useRef, useState } from "react";
import { pesoRound as peso } from "@/lib/peso";
import type { Direction, Point, Week } from "@/lib/forecast";

/**
 * What happened, and where it is heading.
 *
 * ── ONE SERIES, TWO STATES ───────────────────────────────────────────────
 *
 * The solid line is takings that happened; the dashed line is arithmetic. They
 * are the same measure, so they are the same colour — two colours would say
 * "two things", and the thing that matters is precisely that the second half
 * is the first half continued. Solid against dashed carries that, so the
 * distinction survives being printed, photographed or read by somebody who
 * cannot separate the hues.
 *
 * ── THE FAN IS THE HONEST PART ───────────────────────────────────────────
 *
 * A bare projected line gets believed. The two shaded bands are where the
 * week is likely to land — the narrow one half the time, the wide one four
 * times in five — and they widen with distance because that is what actually
 * happens to a forecast. A shop with six weeks of history gets a fan wide
 * enough to be useless, which is the correct thing to show it.
 *
 * ── THE LINE TAKES ITS COLOUR FROM THE ANSWER ────────────────────────────
 *
 * Green climbing, red sliding, amber for too-close-to-call. The owner's
 * question was "tumataas ba o hindi" and the colour answers it from across
 * the room. It is never the only thing saying so: the verdict is written in
 * words beside the chart, so nothing here depends on seeing colour. Only one
 * of the three is ever on screen, which is why they are not required to be
 * distinguishable from each other.
 */

const HUES: Record<Direction, { line: string; band: string; label: string }> = {
  // Contrast-checked against the cream panel: each clears 3:1 on its own,
  // which is the test that applies to a status colour used alone.
  growing: { line: "#0c8156", band: "#0c8156", label: "text-jade-700" },
  steady: { line: "#806600", band: "#806600", label: "text-gold-700" },
  slowing: { line: "#b91313", band: "#b91313", label: "text-brand-700" },
};

/**
 * The chart is drawn at its real pixel size, not scaled to fit.
 *
 * A fixed viewBox scaled down to a 390px phone shrinks everything inside it
 * by the same factor — so a 10px axis label became 4px and the whole chart
 * collapsed to about a centimetre tall. This is a shop run from a phone on a
 * counter, so that is the screen that matters most.
 *
 * Measuring the container and drawing at that width instead keeps one CSS
 * pixel equal to one SVG unit: the strokes stay 2px, the labels stay legible,
 * and only the number of weeks across the axis changes.
 */
const PHONE = 520;
const FALLBACK_W = 760;

/** Taller where there is room for it; a long series needs the height to read. */
const heightFor = (w: number) => (w < PHONE ? 230 : 280);

/** Roomier on a phone, where the chart is short and the labels are the risk. */
const padFor = (w: number) =>
  w < PHONE
    ? { top: 14, right: 12, bottom: 24, left: 46 }
    : { top: 16, right: 16, bottom: 26, left: 56 };

/**
 * Axis ticks on round numbers.
 *
 * Quarters of whatever the tallest week happened to be gives ₱47,891 /
 * ₱35,918 / ₱23,945 — numbers nobody can hold in their head or compare
 * against. A tick is only useful if it is a figure the reader already thinks
 * in, so the scale is rounded UP to a clean step and the top of the chart
 * moves to suit, rather than the other way round.
 */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  // Five intervals rather than four. With four, a shop topping out at ₱45,000
  // rounds up to a ₱60,000 axis and spends the top third of the chart empty,
  // which flattens the very line the panel exists to show.
  const target = 5;
  const raw = max / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

type Spot = {
  x: number;
  y: number;
  label: string;
  value: number;
  future: boolean;
  lo?: number;
  hi?: number;
};

/** "5 Jan" — short enough for an axis, unambiguous across a year boundary. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-PH", { month: "short", timeZone: "UTC" })}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TrendChart({
  weeks,
  forecast,
  direction,
}: {
  weeks: Week[];
  forecast: Point[];
  direction: Direction;
}) {
  const [at, setAt] = useState<number | null>(null);
  const [width, setWidth] = useState(FALLBACK_W);
  const box = useRef<HTMLDivElement>(null);
  const hue = HUES[direction];

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const W = width;
  const H = heightFor(W);
  const PAD = padFor(W);
  const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

  const lastWeek = weeks[weeks.length - 1]?.weekStart ?? "";
  const total = weeks.length + forecast.length;

  // One scale for everything drawn, so a mark's height always means the same
  // number of pesos — including the top of the fan, which is the easiest
  // thing to forget and the one that makes a chart lie.
  const { top, ticks } = niceScale(
    Math.max(...weeks.map((w) => w.revenue), ...forecast.map((f) => f.hi80), 1)
  );

  const xAt = (i: number) => PAD.left + (i / Math.max(1, total - 1)) * PLOT.w;
  const yAt = (v: number) => PAD.top + PLOT.h - (v / top) * PLOT.h;

  const spots: Spot[] = [
    ...weeks.map((w, i) => ({
      x: xAt(i),
      y: yAt(w.revenue),
      label: shortDate(w.weekStart),
      value: w.revenue,
      future: false,
    })),
    ...forecast.map((f, i) => ({
      x: xAt(weeks.length + i),
      y: yAt(f.mean),
      label: shortDate(addDays(lastWeek, (i + 1) * 7)),
      value: f.mean,
      future: true,
      lo: f.lo80,
      hi: f.hi80,
    })),
  ];

  const line = (from: Spot[]) =>
    from.map((s, i) => `${i === 0 ? "M" : "L"}${s.x.toFixed(1)} ${s.y.toFixed(1)}`).join(" ");

  /** A closed ribbon between two bounds of the forecast. */
  const band = (lo: (f: Point) => number, hi: (f: Point) => number) => {
    if (forecast.length === 0) return "";
    // Anchored at the last real week so the fan grows out of the line rather
    // than starting beside it with a visible step.
    const startX = xAt(weeks.length - 1);
    const startY = yAt(weeks[weeks.length - 1].revenue);
    const upper = forecast
      .map((f, i) => `L${xAt(weeks.length + i).toFixed(1)} ${yAt(hi(f)).toFixed(1)}`)
      .join(" ");
    const lower = [...forecast]
      .map((f, i) => ({ f, i }))
      .reverse()
      .map(({ f, i }) => `L${xAt(weeks.length + i).toFixed(1)} ${yAt(lo(f)).toFixed(1)}`)
      .join(" ");
    return `M${startX.toFixed(1)} ${startY.toFixed(1)} ${upper} ${lower} Z`;
  };

  const past = spots.filter((s) => !s.future);
  const ahead = spots.filter((s) => s.future);
  // The projection is joined to the last real week, so the eye reads one line
  // continuing rather than two lines that happen to be near each other.
  const aheadPath = past.length > 0 ? [past[past.length - 1], ...ahead] : ahead;

  const end = ahead[ahead.length - 1] ?? past[past.length - 1];
  const hovered = at === null ? null : spots[at];

  // As many date labels as the width can hold without them touching: about
  // 80px each once they are "23 Feb".
  const step = Math.max(1, Math.ceil(total / Math.max(3, Math.floor(PLOT.w / 80))));

  return (
    <figure className="m-0">
      {/* Measured, not guessed — see the note on `H` above. The ref sits on a
          plain div so the observer reads the layout width even before the
          SVG inside it has been given one. */}
      <div className="relative" ref={box}>
        {total < 2 ? null : (
        <>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={
            `Weekly takings for the last ${weeks.length} weeks` +
            (forecast.length > 0
              ? `, then a ${forecast.length}-week projection ending near ${peso(end?.value ?? 0)} a week.`
              : ".")
          }
          onMouseLeave={() => setAt(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - box.left) / box.width) * W;
            const i = Math.round(((x - PAD.left) / PLOT.w) * (total - 1));
            setAt(i >= 0 && i < total ? i : null);
          }}
        >
          {/* Hairline, solid, one step off the surface — present but never
              competing with the data. */}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yAt(v)}
                y2={yAt(v)}
                stroke="#120a08"
                strokeOpacity={0.08}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={yAt(v) + 3.5}
                textAnchor="end"
                className="fill-ink-800/50 text-[10px] font-semibold"
              >
                {peso(v)}
              </text>
            </g>
          ))}

          {forecast.length > 0 && (
            <>
              <path d={band((f) => f.lo80, (f) => f.hi80)} fill={hue.band} fillOpacity={0.1} />
              <path d={band((f) => f.lo50, (f) => f.hi50)} fill={hue.band} fillOpacity={0.14} />
            </>
          )}

          {/* Where the record stops and the arithmetic starts. */}
          {forecast.length > 0 && past.length > 0 && (
            <line
              x1={past[past.length - 1].x}
              x2={past[past.length - 1].x}
              y1={PAD.top}
              y2={PAD.top + PLOT.h}
              stroke="#120a08"
              strokeOpacity={0.25}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          <path
            d={line(past)}
            fill="none"
            stroke={hue.line}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {forecast.length > 0 && (
            <path
              d={line(aheadPath)}
              fill="none"
              stroke={hue.line}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="5 5"
              strokeOpacity={0.9}
            />
          )}

          {/* Markers only where the weeks are few enough to see them. */}
          {past.length <= 18 &&
            past.map((s) => (
              <circle
                key={s.label}
                cx={s.x}
                cy={s.y}
                r={3}
                fill={hue.line}
                stroke="#fdf1e0"
                strokeWidth={2}
              />
            ))}

          {/* The endpoint, direct-labelled — the one number on the chart. */}
          {end && (
            <>
              <circle
                cx={end.x}
                cy={end.y}
                r={4.5}
                fill={hue.line}
                stroke="#fdf1e0"
                strokeWidth={2}
              />
              <text
                x={Math.min(end.x + 8, W - PAD.right)}
                y={Math.max(end.y - 8, PAD.top + 10)}
                textAnchor={end.x > W - 110 ? "end" : "start"}
                className="fill-ink-950 text-[11px] font-black"
              >
                {peso(end.value)}
              </text>
            </>
          )}

          {hovered && (
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD.top}
              y2={PAD.top + PLOT.h}
              stroke="#120a08"
              strokeOpacity={0.3}
              strokeWidth={1}
            />
          )}

          {spots
            .filter((_, i) => i % step === 0 || i === total - 1)
            .map((s) => (
              <text
                key={`x-${s.label}`}
                x={s.x}
                y={H - 8}
                textAnchor="middle"
                className="fill-ink-800/45 text-[9px] font-semibold"
              >
                {s.label}
              </text>
            ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-ink-950 px-2.5 py-1.5 text-[11px] font-bold text-cream-50 shadow-lg"
            style={{
              left: `${(hovered.x / W) * 100}%`,
              top: `${(hovered.y / H) * 100}%`,
            }}
          >
            <span className="block whitespace-nowrap">
              {hovered.future ? "Week of " : ""}
              {hovered.label}
            </span>
            <span className="block whitespace-nowrap font-black">
              {peso(hovered.value)}
              {hovered.future && " est."}
            </span>
            {hovered.future && hovered.lo !== undefined && (
              <span className="block whitespace-nowrap font-semibold opacity-70">
                likely {peso(hovered.lo)}–{peso(hovered.hi ?? 0)}
              </span>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* The key. A single measure needs no legend, but the dashes and the
          shading are not self-explaining, and the band is the honest part. */}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-ink-800/60">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke={hue.line} strokeWidth="2" />
          </svg>
          What you took
        </span>
        {forecast.length > 0 && (
          <>
            <span className="flex items-center gap-1.5">
              <svg width="18" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  stroke={hue.line}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
              If nothing changes
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-4 rounded-sm"
                style={{ backgroundColor: hue.band, opacity: 0.14 }}
                aria-hidden="true"
              />
              Where a week is likely to land
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
