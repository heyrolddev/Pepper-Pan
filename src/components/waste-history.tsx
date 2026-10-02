"use client";

import { useEffect, useState, useTransition } from "react";
import { RankedBars, type Bar } from "@/components/admin-charts";
import { peso, pesoRound } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import {
  KIND_LABEL,
  PRESET_LABEL,
  byDay,
  normaliseRange,
  preset,
  rangeDays,
  totals,
  worstOffenders,
  type PresetId,
  type Range,
  type WasteRow,
} from "@/lib/waste-history";
import { readWasteHistory } from "@/app/admin/inventory/waste-history-actions";

/**
 * What went in the bin, over a stretch of days.
 *
 * ── Why the two figures never become one ─────────────────────────────────
 *
 * Spoilage and staff meals both cost money and only one of them is a
 * problem. The logging form has always made you choose between them before
 * you can type a line — and then every reader in the system blended them
 * back into a single "waste" number. That number is either an unfair
 * indictment of the kitchen or a hiding place for real spoilage, depending
 * which way the mix runs, so this screen never shows it. Spoilage is in the
 * brand red, staff meals are in ordinary ink, and they sit side by side.
 *
 * ── Why the ranked list is the point ─────────────────────────────────────
 *
 * "₱1,400 of waste this month" is a number to wince at. "The pork, four
 * times, ₱900 of it" is a thing to do something about on Monday. The totals
 * are the headline; the ranking is the only part anybody can act on.
 *
 * ── Why it loads on demand ───────────────────────────────────────────────
 *
 * The range changes without the page doing. Re-reading all of Inventory —
 * every shelf, every batch, every costing — to answer a question about the
 * bin would be a second and a half of waiting for nothing.
 */
export function WasteHistory({ today }: { today: string }) {
  const [chosen, setChosen] = useState<PresetId>("week");
  const [range, setRange] = useState<Range>(() => preset("week", today));
  const [rows, setRows] = useState<WasteRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  // Custom-range fields, kept apart from `range` so a half-typed date never
  // fires a read against a year that does not exist yet.
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  useEffect(() => {
    let live = true;
    startBusy(async () => {
      const r = await readWasteHistory({ from: range.from, to: range.to });
      if (!live) return;
      setRows(r.rows);
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
  const sum = totals(list, days);
  const groups = byDay(list);
  const worst: Bar[] = worstOffenders(list).map((w) => ({
    label: w.name,
    value: w.cost,
    caption: `${w.times}×`,
  }));

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
          <span
            aria-hidden
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              chosen === "custom"
                ? "bg-ink-950 text-cream-50"
                : "bg-cream-100 text-ink-800/40 ring-1 ring-ink-950/10"
            }`}
          >
            Pick the days
          </span>
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

      {/* ── the two figures, never blended ──────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-700">
            Spoiled, spilt, binned
          </p>
          <p className="mt-1 font-display text-2xl font-black tabular-nums text-ink-950 sm:text-3xl">
            {busy && rows === null ? "—" : pesoRound(sum.spoiled)}
          </p>
          <p className="mt-0.5 text-xs text-ink-800/55">
            {days === 1
              ? "on this day"
              : `over ${days} days · ${pesoRound(sum.spoiledPerDay)} a day`}
          </p>
        </div>
        <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
            Staff meals &amp; samples
          </p>
          <p className="mt-1 font-display text-2xl font-black tabular-nums text-ink-950 sm:text-3xl">
            {busy && rows === null ? "—" : pesoRound(sum.internal)}
          </p>
          <p className="mt-0.5 text-xs text-ink-800/55">
            A cost, and not a fault — kept apart on purpose.
          </p>
        </div>
      </div>

      {truncated && (
        <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-gold-500/35">
          <strong className="text-ink-950">More than 500 lines in this range.</strong>{" "}
          Only the newest 500 are shown and the figures above cover only those.
          Pick a shorter stretch for a total you can rely on.
        </p>
      )}

      {/* ── what to do something about ──────────────────────────────── */}
      {worst.length > 0 && (
        <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
            What cost the most
          </p>
          <p className="mb-3 mt-0.5 text-xs text-ink-800/55">
            Spoilage only. Staff meals are left out — they are not a leak.
          </p>
          <RankedBars
            data={worst}
            hue="money"
            format="peso"
            suffix={(r) => ` · ${r.caption ?? ""}`}
          />
        </div>
      )}

      {/* ── every line, by day ──────────────────────────────────────── */}
      {rows === null ? (
        <p className="text-sm text-ink-800/50">Reading the log…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 px-5 py-6 text-sm text-ink-800/65">
          Nothing was logged in these days. That is either a clean stretch or a
          stretch nobody logged — and the difference matters, so it is worth
          knowing which.
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
                  {g.spoiled > 0 && (
                    <span className="text-brand-700">{pesoRound(g.spoiled)} spoiled</span>
                  )}
                  {g.spoiled > 0 && g.internal > 0 && (
                    <span className="mx-1.5 text-ink-800/25">·</span>
                  )}
                  {g.internal > 0 && <span>{pesoRound(g.internal)} staff</span>}
                </p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-2.5 ring-1 ring-ink-950/[0.07]"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-ink-950">{r.name}</span>
                        {r.kind && (
                          <span className="rounded-md bg-ink-950/[0.06] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/45">
                            {KIND_LABEL[r.kind]}
                          </span>
                        )}
                        {r.category === "internal" && (
                          <span className="rounded-md bg-jade-600/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-jade-700">
                            Not spoilage
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-ink-800/60">
                        {r.qty.toLocaleString("en-PH")} {r.unit ?? ""}
                        {r.reason ? ` · ${r.reason}` : ""}
                        {r.loggedBy ? ` · ${r.loggedBy}` : ""}
                      </span>
                      {r.note && (
                        <span className="text-xs italic text-ink-800/45">{r.note}</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 font-display text-sm font-black tabular-nums ${
                        r.category === "internal" ? "text-ink-800/60" : "text-brand-700"
                      }`}
                    >
                      {peso(r.cost)}
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
