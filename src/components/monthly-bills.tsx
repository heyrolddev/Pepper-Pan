"use client";

import { useMemo, useState, useTransition } from "react";
import { peso } from "@/lib/peso";
import { inputClass } from "@/components/admin-dialog";
import {
  AVERAGE_MONTHS,
  BILL_KIND_LABEL,
  monthLabel,
  shiftMonth,
  shortMonth,
  type BillLine,
  type BillKindName,
  type MonthAmount,
} from "@/lib/monthly-bills";
import { deleteMonthlyBill, saveMonthlyBill } from "@/app/admin/money/actions";

/**
 * The bills, month by month.
 *
 * The screen this replaces held one number per bill and no memory. Kuryente
 * said ₱2,000 and had said ₱2,000 since the day it was typed — so the month
 * it came in at ₱3,100 produced no signal at all, and by the time anybody
 * edited the figure the reason was months in the past and unaskable.
 *
 * Three things follow from that, and they are the whole design:
 *
 *   ENTERING A MONTH HAS TO BE FASTER THAN EDITING A NUMBER WAS. Every bill
 *   is a box on one screen with the month already chosen. Type, tab, type,
 *   tab. If recording September costs more effort than the flat figure did,
 *   the history stops after two months and the feature was a downgrade.
 *
 *   THE MOVEMENT IS THE POINT, not the level. Every row carries what it did
 *   against the month before, because "kuryente is ₱2,000" is a fact nobody
 *   can act on and "kuryente is up 67%" is a question somebody can answer.
 *
 *   WHAT IS MISSING HAS TO SAY SO. A per-month system that shows only what
 *   was entered looks complete the moment one bill is typed in, and a month
 *   with two of five bills recorded is worse than no month at all — it reads
 *   as a cheap month.
 */

const KIND_TONE: Record<BillKindName, string> = {
  // Utilities are the ones that move, so they are the ones given a colour
  // that carries. The rest are quiet on purpose — a screen where everything
  // is highlighted has highlighted nothing.
  utility: "bg-wallet-600/15 text-wallet-700",
  rent: "bg-ink-950/[0.06] text-ink-800/60",
  wage: "bg-ink-950/[0.06] text-ink-800/60",
  overhead: "bg-ink-950/[0.06] text-ink-800/60",
  misc: "bg-ink-950/[0.06] text-ink-800/60",
};

/** Up is bad on a bill, so the colours are the other way round to a sale. */
function Trend({ change, from }: { change: number | null; from: string | null }) {
  if (change === null || from === null) return null;
  const pct = Math.round(Math.abs(change) * 100);
  // Under 1% rounds to zero and would render as "↑ 0%", which reads as a
  // rise that isn't one.
  if (pct === 0) {
    return (
      <span className="text-[11px] font-bold text-ink-800/40">
        same as {shortMonth(from)}
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`text-[11px] font-black tabular-nums ${up ? "text-brand-600" : "text-jade-700"}`}
    >
      {up ? "↑" : "↓"} {pct}% <span className="font-bold opacity-60">vs {shortMonth(from)}</span>
    </span>
  );
}

/**
 * Twelve months of totals as bars.
 *
 * Twelve because the answer to "why is kuryente high" is very often "it is
 * April" — a six-month window shows a summer as a crisis, and a stall owner
 * who reacts to that spends money chasing the weather.
 */
function History({ months }: { months: MonthAmount[] }) {
  const peak = Math.max(...months.map((m) => m.amount), 0);
  if (peak <= 0) return null;
  // Oldest on the left, which is the only direction a trend reads in.
  const bars = [...months].reverse();

  return (
    <div className="mt-5 rounded-2xl bg-ink-950/[0.03] p-4">
      {/* Its own sideways scroll rather than twelve crushed bars.

          At 390px a twelve-month row gives each label about twenty pixels,
          and "OCT" became "O…" — a chart whose x-axis you cannot read is a
          decoration. A minimum width plus a scroll keeps every month legible
          and keeps the page itself from scrolling sideways. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-[420px] items-end justify-between gap-1" style={{ height: 96 }}>
        {bars.map((m) => (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            {/* The figure sits above its own bar rather than in a tooltip: a
                tooltip on a phone is a long-press nobody discovers, and the
                one thing this chart is for is comparing two numbers. */}
            <span className="text-[9px] font-black tabular-nums text-ink-800/45">
              {m.amount > 0 ? Math.round(m.amount / 100) / 10 + "k" : ""}
            </span>
            <span
              aria-hidden
              className={`w-full rounded-t-md ${m.amount > 0 ? "bg-brand-600/70" : "bg-ink-950/[0.06]"}`}
              // Floored at 3px so an entered-but-tiny month is still a mark
              // on the chart rather than indistinguishable from a gap.
              style={{ height: m.amount > 0 ? `${Math.max(3, (m.amount / peak) * 72)}px` : "3px" }}
            />
            <span className="w-full text-center text-[9px] font-bold uppercase text-ink-800/35">
              {shortMonth(m.month).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-800/45">
        What the bills came to each month. A short bar is a month you have not
        finished entering as often as it is a cheap one.
      </p>
    </div>
  );
}

function BillRow({
  line,
  month,
  disabled,
  onSaved,
  onRemoveBill,
}: {
  line: BillLine;
  month: string;
  disabled: boolean;
  onSaved: (fn: () => Promise<{ error: string | null }>) => void;
  /** Remove the bill itself, and every month recorded against it. */
  onRemoveBill: (id: string) => void;
}) {
  const entered = line.history.find((h) => h.month === month) ?? null;
  const [draft, setDraft] = useState("");
  const value = draft !== "" ? draft : entered ? String(entered.amount) : "";

  const commit = () => {
    const amount = Number(value);
    if (value.trim() === "" || !Number.isFinite(amount) || amount < 0) return;
    if (entered && amount === entered.amount) return;
    onSaved(() => saveMonthlyBill({ billId: line.id, month, amount }));
    setDraft("");
  };

  return (
    <div className="border-b border-ink-950/5 py-3 last:border-0">
      {/* Stacked on a phone, side by side from 640px.

          It was one wrapping row, and `flex-1` on the label meant the label
          shrank instead of the row wrapping: at 390px "Rent sa puwesto" came
          out three words tall and the sentence beside it was forty pixels
          wide. The amount box is the fixed thing here, so it gets its own
          line rather than eating the label's. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-950">
            {line.label}
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${KIND_TONE[line.kind]}`}
            >
              {BILL_KIND_LABEL[line.kind]}
            </span>
            {!line.active && (
              <span className="rounded-md bg-ink-950/[0.06] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/40">
                stopped
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Trend change={line.change} from={line.changeFrom} />
            <span className="text-[11px] text-ink-800/45">
              {line.basis === "average"
                ? `Break-even uses ${peso(line.monthly, 0)} — the average of ${line.monthsAveraged} recorded ${line.monthsAveraged === 1 ? "month" : "months"}.`
                : `Break-even is assuming ${peso(line.monthly, 0)}. Nothing recorded yet.`}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-bold text-ink-800/40">₱</span>
          {/* The width lives on the wrapper, not on the input.

              `inputClass` begins with `w-full`, and a `w-28` alongside it is a
              coin toss decided by the order Tailwind happens to emit two
              width utilities in — which is how this box silently came out
              full width and squeezed everything else on the row. A wrapper
              that is 7rem wide and an input that fills it cannot lose. */}
          <span className="w-28 shrink-0">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              disabled={disabled}
              value={value}
              placeholder="—"
              aria-label={`${line.label} for ${monthLabel(month)}`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className={`${inputClass} text-right tabular-nums ${
                entered ? "" : "border-dashed text-ink-800/60"
              }`}
            />
          </span>
          {/* The slot is always there, filled or not, so every amount box on
              the panel starts at the same x. Rows that jog left and right
              depending on whether a month happens to be recorded read as a
              rendering fault. */}
          <span className="w-8 shrink-0">
            {entered && (
              <button
                onClick={() => onSaved(() => deleteMonthlyBill(entered.id))}
                aria-label={`Remove ${line.label} for ${monthLabel(month)}`}
                disabled={disabled}
                className="grid h-8 w-8 place-items-center rounded-lg bg-ink-950/5 text-xs text-ink-800/50 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-40"
              >
                ✕
              </button>
            )}
          </span>
        </div>
      </div>

      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-bold text-ink-800/45 hover:text-ink-950 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ▸
          </span>
          {line.history.length === 0
            ? "No months recorded yet"
            : `${line.history.length} ${line.history.length === 1 ? "month" : "months"} recorded`}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {line.history.map((h) => (
            <span
              key={h.month}
              className={`rounded-lg px-2 py-1 text-[11px] tabular-nums ${
                h.month === month
                  ? "bg-ink-950 font-black text-cream-50"
                  : "bg-ink-950/[0.05] font-bold text-ink-800/65"
              }`}
            >
              {shortMonth(h.month)} · {peso(h.amount, 0)}
            </span>
          ))}
        </div>
        {/* Folded away, and it names what it destroys.

            Removing a bill now takes its whole history with it — months of
            readings nobody can go back and observe again — so it cannot sit
            as a bare ✕ at the end of the row where the ✕ beside it only
            clears one month. Two deletes of wildly different weight, one
            keystroke apart, is a trap. */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemoveBill(line.id)}
          className="mt-3 rounded-lg px-2 py-1 text-[11px] font-bold text-ink-800/40 underline underline-offset-2 transition-colors hover:text-brand-600 disabled:opacity-40"
        >
          Remove {line.label}
          {line.history.length > 0 &&
            ` and all ${line.history.length} recorded ${line.history.length === 1 ? "month" : "months"}`}
        </button>
      </details>
    </div>
  );
}

export function MonthlyBills({
  bills,
  history,
  thisMonth,
  monthlyFixed,
  openDays,
  dailyOE,
  monthlyWasteRate,
  onRemoveBill,
}: {
  bills: BillLine[];
  history: MonthAmount[];
  /** The first of the current month — the furthest forward you can go. */
  thisMonth: string;
  monthlyFixed: number;
  openDays: number;
  dailyOE: number;
  monthlyWasteRate: number;
  onRemoveBill: (id: string) => void;
}) {
  const [month, setMonth] = useState(thisMonth);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error !== null) setError(r.error);
    });

  const { total, missing } = useMemo(() => {
    let sum = 0;
    const gaps: string[] = [];
    for (const b of bills) {
      const hit = b.history.find((h) => h.month === month);
      if (hit) sum += hit.amount;
      else if (b.active) gaps.push(b.label);
    }
    return { total: sum, missing: gaps };
  }, [bills, month]);

  if (bills.length === 0) {
    return (
      <p className="text-sm text-ink-800/50">
        Nothing yet. Rent, kuryente, tubig, sweldo, internet — anything that
        arrives every month. Add one and you can start recording what it
        actually comes to.
      </p>
    );
  }

  return (
    <>
      {/* ---- which month ----

          Arrows rather than a date field. The overwhelmingly common action is
          "the month that just ended", which is one tap left; a picker makes
          that same action three. Forward stops at the current month because a
          bill cannot have arrived for a month that has not happened. */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-ink-950/[0.04] px-2 py-2">
        <button
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="The month before"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream-50 text-sm font-black text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="font-display text-base font-black text-ink-950">{monthLabel(month)}</p>
          {month !== thisMonth && (
            <button
              onClick={() => setMonth(thisMonth)}
              className="text-[11px] font-bold text-ink-800/45 underline underline-offset-2 hover:text-ink-950"
            >
              back to {shortMonth(thisMonth)}
            </button>
          )}
        </div>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth}
          aria-label="The month after"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream-50 text-sm font-black text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50 disabled:pointer-events-none disabled:opacity-25"
        >
          ›
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-xl bg-brand-600/10 px-4 py-2 text-sm font-bold text-brand-600">
          {error}
        </p>
      )}

      {bills.map((b) => (
        <BillRow
          key={b.id}
          line={b}
          month={month}
          disabled={busy}
          onSaved={run}
          onRemoveBill={onRemoveBill}
        />
      ))}

      {/* ---- what is not in yet ----

          The one thing a per-month system can say that a flat figure never
          could. Without it the month below looks like a total. */}
      {missing.length > 0 && (
        <p className="mt-3 rounded-xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-950">
          Not entered for {monthLabel(month)} yet:{" "}
          <strong>{missing.join(", ")}</strong>. Until {missing.length === 1 ? "it is" : "they are"}{" "}
          in, the total below is not the month.
        </p>
      )}

      <div className="mt-4 space-y-1 border-t-2 border-ink-950/15 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-ink-800/70">
            Entered for {shortMonth(month)}
          </span>
          <span className="font-display text-xl font-black tabular-nums text-ink-950">
            {peso(total)}
          </span>
        </div>
        {/* Two different numbers, and conflating them is how break-even gets
            argued with. One is what this month cost; the other is what the
            daily target is built on, which is deliberately steadier. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-800/55">
            Break-even uses{" "}
            <span className="font-bold">
              the {AVERAGE_MONTHS}-month average
            </span>
          </span>
          <span className="font-display text-sm font-black tabular-nums text-ink-800/70">
            {peso(monthlyFixed)}
          </span>
        </div>
        <p className="pt-1 text-xs leading-relaxed text-ink-800/45">
          Averaged so one expensive month does not move your daily target for
          thirty days — {peso(dailyOE)} a day across the {openDays} days a
          month you are open. Each bill averages over its own recorded months,
          so one you have not entered yet is left out rather than counted as
          zero.
        </p>
      </div>

      <History months={history} />

      {monthlyWasteRate > 0 && (
        <p className="mt-4 rounded-xl bg-chili-500/15 px-4 py-3 text-sm text-ink-950">
          Waste is running at about{" "}
          <strong className="tabular-nums">{peso(monthlyWasteRate, 0)}</strong> a
          month, and break-even counts it — it&apos;s as real a cost as the rent.
        </p>
      )}
    </>
  );
}
