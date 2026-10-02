"use client";

import { useEffect, useState, useTransition } from "react";
import { RankedBars, type Bar } from "@/components/admin-charts";
import { peso, pesoRound } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import {
  PRESET_LABEL,
  normaliseRange,
  preset,
  rangeDays,
  type PresetId,
  type Range,
} from "@/lib/day-range";
import {
  accuracy,
  accuracyLine,
  accuracyState,
  byDay,
  worstShelves,
  type AccuracyState,
  type CountRow,
} from "@/lib/stock-accuracy";
import { readStockAccuracy } from "@/app/admin/inventory/stock-accuracy-actions";

/**
 * What the counts say is missing.
 *
 * The data behind this screen has been written on every recount since the
 * first migration and read by nothing — one insert, two deletes in Reset, a
 * line each in backup and restore, and no reader at all. The shop's whole
 * record of stock going missing accumulated where nobody could look at it.
 *
 * ── Short and over sit apart ─────────────────────────────────────────────
 *
 * Counting LESS than expected is loss. Counting MORE is not a windfall: it
 * means a recipe takes off more than the dish really uses, or a delivery was
 * logged twice. Netting them off would let two faults cancel into a tidy
 * zero, so they never share a figure.
 *
 * ── A number with a denominator ──────────────────────────────────────────
 *
 * ₱900 of shrinkage is nothing on ₱90,000 of trade and serious on ₱9,000, so
 * the headline is judged against what the shop sold in the same days. The
 * bands are the ones a food business actually uses — under 1%, 1–3%, over 3%
 * — and the verdict is written in words beside the colour, never carried by
 * the colour alone.
 */

const STATE: Record<AccuracyState, { ink: string; fill: string; word: string }> = {
  // Measured against this panel's own surfaces, not chosen: every ink clears
  // 4.5:1 on the cream panel, every fill clears 3:1 on the cream-200 track.
  none: { ink: "text-ink-800/70", fill: "bg-ink-950/25", word: "Nothing counted" },
  fine: { ink: "text-jade-700", fill: "bg-jade-600", word: "Normal handling" },
  watch: { ink: "text-gold-700", fill: "bg-gold-700", word: "Worth chasing" },
  serious: { ink: "text-brand-700", fill: "bg-brand-600", word: "Too much" },
};

export function StockAccuracy({ today }: { today: string }) {
  const [chosen, setChosen] = useState<PresetId>("month");
  const [range, setRange] = useState<Range>(() => preset("month", today));
  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [unreadable, setUnreadable] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  useEffect(() => {
    let live = true;
    startBusy(async () => {
      const r = await readStockAccuracy({ from: range.from, to: range.to });
      if (!live) return;
      setRows(r.rows);
      setRevenue(r.revenue);
      setUnreadable(r.unreadable);
      setTruncated(r.truncated);
      setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [range.from, range.to]);

  function pick(id: Exclude<PresetId, "custom">) {
    const r = preset(id, today);
    setChosen(id);
    setRange(r);
    setFrom(r.from);
    setTo(r.to);
  }

  function applyCustom() {
    if (!from || !to) return;
    const r = normaliseRange(from, to);
    setChosen("custom");
    setRange(r);
    setFrom(r.from);
    setTo(r.to);
  }

  const list = rows ?? [];
  const days = rangeDays(range);
  const sum = accuracy(list, days);
  const state = accuracyState(sum, revenue);
  const tone = STATE[state];
  const groups = byDay(list);
  const worst: Bar[] = worstShelves(list).map((w) => ({
    label: w.name,
    value: w.short,
    caption: `${w.times}×`,
  }));
  const share = revenue && revenue > 0 ? (sum.short / revenue) * 100 : null;

  return (
    <div className="flex flex-col gap-5">
      {/* ── which days ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PRESET_LABEL) as Exclude<PresetId, "custom">[]).map((id) => (
            <button
              key={id}
              onClick={() => pick(id)}
              aria-pressed={chosen === id}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                chosen === id
                  ? "bg-ink-950 text-cream-50"
                  : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-50"
              }`}
            >
              {PRESET_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
              From
            </span>
            <input
              type="date"
              value={from}
              max={today}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl bg-cream-100 px-3 py-2.5 text-sm tabular-nums text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-brand-600"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
              To
            </span>
            <input
              type="date"
              value={to}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl bg-cream-100 px-3 py-2.5 text-sm tabular-nums text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-brand-600"
            />
          </label>
          <button
            onClick={applyCustom}
            disabled={busy || !from || !to}
            className="rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800 disabled:opacity-40"
          >
            Show
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-600/10 px-4 py-3 text-sm font-bold text-brand-700 ring-1 ring-brand-600/25">
          {error}
        </p>
      )}

      {/* ── the headline ────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Short on the shelf
          </p>
          <p className={`text-[11px] font-black uppercase tracking-widest ${tone.ink}`}>
            {tone.word}
          </p>
        </div>

        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span className="font-display text-4xl font-black leading-none tabular-nums text-ink-950 sm:text-5xl">
            {busy && rows === null ? "—" : pesoRound(sum.short)}
          </span>
          <span className="text-sm font-bold text-ink-800/60">
            {share === null
              ? days === 1
                ? "on this day"
                : `over ${days} days`
              : `${share >= 10 ? share.toFixed(0) : share.toFixed(1)}% of what you sold`}
          </span>
        </p>

        {/* The share of sales as a meter, because a percentage is only
            meaningful against the band it falls in. Capped at the 5% mark —
            past that the bar is full and the sentence does the talking. */}
        {share !== null && sum.short > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-cream-200">
              <span
                className={`h-full rounded-full transition-[width] duration-500 ${tone.fill}`}
                style={{ width: `${Math.min(Math.max((share / 5) * 100, 2), 100)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] font-bold tabular-nums text-ink-800/50">
              <span>1% ordinary</span>
              <span>3% chase it</span>
              <span>5%+</span>
            </div>
          </div>
        )}

        <p className="mt-3 text-sm leading-relaxed text-ink-800/75">
          {accuracyLine(sum, revenue)}
        </p>

        {/* Counting MORE is a separate fault with a separate fix, so it gets
            its own line rather than being folded into the figure above. */}
        {sum.over > 0 && (
          <p className="mt-2 rounded-2xl bg-cream-50 px-4 py-2.5 text-sm leading-relaxed text-ink-800/70 ring-1 ring-ink-950/[0.07]">
            <strong className="text-ink-950">{pesoRound(sum.over)} came up OVER</strong> on{" "}
            {sum.overCount} count{sum.overCount === 1 ? "" : "s"} — kept separate because it
            is not a windfall. It usually means a recipe takes off more than the dish really
            uses, or a delivery was logged twice.
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-ink-800/45">
          {sum.count} count{sum.count === 1 ? "" : "s"} in these days · {sum.shortCount} short
          · {sum.overCount} over · {sum.exactCount} exact
        </p>
      </div>

      {/* Said plainly rather than left for somebody to discover. */}
      <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-gold-500/35">
        <strong className="text-ink-950">This is not yet in your profit or break-even.</strong>{" "}
        Waste is counted in both; a shelf that simply comes up short is counted in neither, so
        the figures on the Money screen read better than the truth by about this much. Worth
        seeing the size of it before those numbers are changed.
      </p>

      {truncated && (
        <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-gold-500/35">
          <strong className="text-ink-950">More than 500 counts in this range.</strong> Only
          the newest 500 are shown and the figures cover only those. Pick a shorter stretch
          for a total you can rely on.
        </p>
      )}

      {unreadable > 0 && (
        <p className="text-xs text-ink-800/45">
          {unreadable} older count{unreadable === 1 ? "" : "s"} could not be read and{" "}
          {unreadable === 1 ? "is" : "are"} left out of every figure above.
        </p>
      )}

      {/* ── which shelf keeps going short ───────────────────────────── */}
      {worst.length > 0 && (
        <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
            Which shelf keeps going short
          </p>
          <p className="mb-3 mt-0.5 text-xs text-ink-800/55">
            Short counts only. A shelf that comes up over is a different fault and is left
            out.
          </p>
          <RankedBars
            data={worst}
            hue="money"
            format="peso"
            suffix={(r) => ` · ${r.caption ?? ""}`}
          />
        </div>
      )}

      {/* ── every count ─────────────────────────────────────────────── */}
      {rows === null ? (
        <p className="text-sm text-ink-800/50">Reading the counts…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 px-5 py-6 text-sm text-ink-800/65">
          No shelf was recounted in these days. That is not the same as nothing being
          missing — a shelf nobody counts cannot be found short.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.date} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-xs font-black uppercase tracking-widest text-ink-800/55">
                  {formatDate(g.date)}
                </p>
                <p className="text-xs font-bold tabular-nums text-ink-800/55">
                  {g.short > 0 && (
                    <span className="text-brand-700">{pesoRound(g.short)} short</span>
                  )}
                  {g.short > 0 && g.over > 0 && <span className="mx-1.5 text-ink-800/25">·</span>}
                  {g.over > 0 && <span className="text-jade-700">{pesoRound(g.over)} over</span>}
                </p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-2.5 ring-1 ring-ink-950/[0.07]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-bold text-ink-950">{r.name}</span>
                      {/* The two quantities, so the row can be argued with
                          rather than merely believed. */}
                      <span className="text-xs tabular-nums text-ink-800/60">
                        system {r.systemQty.toLocaleString("en-PH")} · counted{" "}
                        {r.countedQty.toLocaleString("en-PH")} ·{" "}
                        <span
                          className={
                            r.variance < 0
                              ? "font-bold text-brand-700"
                              : r.variance > 0
                                ? "font-bold text-jade-700"
                                : ""
                          }
                        >
                          {r.variance > 0 ? "+" : ""}
                          {r.variance.toLocaleString("en-PH")}
                        </span>
                      </span>
                      {r.note && (
                        <span className="text-xs italic text-ink-800/45">{r.note}</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 font-display text-sm font-black tabular-nums ${
                        r.variance < 0
                          ? "text-brand-700"
                          : r.variance > 0
                            ? "text-jade-700"
                            : "text-ink-800/45"
                      }`}
                    >
                      {r.variance === 0 ? "—" : peso(Math.abs(r.valueImpact))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
