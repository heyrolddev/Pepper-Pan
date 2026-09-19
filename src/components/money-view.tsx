"use client";

import { useState, useTransition } from "react";
import { HistoryList } from "@/components/history-list";
import { peso } from "@/lib/costing";
import { formatDate } from "@/lib/format-date";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import type { MoneyPicture } from "@/lib/money-server";
import {
  addCashEntry,
  addReceivable,
  collectReceivable,
  deleteAsset,
  deleteFixedCost,
  saveAsset,
  saveFixedCost,
  setOpenDays,
  setPaybackFrom,
  startCashTracking,
  startGcashTracking,
  startBankTracking,
} from "@/app/admin/money/actions";
import { hqTitle } from "@/lib/hq-theme";
import { Explain } from "@/components/explain";
import { ACCOUNT_SHORT, type Account } from "@/lib/money-accounts";
import { SupplierDebts } from "@/components/supplier-debts";
import { SpendPanel } from "@/components/spend-panel";
import type { Supplier } from "@/lib/suppliers";

/**
 * The money the costing screens can't see.
 *
 * Everything else in HQ works forward from a sale: what it earned, what the
 * ingredients cost, what was left. This page is the other half — the costs
 * that arrive whether or not anybody buys anything, the cash that walks out
 * of the drawer, the money customers still owe, and the capital that went
 * into the stall before it ever opened.
 *
 * The break-even line is the one number here worth the whole page: what the
 * shop has to take in a day to have covered everything.
 */

/**
 * One card on the money screen, foldable when it wants to be.
 *
 * `<details>` rather than a `useState` toggle, and that is a deliberate
 * choice rather than a lazy one: the browser gives keyboard support, the
 * correct ARIA, and Ctrl-F finding text inside a closed section for free —
 * and all of it works before any JavaScript has run, which on stall wifi is
 * a real moment rather than a hypothetical one.
 *
 * The summary keeps the hint visible while closed. A fold whose label is
 * only "Monthly bills" makes you open it to find out whether anything is
 * due; one that says "₱4,200 a month across 5 bills" often means you do not
 * have to.
 */
function Panel({
  title,
  hint,
  action,
  fold = false,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  /** Collapsed by default, with the hint still readable on the summary. */
  fold?: boolean;
  children: React.ReactNode;
}) {
  const head = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-lg font-black text-ink-950">{title}</h3>
        {hint && <p className="mt-1 max-w-xl text-sm text-ink-800/55">{hint}</p>}
      </div>
      {action}
    </div>
  );

  if (!fold) {
    return (
      <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
        {head}
        <div className="mt-4">{children}</div>
      </section>
    );
  }

  return (
    <details className="group rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="mt-1 shrink-0 text-sm font-black text-ink-800/40 transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <div className="min-w-0 flex-1">{head}</div>
      </summary>
      <div className="mt-4 pl-7">{children}</div>
    </details>
  );
}

function Row({
  label,
  value,
  tone,
  badge,
  onDelete,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
  /** A quiet word on where the line came from. */
  badge?: string;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-950/5 py-2 last:border-0">
      <span className="min-w-0 text-sm text-ink-800/75">
        {label}
        {badge && (
          <span className="ml-2 whitespace-nowrap rounded-md bg-ink-950/[0.06] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/45">
            {badge}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className={`font-display font-black tabular-nums ${
            tone === "bad" ? "text-brand-600" : tone === "good" ? "text-jade-700" : "text-ink-950"
          }`}
        >
          {value}
        </span>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={`Remove ${label}`}
            className="grid h-7 w-7 place-items-center rounded-lg bg-ink-950/5 text-xs text-ink-800/50 transition-colors hover:bg-brand-600 hover:text-cream-50"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * One pot of money, in its own colour.
 *
 * Colour is doing real work here rather than decorating: three balances
 * stacked in the same ink all read as one list to scan, and the owner is not
 * scanning — they are looking for one of them. Green is the drawer because
 * green is cash everywhere; blue is GCash because GCash is blue in every
 * Filipino's head, so the row is recognised instead of read; the bank is ink,
 * the quietest of the three, because it is the pot that moves least.
 *
 * A pot nobody has opened shows its own "Start counting" rather than a zero.
 * ₱0.00 is a real answer — an empty account — and it is not the one to give
 * for an account that does not exist.
 */
const POT_TONES = {
  cash: {
    bar: "bg-jade-600",
    tint: "bg-jade-50",
    ring: "ring-jade-600/20",
    value: "text-jade-700",
  },
  wallet: {
    bar: "bg-wallet-600",
    tint: "bg-wallet-50",
    ring: "ring-wallet-600/20",
    value: "text-wallet-700",
  },
  bank: {
    bar: "bg-ink-800",
    tint: "bg-ink-950/[0.04]",
    ring: "ring-ink-950/10",
    value: "text-ink-950",
  },
} as const;

type PotTone = keyof typeof POT_TONES;

function Pot({
  tone,
  label,
  note,
  state,
  onStart,
}: {
  tone: PotTone;
  label: string;
  /** What flows into it, in the owner's words. */
  note: string;
  state: { enabled: boolean; onHand: number };
  onStart: () => void;
}) {
  const skin = POT_TONES[tone];

  if (!state.enabled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink-950/[0.03] px-4 py-3 ring-1 ring-ink-950/5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-800/45">{label}</p>
          <p className="mt-0.5 text-xs text-ink-800/35">Not counted yet</p>
        </div>
        <button
          onClick={onStart}
          className="shrink-0 rounded-xl bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
        >
          Start counting
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 overflow-hidden rounded-2xl ${skin.tint} py-3 pr-4 ring-1 ${skin.ring}`}
    >
      <span aria-hidden className={`h-10 w-1.5 shrink-0 rounded-r-full ${skin.bar}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-950">{label}</p>
        <p className="mt-0.5 text-xs text-ink-800/50">{note}</p>
      </div>
      <span
        className={`shrink-0 font-display text-xl font-black tabular-nums ${skin.value}`}
      >
        {peso(state.onHand)}
      </span>
    </div>
  );
}

/** The three pots, in the order the money is most likely to be. */
const POTS = [
  {
    key: "cash",
    tone: "cash",
    label: "Cash in the drawer",
    note: "Cash sales in, supplies and labas out",
    start: "cash-start",
  },
  {
    key: "gcash",
    tone: "wallet",
    label: "GCash",
    note: "GCash sales in, anything paid from it out",
    start: "gcash-start",
  },
  {
    key: "bank",
    tone: "bank",
    label: "Bank",
    note: "Transfers taken at the till, and what you record moving",
    start: "bank-start",
  },
] as const;

/** What the one field on a "start counting" dialog is asking for. */
const STARTS = {
  "cash-start": "In the drawer now (₱)",
  "gcash-start": "In GCash now (₱)",
  "bank-start": "In the bank now (₱)",
} as const;

function useAction() {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error !== null) setError(r.error);
      else after?.();
    });
  return { busy, error, run, setError };
}

export function MoneyView({
  money,
  suppliers = [],
}: {
  money: MoneyPicture;
  /** For the Spend dialog's "who from" chips. */
  suppliers?: Supplier[];
}) {
  const [dialog, setDialog] = useState<
    "cost" | "cash-start" | "gcash-start" | "bank-start" | "cash-entry" | "utang" | "asset" | null
  >(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const gap =
    money.breakEvenDaily === null
      ? null
      : money.avgDailyRevenue - money.breakEvenDaily;

  // Is any pot being counted at all? Drives both the total and the empty state
  // — a "What Pepper Pan holds: ₱0.00" above three unopened pots is a lie.
  const anyPot = money.cash.enabled || money.gcash.enabled || money.bank.enabled;

  // The pots money may actually be filed into. Order matters: the drawer is
  // first, so it is the default in the dialog, which is where the money is
  // most of the time.
  const openPots: Account[] = [
    ...(money.cash.enabled ? (["cash"] as const) : []),
    ...(money.gcash.enabled ? (["gcash"] as const) : []),
    ...(money.bank.enabled ? (["bank"] as const) : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className={hqTitle}>Money</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          The costs that arrive whether or not anyone buys anything — and what
          the shop has to take in a day to cover them.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {/* ---- everything the shop holds ----

          Above the drawer rather than replacing it. "How much does Pepper Pan
          have" and "does the drawer balance" are two different questions, and
          only the second one can be checked against a physical count — fold
          an untouchable e-wallet balance into the drawer figure and that
          check, the one self-correcting number on this screen, is gone. */}
      <Panel
        title="Pepper Pan Bank"
        hint="Every pot the shop's money sits in, added up. Each one is counted on its own so the drawer can still be checked against what you physically count."
        action={
          anyPot ? (
            <button
              onClick={() => setDialog("cash-entry")}
              className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
            >
              + Money in or out
            </button>
          ) : undefined
        }
      >
        {!anyPot ? (
          <p className="text-sm text-ink-800/60">
            Nothing is being counted yet. Start with whichever pot you know the
            balance of right now — the others can wait.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {POTS.map((pot) => (
            <Pot
              key={pot.key}
              tone={pot.tone}
              label={pot.label}
              note={pot.note}
              state={money[pot.key]}
              onStart={() => setDialog(pot.start)}
            />
          ))}
        </div>

        {anyPot && (
          <>
            <div className="mt-4 flex items-center justify-between border-t-2 border-ink-950/15 pt-3">
              <span className="text-sm font-bold text-ink-800/70">
                What Pepper Pan holds
              </span>
              <span className="font-display text-2xl font-black tabular-nums text-ink-950">
                {peso(money.totalHeld)}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-800/50">
              Money customers still owe you is not in here — that is{" "}
              {peso(money.owed, 0)} under Utang below, and it is not yours
              until it is collected.
            </p>
          </>
        )}
      </Panel>

      {/* ---- what the shop owes ----

          Directly under Pepper Pan Bank because it is the correction to it.
          The pots hold what they say — that figure has to stay checkable
          against a physical count — but some of it is already the supplier's,
          and nothing on this screen used to say so. */}
      <Panel
        title="Utang sa supplier"
        hint="Deliveries and purchases taken on credit. The cash is still in the drawer until you pay — recording the debt moves nothing, and paying it is what writes the line."
      >
        <SupplierDebts
          debts={money.debts}
          owedToSuppliers={money.owedToSuppliers}
          totalHeld={money.totalHeld}
          openPots={openPots.length > 0 ? openPots : ["cash"]}
        />
      </Panel>

      {/* ---- what gets used up ---- */}
      <Panel
        title="Gamit at gastos"
        hint="Supplies, gas and repairs — used up, and nothing left to show for them. Not ingredients, not rent. Until now they were in no sum anywhere, which made break-even lower than the truth."
      >
        <SpendPanel
          runningCosts={money.runningCosts}
          runningForWindow={money.runningForWindow}
          monthlyRate={money.monthlyRunningRate}
          windowDays={money.windowDays}
          tanks={money.tanks}
          suppliers={suppliers}
          openPots={openPots.length > 0 ? openPots : ["cash"]}
        />
      </Panel>

      {/* ---- cash ---- */}
      <Panel
        title="Cash in the drawer"
        hint={
          money.cash.enabled
            ? `Counting from ${formatDate(money.cash.startedOn!)}, starting at ${peso(money.cash.startedWith, 0)}. Every cash sale, every cancellation, and anything put in or taken out — with whose till it was on.`
            : "Start from what's in the drawer right now — nothing retroactive, because a balance rebuilt from guesses looks authoritative and drifts."
        }
        // No button of its own any more: "Money in or out" moved up to Pepper
        // Pan Bank when it learned to ask which pot, and two buttons doing the
        // same job is how one of them ends up writing to the wrong one.
        action={
          money.cash.enabled ? undefined : (
            <button
              onClick={() => setDialog("cash-start")}
              className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
            >
              Start counting
            </button>
          )
        }
      >
        {money.cash.enabled && (
          <>
            <p className="font-display text-3xl font-black tabular-nums text-ink-950">
              {peso(money.cash.onHand)}
            </p>
            {/* Five, newest first, and the rest a button away.
                
                It was a hard `.slice(0, 8)` — eight rows, and everything
                before that simply gone, with nothing on screen to say so.
                The drawer not balancing is exactly when somebody needs to go
                back further than the last eight entries. */}
            <HistoryList
              className="mt-4"
              items={money.ledger}
              keyOf={(l) => l.id}
              dateOf={(l) => l.date}
              initial={4}
              noun="entries"
              // Behind a dialog rather than expanding down the page. This is
              // the longest list in HQ — every cash sale since counting
              // started — and expanded in place it buried its own "Show
              // fewer" under a hundred rows. The dates live in there too,
              // where they are used.
              modal
              modalTitle="Cash in the drawer"
              empty="Nothing yet — no sales, and nothing put in or taken out."
              render={(l) => (
                <Row
                  label={`${formatDate(l.date)} · ${l.note ?? l.category ?? (l.type === "in" ? "Cash in" : "Cash out")}`}
                  value={`${l.type === "in" ? "+" : "−"}${peso(l.amount)}`}
                  tone={l.type === "in" ? "good" : "bad"}
                  /* Marked, because the two kinds behave differently: a sale
                     line follows its order — cancel the order and the line
                     turns into a reversal — while a typed entry stays exactly
                     as it was entered. Somebody chasing a shortfall needs to
                     know which they are looking at. */
                  badge={l.derived ? "from a sale" : undefined}
                />
              )}
            />
          </>
        )}
      </Panel>

      {/* ---- the headline ---- */}
      <Explain
        title="Break-even a day"
        what="What the shop has to take in on a trading day just to stand still — before a single peso is profit."
        lines={
          money.breakEvenDaily === null
            ? [{ label: "Not enough to work it out yet", value: "—", total: true }]
            : [
                {
                  label: "Monthly bills",
                  value: peso(money.monthlyFixed, 0),
                  note: "Rent, kuryente, tubig, sweldo — everything in the list below.",
                },
                {
                  label: "Spoilage, scaled to a month",
                  value: peso(money.monthlyWasteRate, 0),
                  note: `From ${peso(money.wasteForWindow, 0)} thrown away over ${money.windowDays} day${money.windowDays === 1 ? "" : "s"}.`,
                },
                {
                  label: "Supplies, gas and repairs, scaled to a month",
                  value: peso(money.monthlyRunningRate, 0),
                  note: `From ${peso(money.runningForWindow, 0)} over the last ${money.windowDays} day${money.windowDays === 1 ? "" : "s"}. This was missing from the sum entirely until now, which made the figure below lower than the truth.`,
                },
                {
                  label: "= To cover every month",
                  value: peso(
                    money.monthlyFixed + money.monthlyWasteRate + money.monthlyRunningRate,
                    0
                  ),
                },
                {
                  label: "÷ what's left of each peso after ingredients",
                  value: `${((money.marginRatio ?? 0) * 100).toFixed(0)}%`,
                  note: `${peso(money.grossProfit, 0)} kept out of ${peso(money.revenue, 0)} taken.`,
                },
                {
                  label: "= Sales needed each month",
                  value: peso(
                    (money.monthlyFixed + money.monthlyWasteRate + money.monthlyRunningRate) /
                      (money.marginRatio || 1),
                    0
                  ),
                },
                {
                  label: `÷ ${money.openDays} open days a month`,
                  value: "",
                  note: "Set in the shop's settings — change it if you open more or fewer days.",
                },
                {
                  label: "Break-even a day",
                  value: peso(money.breakEvenDaily, 0),
                  total: true,
                },
              ]
        }
        why="Four things move this. Your bills move it the moment you edit them below. Spoilage moves it as you record waste. Supplies, gas and repairs move it as you record them — that line is new, and until it existed this figure was quietly lower than the truth every day. And your margin moves it as you sell, but only from new sales: every order keeps the ingredient cost it had on the day, so changing an ingredient price never rewrites what you already sold."
      >
      <section
        className={`overflow-hidden rounded-3xl p-6 sm:p-8 ${
          money.breakEvenDaily === null
            ? "bg-cream-100 text-ink-950 ring-1 ring-ink-950/10"
            : gap !== null && gap >= 0
              ? "bg-jade-600 text-cream-50"
              : "bg-brand-600 text-cream-50"
        }`}
      >
        {money.breakEvenDaily === null ? (
          <>
            <h3 className="font-display text-2xl font-black">
              Break-even needs two things
            </h3>
            <p className="mt-2 max-w-xl text-sm text-ink-800/70">
              {money.monthlyFixed <= 0
                ? "Add your monthly bills below — rent, kuryente, tubig, sweldo."
                : "And some sales, so there's a margin to work from."}
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-black uppercase tracking-widest opacity-70">
              To cover everything
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="font-display text-4xl font-black tabular-nums">
                {peso(money.breakEvenDaily, 0)}
              </span>
              <span className="text-sm opacity-80">a day</span>
            </div>
            <p className="mt-3 text-sm opacity-85">
              You&apos;re averaging{" "}
              <strong className="tabular-nums">{peso(money.avgDailyRevenue, 0)}</strong>{" "}
              a day over your last {money.windowDays} trading day
              {money.windowDays === 1 ? "" : "s"} —{" "}
              {gap !== null && gap >= 0 ? (
                <>
                  <strong>{peso(gap, 0)} clear</strong> of break-even.
                </>
              ) : (
                <>
                  <strong>{peso(Math.abs(gap ?? 0), 0)} short</strong> of it.
                </>
              )}
            </p>
          </>
        )}
      </section>
      </Explain>

      {/* ---- the window ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Taken",
            value: peso(money.revenue, 0),
            sub: `${money.windowDays} trading days`,
            what: "Everything customers paid over the window — the top line, before any cost comes off it.",
            lines: [
              {
                label: "Every order that went through",
                value: peso(money.revenue, 0),
                note: `Counted over ${money.windowDays} day${money.windowDays === 1 ? "" : "s"} the shop actually traded, not 30 calendar days.`,
              },
              { label: "Cancelled orders", value: "not counted" },
              { label: "Taken", value: peso(money.revenue, 0), total: true },
            ],
            why: "Counter sales and website orders both land here. Days the shop was shut are left out entirely — averaging a week of sales across a month would make every day look four times worse than it was.",
          },
          {
            label: "Ingredients",
            value: peso(money.cogs, 0),
            sub: "What the food cost",
            what: "What the food in those orders cost to make, added up from the recipes.",
            lines: [
              {
                label: "Cost of everything sold",
                value: peso(money.cogs, 0),
                note: "Each order carries the ingredient cost it had on the day it was sold.",
              },
              {
                label: "As a share of what you took",
                value: money.revenue > 0 ? `${((money.cogs / money.revenue) * 100).toFixed(0)}%` : "—",
              },
              { label: "Left after ingredients", value: peso(money.grossProfit, 0), total: true },
            ],
            why: "This is frozen per order, on purpose. Restocking at a new price changes what the next order costs, never what last week's did — otherwise last month's profit would quietly rewrite itself every time the market price moved.",
          },
          {
            label: "Bills for those days",
            value: peso(money.oeForWindow, 0),
            sub: `${peso(money.dailyOE, 0)} a day`,
            what: "The share of your monthly bills that belongs to the days in this window.",
            lines: [
              { label: "Monthly bills", value: peso(money.monthlyFixed, 0) },
              { label: `÷ ${money.openDays} open days a month`, value: peso(money.dailyOE, 0) },
              {
                label: `× ${money.windowDays} trading day${money.windowDays === 1 ? "" : "s"}`,
                value: peso(money.oeForWindow, 0),
                total: true,
              },
            ],
            why: "Rent arrives whether or not anybody buys anything, so it is spread across the days you open rather than charged to one. Edit the bills below and this moves straight away.",
          },
          {
            label: "Actually earned",
            value: peso(money.netProfit, 0),
            sub: "After everything",
            tone: money.netProfit >= 0 ? "good" : "bad",
            what: "What is left once the food, the bills and the spoilage are all paid for.",
            lines: [
              { label: "Taken", value: peso(money.revenue, 0) },
              { label: "− Ingredients", value: peso(money.cogs, 0) },
              { label: "− Bills for those days", value: peso(money.oeForWindow, 0) },
              { label: "− Thrown away", value: peso(money.wasteForWindow, 0) },
              { label: "Actually earned", value: peso(money.netProfit, 0), total: true },
            ],
            why: "The honest number. It is not cash in your pocket — money customers still owe you is in the takings, and buying stock for next week comes out of the drawer without showing here.",
          },
        ].map((s) => (
          <Explain key={s.label} title={s.label} what={s.what} lines={s.lines} why={s.why}>
          <div
            className={`h-full rounded-3xl p-4 ring-1 sm:p-5 ${
              s.tone === "good"
                ? "bg-jade-600 text-cream-50 ring-jade-700/30"
                : s.tone === "bad"
                  ? "bg-brand-600 text-cream-50 ring-brand-700/30"
                  : "bg-cream-100 text-ink-950 ring-ink-950/10"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 sm:text-[11px]">
              {s.label}
            </p>
            <p className="mt-1 font-display text-2xl font-black tabular-nums sm:text-3xl">
              {s.value}
            </p>
            <p className="mt-1 text-[11px] leading-snug opacity-70">{s.sub}</p>
          </div>
          </Explain>
        ))}
      </div>

      {/* ---- fixed costs ---- */}
      <Panel
        fold
        title="Monthly bills"
        hint={`Spread across the ${money.openDays} days a month you're open — ${peso(money.dailyOE)} a day.`}
        action={
          <button
            onClick={() => setDialog("cost")}
            className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
          >
            + Add a bill
          </button>
        }
      >
        {money.fixedCosts.length === 0 ? (
          <p className="text-sm text-ink-800/50">
            Nothing yet. Rent, kuryente, tubig, sweldo, internet — anything that
            arrives every month.
          </p>
        ) : (
          <>
            {money.fixedCosts.map((c) => (
              <Row
                key={c.id}
                label={c.label}
                value={peso(c.amount)}
                onDelete={() => run(() => deleteFixedCost(c.id))}
              />
            ))}
            <div className="mt-2 flex items-center justify-between border-t-2 border-ink-950/15 pt-2">
              <span className="text-sm font-bold text-ink-800/70">A month</span>
              <span className="font-display text-xl font-black tabular-nums text-ink-950">
                {peso(money.monthlyFixed)}
              </span>
            </div>
            <label className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-800/70">
              Open
              <input
                type="number"
                min="1"
                max="31"
                defaultValue={money.openDays}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== money.openDays) run(() => setOpenDays(v));
                }}
                className="w-20 rounded-xl border-2 border-ink-950/10 bg-cream-50 px-3 py-1.5 text-center tabular-nums"
              />
              days a month
            </label>
          </>
        )}
        {money.monthlyWasteRate > 0 && (
          <p className="mt-4 rounded-xl bg-chili-500/15 px-4 py-3 text-sm text-ink-950">
            Waste is running at about{" "}
            <strong className="tabular-nums">{peso(money.monthlyWasteRate, 0)}</strong>{" "}
            a month, and break-even counts it — it&apos;s as real a cost as the
            rent.
          </p>
        )}
      </Panel>


      {/* ---- utang ---- */}
      <Panel
        fold
        title="Utang"
        hint={
          money.owed > 0
            ? `${peso(money.owed)} still owed across ${money.receivables.filter((r) => !r.settled).length} people.`
            : "Nobody owes anything right now."
        }
        action={
          <button
            onClick={() => setDialog("utang")}
            className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
          >
            + Record utang
          </button>
        }
      >
        {money.receivables.filter((r) => !r.settled).length === 0 ? (
          <p className="text-sm text-ink-800/50">Nothing outstanding.</p>
        ) : (
          money.receivables
            .filter((r) => !r.settled)
            .map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-950/5 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-950">{r.customer}</p>
                  <p className="text-xs text-ink-800/50">
                    since {formatDate(r.date)}
                    {r.collected > 0 && ` · ${peso(r.collected)} paid so far`}
                    {r.phone && ` · ${r.phone}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-display font-black tabular-nums text-brand-600">
                    {peso(r.amount - r.collected)}
                  </span>
                  <button
                    onClick={() => setCollecting(r.id)}
                    className="rounded-xl bg-jade-600 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-cream-50 hover:bg-jade-700"
                  >
                    Collect
                  </button>
                </div>
              </div>
            ))
        )}
      </Panel>

      {/* ---- payback ---- */}
      <Panel
        fold
        title="What you put in"
        hint="The pans, the freezer, the cart. Not an expense — money that turned into things, and the question is how much has come back."
        action={
          <button
            onClick={() => setDialog("asset")}
            className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
          >
            + Add
          </button>
        }
      >
        {money.assets.length === 0 ? (
          <p className="text-sm text-ink-800/50">Nothing listed yet.</p>
        ) : (
          <>
            {money.assets.map((a) => (
              <Row
                key={a.id}
                label={a.name + (a.boughtOn ? ` · ${formatDate(a.boughtOn)}` : "")}
                value={peso(a.amount)}
                onDelete={() => run(() => deleteAsset(a.id))}
              />
            ))}
            <div className="mt-2 flex items-center justify-between border-t-2 border-ink-950/15 pt-2">
              <span className="text-sm font-bold text-ink-800/70">Put in</span>
              <span className="font-display text-xl font-black tabular-nums text-ink-950">
                {peso(money.assetTotal)}
              </span>
            </div>

            {money.payback ? (
              <div className="mt-4 rounded-2xl bg-ink-950 p-5 text-cream-50">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm opacity-70">
                    Earned back since {formatDate(money.payback.from!)}
                  </span>
                  <span className="font-display text-2xl font-black tabular-nums">
                    {peso(money.payback.earned, 0)}
                  </span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-cream-50/15">
                  <div
                    className={`h-full rounded-full ${
                      money.payback.paidOff ? "bg-jade-400" : "bg-gold-400"
                    }`}
                    style={{ width: `${Math.min(100, money.payback.pct)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm opacity-80">
                  {money.payback.paidOff
                    ? "Paid off — everything from here is yours."
                    : `${money.payback.pct.toFixed(0)}% of the way back.`}
                </p>
              </div>
            ) : (
              <button
                onClick={() => run(() => setPaybackFrom(new Date().toISOString().slice(0, 10)))}
                disabled={busy}
                className="mt-4 w-full rounded-2xl bg-ink-950/5 py-3 text-sm font-bold text-ink-800 ring-1 ring-ink-950/10 hover:bg-ink-950/10"
              >
                Start counting payback from today
              </button>
            )}
          </>
        )}
      </Panel>

      <p className="text-xs text-ink-800/45">
        Bills are spread across the days you&apos;re open rather than charged to
        individual orders — splitting a month&apos;s rent across sales needs a
        rule for how, and every rule is arbitrary.
      </p>

      {dialog && (
        <MoneyDialog which={dialog} pots={openPots} onClose={() => setDialog(null)} />
      )}
      {collecting && (
        <CollectDialog
          receivable={money.receivables.find((r) => r.id === collecting)!}
          onClose={() => setCollecting(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MoneyDialog({
  which,
  pots,
  onClose,
}: {
  which: "cost" | "cash-start" | "gcash-start" | "bank-start" | "cash-entry" | "utang" | "asset";
  /** The pots actually being counted, so money cannot be filed into a closed one. */
  pots: Account[];
  onClose: () => void;
}) {
  const { busy, error, run } = useAction();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [dir, setDir] = useState<"in" | "out">("out");
  // Defaults to whichever pot is listed first — the drawer, whenever it is on.
  const [account, setAccount] = useState<Account>(pots[0] ?? "cash");

  const config = {
    cost: { title: "Add a monthly bill", sub: "Anything that arrives every month whether you open or not." },
    "cash-start": { title: "Start counting cash", sub: "How much is in the drawer right now?" },
    "gcash-start": { title: "Start counting GCash", sub: "How much is in the e-wallet right now? Nothing before today is counted." },
    "bank-start": { title: "Start counting the bank", sub: "How much is in the account right now? Nothing before today is counted." },
    "cash-entry": { title: "Money in or out", sub: "Cash sales are counted already — this is everything else." },
    utang: { title: "Record utang", sub: "Who owes, and how much." },
    asset: { title: "Add what you put in", sub: "Equipment, the cart, the signage." },
  }[which];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(b) || 0;
    if (which === "cost") run(() => saveFixedCost({ label: a, amount }), onClose);
    else if (which === "cash-start") run(() => startCashTracking(Number(a) || 0), onClose);
    else if (which === "gcash-start") run(() => startGcashTracking(Number(a) || 0), onClose);
    else if (which === "bank-start") run(() => startBankTracking(Number(a) || 0), onClose);
    else if (which === "cash-entry")
      run(() => addCashEntry({ type: dir, amount: Number(a) || 0, note: b, account }), onClose);
    else if (which === "utang")
      run(() => addReceivable({ customer: a, amount, phone: c }), onClose);
    else run(() => saveAsset({ name: a, amount }), onClose);
  }

  return (
    <AdminDialog title={config.title} subtitle={config.sub} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {which === "cash-entry" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(["in", "out"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDir(d)}
                  aria-pressed={dir === d}
                  className={`rounded-xl py-2.5 text-sm font-black uppercase tracking-wide ${
                    dir === d
                      ? d === "in"
                        ? "bg-jade-600 text-cream-50"
                        : "bg-brand-600 text-cream-50"
                      : "bg-ink-950/5 text-ink-800/50"
                  }`}
                >
                  {d === "in" ? "Money in" : "Money out"}
                </button>
              ))}
            </div>
            {/* Which pot, asked before the amount. A movement recorded on
                the wrong one is worse than an unrecorded movement: the total
                is right, both balances are wrong, and nothing on screen says
                so. Only pots being counted are offered. */}
            {pots.length > 1 && (
              <Field label="Which pot">
                <div className="grid grid-cols-3 gap-2">
                  {pots.map((acc) => (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => setAccount(acc)}
                      aria-pressed={account === acc}
                      className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                        account === acc
                          ? "bg-ink-950 text-cream-50"
                          : "bg-ink-950/[0.05] text-ink-950 hover:bg-ink-950/10"
                      }`}
                    >
                      {ACCOUNT_SHORT[acc]}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Field label="How much (₱)">
              <input value={a} onChange={(e) => setA(e.target.value)} type="number"
                step="0.01" min="0" inputMode="decimal" autoFocus className={inputClass} />
            </Field>
            <Field label="What for">
              <input value={b} onChange={(e) => setB(e.target.value)}
                placeholder="e.g. bought ice, tricycle fare" className={inputClass} />
            </Field>
          </>
        ) : STARTS[which as keyof typeof STARTS] ? (
          <Field label={STARTS[which as keyof typeof STARTS]}>
            <input value={a} onChange={(e) => setA(e.target.value)} type="number"
              step="0.01" min="0" inputMode="decimal" autoFocus className={inputClass} />
          </Field>
        ) : (
          <>
            <Field label={which === "utang" ? "Who" : which === "cost" ? "What for" : "What is it"}>
              <input value={a} onChange={(e) => setA(e.target.value)} autoFocus
                placeholder={which === "cost" ? "e.g. Rent" : which === "utang" ? "e.g. Aling Nena" : "e.g. Chest freezer"}
                className={inputClass} />
            </Field>
            <Field label={which === "cost" ? "How much a month (₱)" : "How much (₱)"}>
              <input value={b} onChange={(e) => setB(e.target.value)} type="number"
                step="0.01" min="0" inputMode="decimal" className={inputClass} />
            </Field>
            {which === "utang" && (
              <Field label="Number" hint="Optional.">
                <input value={c} onChange={(e) => setC(e.target.value)} className={inputClass} />
              </Field>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}
          className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40">
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </AdminDialog>
  );
}

function CollectDialog({
  receivable,
  onClose,
}: {
  receivable: { id: string; customer: string | null; amount: number; collected: number };
  onClose: () => void;
}) {
  const outstanding = receivable.amount - receivable.collected;
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState(String(outstanding));
  const [toDrawer, setToDrawer] = useState(true);

  return (
    <AdminDialog
      title={`Collect from ${receivable.customer ?? "customer"}`}
      subtitle={`${peso(outstanding)} still owed.`}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () =>
              collectReceivable({
                id: receivable.id,
                amount: Number(amount) || 0,
                toDrawer,
              }),
            onClose
          );
        }}
        className="flex flex-col gap-4"
      >
        <Field label="How much did they pay (₱)" hint="Part of it is fine — the rest stays owed.">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
            step="0.01" min="0" inputMode="decimal" autoFocus className={inputClass} />
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-ink-950/[0.03] px-4 py-3">
          <input type="checkbox" checked={toDrawer} onChange={(e) => setToDrawer(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400" />
          <span className="text-xs text-ink-800/70">
            <strong className="text-ink-950">It went into the drawer</strong>
            <span className="block">Adds it to the cash count too.</span>
          </span>
        </label>
        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">{error}</p>
        )}
        <button type="submit" disabled={busy}
          className="w-full rounded-2xl bg-jade-600 py-3.5 font-display text-lg font-black text-cream-50 hover:bg-jade-700 disabled:bg-ink-950/15 disabled:text-ink-800/40">
          {busy ? "Recording…" : "Record it"}
        </button>
      </form>
    </AdminDialog>
  );
}
