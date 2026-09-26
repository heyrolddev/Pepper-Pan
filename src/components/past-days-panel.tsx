"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePastDays } from "@/app/admin/analytics/past-days-actions";
import {
  MAX_COST_PCT,
  MIN_COST_PCT,
  daysBetween,
  planPastDays,
  toIso,
  type PastDayInput,
} from "@/lib/past-days";
import { peso } from "@/lib/peso";

const input =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

/**
 * Typing in the days the shop traded before it had this till.
 *
 * The stall ran for months on a notebook. Those takings are real and the
 * system knows nothing about them — which is why the trend above has so
 * little to draw and the forecast will not speak for six weeks.
 *
 * The screen is built around what a notebook actually holds: a date and a
 * day's takings. Not tickets — nobody is retyping forty of those — so one
 * entry carries a whole day, and the panel says outright which figures that
 * makes right and which it does not. The alternative is the owner finding out
 * later that "orders this month" is a number they cannot explain.
 */
export function PastDaysPanel({
  suggestedCostPct,
  alreadyTyped,
}: {
  /** What the shop's food cost is actually running at, or null. */
  suggestedCostPct: number | null;
  /** How many past days have been entered already. */
  alreadyTyped: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [costPct, setCostPct] = useState(
    suggestedCostPct === null ? "" : String(suggestedCostPct)
  );
  const [rows, setRows] = useState<PastDayInput[]>([{ date: "", takings: null }]);

  // From and to for the "lay out a stretch of days" helper.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const plan = useMemo(
    () => planPastDays(rows, Number(costPct)),
    [rows, costPct]
  );

  const setRow = (i: number, patch: Partial<PastDayInput>) =>
    setRows((list) => list.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  function layOut() {
    const days = daysBetween(from, to);
    if (days.length === 0) return;
    setRows((list) => {
      const had = new Map(list.filter((r) => r.date).map((r) => [r.date, r]));
      // Anything already typed keeps its takings — laying out a stretch is
      // for the dates, not a reason to lose what is in the boxes.
      return days.map((d) => had.get(d) ?? { date: d, takings: null });
    });
  }

  function save() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await savePastDays({ days: rows, costPct: Number(costPct) });
      if (r.error) return setError(r.error);
      setDone(
        `${r.saved} day${r.saved === 1 ? "" : "s"} added — ${peso(r.total ?? 0)} of takings.`
      );
      setRows([{ date: "", takings: null }]);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-ink-950/15 p-4 text-left transition-colors hover:border-ink-950/30 hover:bg-cream-100"
      >
        <span className="font-display text-base font-black text-ink-950">
          Traded before you had this till?
        </span>
        <span className="mt-0.5 block text-sm text-ink-800/60">
          {alreadyTyped > 0
            ? `${alreadyTyped} past day${alreadyTyped === 1 ? "" : "s"} entered so far. Add more.`
            : "Type in the old days from your notebook and the line above has something to draw — the forecast needs six full weeks before it will say anything."}
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      {/* Relative, with Close pinned: at phone width the description takes
          the full line and a wrapped "Close" underneath reads as a stray
          button rather than the way out of the panel. */}
      <div className="relative">
        <div className="min-w-0 pr-16">
          <p className="font-display text-base font-black text-ink-950">
            Days before the till
          </p>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-800/60">
            One line per day, straight off the notebook. This does{" "}
            <strong className="font-bold text-ink-900">not</strong> touch your
            stock — the food was eaten back then, and the shelf you have today
            is right.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="absolute right-0 top-0 rounded-full bg-ink-950/5 px-3 py-1.5 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10 hover:text-ink-950"
        >
          Close
        </button>
      </div>

      {/* The cost, asked once. A shop knows roughly what its food costs; it
          does not know what last Tuesday's specifically did. */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-ink-800/70">
            Food cost (%)
          </span>
          <input
            value={costPct}
            onChange={(e) => setCostPct(e.target.value)}
            type="number"
            min={MIN_COST_PCT}
            max={MAX_COST_PCT}
            step="0.1"
            inputMode="decimal"
            placeholder="38"
            className={`${input} w-28`}
          />
        </label>
        <p className="mb-2 max-w-md text-xs text-ink-800/55">
          {suggestedCostPct !== null
            ? `You're running at about ${suggestedCostPct}% now — change it if the old days were different.`
            : "Roughly what share of a day's takings goes on ingredients."}{" "}
          Without this, every one of these days would read as pure profit.
        </p>
      </div>

      {/* Laying out a stretch, so a fortnight is two dates and not fourteen. */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-ink-800/70">From</span>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            max={toIso(new Date())}
            className={`${input} w-40`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-ink-800/70">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            type="date"
            max={toIso(new Date())}
            className={`${input} w-40`}
          />
        </label>
        <button
          onClick={layOut}
          disabled={!from || !to}
          className="mb-0.5 rounded-xl bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800 transition-colors hover:bg-ink-950/10 disabled:opacity-40"
        >
          Lay out these days
        </button>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              value={r.date}
              onChange={(e) => setRow(i, { date: e.target.value })}
              type="date"
              max={toIso(new Date())}
              className={`${input} w-40`}
            />
            <input
              value={r.takings ?? ""}
              onChange={(e) =>
                setRow(i, {
                  takings: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="Takings"
              className={`${input} w-36`}
            />
            {rows.length > 1 && (
              <button
                onClick={() => setRows((l) => l.filter((_, n) => n !== i))}
                aria-label="Remove this day"
                className="shrink-0 rounded-full px-2 py-1 text-xs font-bold text-ink-800/40 hover:bg-brand-50 hover:text-brand-600"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        onClick={() => setRows((l) => [...l, { date: "", takings: null }])}
        className="mt-2 text-xs font-bold text-ink-800/60 underline decoration-dotted underline-offset-2 hover:text-ink-950"
      >
        + Another day
      </button>

      {/* Never saves in silence. A screen that quietly takes nine rows of ten
          teaches the owner to distrust the total afterwards. */}
      {plan.problems.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {plan.problems.map((p, i) => (
            <li key={i} className="text-xs font-semibold text-brand-700">
              {p.date || "A row"}: {p.why}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 pt-3">
        <p className="text-sm text-ink-800/70">
          {plan.rows.length === 0 ? (
            "Nothing to add yet."
          ) : (
            <>
              <strong className="font-black text-ink-950">
                {plan.rows.length} day{plan.rows.length === 1 ? "" : "s"}
              </strong>
              , {peso(plan.total)} of takings
              {plan.rows.length > 0 && (
                <span className="text-ink-800/50">
                  {" "}
                  · {peso(plan.rows.reduce((s, r) => s + r.cogs, 0))} of that on
                  ingredients
                </span>
              )}
            </>
          )}
        </p>
        <button
          onClick={save}
          disabled={pending || plan.rows.length === 0}
          className="rounded-full bg-ink-950 px-5 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add these days"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm font-semibold text-brand-700">{error}</p>
      )}
      {done && (
        <p className="mt-2 text-sm font-semibold text-jade-700">{done}</p>
      )}

      {/* The one thing these rows are wrong about, said before it is found. */}
      <p className="mt-3 text-xs text-ink-800/45">
        A past day is saved as one entry, so the number of ORDERS on those
        dates reads 1. The takings, the trend and the profit are right; the
        ticket count is not.
      </p>
    </div>
  );
}
