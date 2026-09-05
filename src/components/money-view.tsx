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
} from "@/app/admin/money/actions";
import { hqTitle } from "@/lib/hq-theme";

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
  onDelete,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-950/5 py-2 last:border-0">
      <span className="min-w-0 text-sm text-ink-800/75">{label}</span>
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

export function MoneyView({ money }: { money: MoneyPicture }) {
  const [dialog, setDialog] = useState<
    "cost" | "cash-start" | "cash-entry" | "utang" | "asset" | null
  >(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const gap =
    money.breakEvenDaily === null
      ? null
      : money.avgDailyRevenue - money.breakEvenDaily;

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

      {/* ---- the headline ---- */}
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

      {/* ---- the window ---- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Taken", value: peso(money.revenue, 0), sub: `${money.windowDays} trading days` },
          { label: "Ingredients", value: peso(money.cogs, 0), sub: "What the food cost" },
          { label: "Bills for those days", value: peso(money.oeForWindow, 0), sub: `${peso(money.dailyOE, 0)} a day` },
          {
            label: "Actually earned",
            value: peso(money.netProfit, 0),
            sub: "After everything",
            tone: money.netProfit >= 0 ? "good" : "bad",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-3xl p-4 ring-1 sm:p-5 ${
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

      {/* ---- cash ---- */}
      <Panel
        title="Cash in the drawer"
        hint={
          money.cash.enabled
            ? `Counting from ${formatDate(money.cash.startedOn!)}, starting at ${peso(money.cash.startedWith, 0)}. Cash sales in, anything you take out.`
            : "Start from what's in the drawer right now — nothing retroactive, because a balance rebuilt from guesses looks authoritative and drifts."
        }
        action={
          money.cash.enabled ? (
            <button
              onClick={() => setDialog("cash-entry")}
              className="rounded-xl bg-ink-950 px-4 py-2 text-sm font-black text-cream-50 hover:bg-ink-800"
            >
              + Money in or out
            </button>
          ) : (
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
              initial={5}
              noun="entries"
              empty="Nothing recorded yet. Cash sales are counted automatically."
              render={(l) => (
                <Row
                  label={`${formatDate(l.date)} · ${l.note ?? l.category ?? (l.type === "in" ? "Cash in" : "Cash out")}`}
                  value={`${l.type === "in" ? "+" : "−"}${peso(l.amount)}`}
                  tone={l.type === "in" ? "good" : "bad"}
                />
              )}
            />
          </>
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

      {dialog && <MoneyDialog which={dialog} onClose={() => setDialog(null)} />}
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
  onClose,
}: {
  which: "cost" | "cash-start" | "cash-entry" | "utang" | "asset";
  onClose: () => void;
}) {
  const { busy, error, run } = useAction();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [dir, setDir] = useState<"in" | "out">("out");

  const config = {
    cost: { title: "Add a monthly bill", sub: "Anything that arrives every month whether you open or not." },
    "cash-start": { title: "Start counting cash", sub: "How much is in the drawer right now?" },
    "cash-entry": { title: "Money in or out", sub: "Cash sales are counted already — this is everything else." },
    utang: { title: "Record utang", sub: "Who owes, and how much." },
    asset: { title: "Add what you put in", sub: "Equipment, the cart, the signage." },
  }[which];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(b) || 0;
    if (which === "cost") run(() => saveFixedCost({ label: a, amount }), onClose);
    else if (which === "cash-start") run(() => startCashTracking(Number(a) || 0), onClose);
    else if (which === "cash-entry")
      run(() => addCashEntry({ type: dir, amount: Number(a) || 0, note: b }), onClose);
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
            <Field label="How much (₱)">
              <input value={a} onChange={(e) => setA(e.target.value)} type="number"
                step="0.01" min="0" inputMode="decimal" autoFocus className={inputClass} />
            </Field>
            <Field label="What for">
              <input value={b} onChange={(e) => setB(e.target.value)}
                placeholder="e.g. bought ice, tricycle fare" className={inputClass} />
            </Field>
          </>
        ) : which === "cash-start" ? (
          <Field label="In the drawer now (₱)">
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
