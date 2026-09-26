"use client";

import { useMemo, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import { ACCOUNT_LABELS, type Account } from "@/lib/money-accounts";
import type { LedgerEntry } from "@/lib/money-server";
import {
  DAY_PREVIEW,
  daysWithMovement,
  lastDayWith,
  movementsOn,
  nextDayWith,
  shiftDay,
  tally,
} from "@/lib/pot-history";

/**
 * One pot's history, a day at a time.
 *
 * The balance on a pot is a single number with months of arithmetic behind
 * it, and the only reason to look at the history is to disagree with it: the
 * drawer is ₱300 light, so what happened yesterday. A flat list newest-first
 * answers "what happened recently", which nobody was asking — the day is the
 * unit the question comes in.
 *
 * So the dialog opens on one day, three movements deep, and the arrows move a
 * day at a time. Three because that is what fits above the fold on a phone
 * next to the day's own total, and because a pot that took forty sales does
 * not want forty rows the moment it opens — it wants the total, and then the
 * rows on request.
 *
 * The rules underneath — which day to open on, where the arrows may go, what
 * a day adds up to — are in `lib/pot-history.ts` with their tests. Every one
 * of them is a claim about the data that could be quietly wrong.
 */
/**
 * Centavos only when there are any.
 *
 * The three figures on the day's line have to add up in front of somebody:
 * in, out, and the net. Rounding the first two to whole pesos gave
 * "In ₱1,596 · Out ₱50" above a net of "+₱1,545.50" — a subtraction that is
 * visibly wrong by fifty centavos, on the one screen whose whole job is to
 * be checked against a physical count. Same rule the pa-utang rows use.
 */
function exact(n: number): string {
  return peso(n, n % 1 === 0 ? 0 : 2);
}

export function PotHistory({
  account,
  entries,
  balance,
  startedOn,
  today,
  onClose,
}: {
  account: Account;
  /** Every line on this pot, newest first. */
  entries: LedgerEntry[];
  balance: number;
  startedOn: string | null;
  /** The shop's today, as the database files a day. */
  today: string;
  onClose: () => void;
}) {
  const days = useMemo(() => daysWithMovement(entries), [entries]);
  const [day, setDay] = useState(today);
  const [deep, setDeep] = useState(false);

  const onDay = useMemo(() => movementsOn(entries, day), [entries, day]);
  const sum = useMemo(() => tally(onDay), [onDay]);
  const shown = deep ? onDay : onDay.slice(0, DAY_PREVIEW);

  const previous = lastDayWith(entries, shiftDay(day, -1));
  const next = nextDayWith(entries, day);

  const go = (to: string) => {
    setDay(to);
    setDeep(false);
  };

  return (
    <AdminDialog
      title={ACCOUNT_LABELS[account]}
      subtitle={
        startedOn
          ? `${peso(balance)} right now, counted from ${formatDate(startedOn)}.`
          : `${peso(balance)} right now.`
      }
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-4">
        {/* ---- which day ----

            The arrows skip to the next day that actually MOVED rather than
            stepping one calendar day at a time. On a stall that opens five
            days a week, a plain step means two taps on nothing every weekend,
            and the owner learns the arrows are unreliable. The date field is
            still there for a specific day somebody already has in mind. */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink-950/[0.04] p-2">
          <button
            onClick={() => previous && go(previous)}
            disabled={!previous}
            aria-label="The day before with movement"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream-50 text-sm font-black text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50 disabled:pointer-events-none disabled:opacity-25"
          >
            ‹
          </button>

          <input
            type="date"
            value={day}
            max={today}
            min={startedOn ?? undefined}
            aria-label="Which day"
            onChange={(e) => e.target.value && go(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border-2 border-ink-950/10 bg-cream-50 px-3 py-1.5 text-center text-sm font-black tabular-nums text-ink-950 outline-none focus:border-gold-400"
          />

          <button
            onClick={() => next && go(next)}
            disabled={!next}
            aria-label="The next day with movement"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream-50 text-sm font-black text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50 disabled:pointer-events-none disabled:opacity-25"
          >
            ›
          </button>
        </div>

        <p className="-mt-2 text-center text-sm font-bold text-ink-800/60">
          {formatDate(day)}
          {day === today && <span className="ml-2 text-ink-800/35">· today</span>}
        </p>

        {/* ---- the day ---- */}
        {onDay.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-ink-950/15 p-5 text-center">
            <p className="text-sm text-ink-800/60">
              Nothing moved on this day.
            </p>
            {/* An empty day on a screen you just opened reads as broken. The
                real answer is one tap away and the screen knows it, so it
                says it rather than leaving you to find it with the arrows. */}
            {previous && (
              <button
                onClick={() => go(previous)}
                className="mt-3 rounded-full bg-ink-950 px-4 py-2 text-xs font-black text-cream-50 hover:bg-ink-800"
              >
                Jump to {formatDate(previous)}
              </button>
            )}
            {!previous && days.length === 0 && (
              <p className="mt-2 text-xs text-ink-800/40">
                Nothing has moved on this pot at all yet.
              </p>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {shown.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-3 ring-1 ring-ink-950/[0.07]"
                >
                  <span className="min-w-0 text-sm text-ink-800/75">
                    {l.note ?? l.category ?? (l.type === "in" ? "Money in" : "Money out")}
                    {/* Which kind of line it is. A sale follows its order —
                        cancel the order and this turns into a reversal —
                        while a typed entry stays exactly as entered. Somebody
                        chasing a shortfall needs to know which they have. */}
                    {l.derived && (
                      <span className="ml-2 whitespace-nowrap rounded-md bg-ink-950/[0.06] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/45">
                        from a sale
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 font-display font-black tabular-nums ${
                      l.type === "in" ? "text-jade-700" : "text-brand-600"
                    }`}
                  >
                    {l.type === "in" ? "+" : "−"}
                    {peso(l.amount)}
                  </span>
                </li>
              ))}
            </ul>

            {onDay.length > DAY_PREVIEW && (
              <button
                onClick={() => setDeep((d) => !d)}
                className="self-start rounded-full bg-cream-100 px-4 py-2 text-xs font-bold text-ink-800/75 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
              >
                {deep
                  ? `Show just the newest ${DAY_PREVIEW}`
                  : `Show all ${onDay.length} on this day`}
              </button>
            )}

            {/* ---- what the day did ----

                In and out separately, then the net. One net figure alone
                hides the shape: ₱0 net is a quiet day and a day that took
                ₱4,000 and paid out ₱4,000, and those are not the same day. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t-2 border-ink-950/15 pt-3 text-sm">
              <span className="font-bold text-ink-800/60">
                <span className="text-jade-700">In {exact(sum.in)}</span>
                <span className="mx-2 text-ink-800/25">·</span>
                <span className="text-brand-600">Out {exact(sum.out)}</span>
              </span>
              <span className="font-display text-lg font-black tabular-nums text-ink-950">
                {sum.net >= 0 ? "+" : "−"}
                {exact(Math.abs(sum.net))}
              </span>
            </div>
          </>
        )}

        {/* ---- jump ----

            The last handful of days that moved, as chips. Faster than the
            arrows for "two Saturdays ago" and it doubles as a statement of
            which days this pot has anything on at all. */}
        {days.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-ink-950/10 pt-3">
            {days.slice(0, 8).map((d) => (
              <button
                key={d}
                onClick={() => go(d)}
                aria-pressed={d === day}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold tabular-nums transition-colors ${
                  d === day
                    ? "bg-ink-950 text-cream-50"
                    : "bg-ink-950/[0.05] text-ink-800/65 hover:bg-ink-950/10"
                }`}
              >
                {formatDate(d)}
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
