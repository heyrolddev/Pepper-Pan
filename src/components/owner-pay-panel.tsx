"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso, pesoRound } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import { ACCOUNT_LABELS, type Account } from "@/lib/money-accounts";
import { payLine, type DrawRow, type PayState } from "@/lib/owner-pay";
import type { OwnerPay } from "@/lib/owner-pay-server";
import {
  deletePay,
  editPay,
  setPayBudget,
  takePay,
} from "@/app/admin/money/pay-actions";

/**
 * The owner's own pay, on the screen they already check.
 *
 * ── Why a meter and not a chart ──────────────────────────────────────────
 *
 * There is one measure and one target. "How much of my pay is left" is a
 * single number against a line, which is a meter — a chart of it would be a
 * bar chart with one bar, which is a number wearing a costume.
 *
 * ── Why LEFT is the big number ───────────────────────────────────────────
 *
 * Left and taken are the same fact stated twice, and only one of them is the
 * answer to the question being asked while standing at the drawer: can I take
 * ₱2,000 out of this right now. Taken is history. Left is the decision, so
 * left is set in the display face and taken is a line of small print.
 *
 * ── Why the colour is never doing the work ───────────────────────────────
 *
 * The meter turns red when the budget is overdrawn, AND the sentence under it
 * says so in words, AND the state has a name beside it. Three because two of
 * the three fail routinely: colour alone is unreadable to a good number of
 * people, and this shop's questions arrive as photographs of a screen sent
 * over Messenger, where a hue survives and a meaning does not.
 *
 * ── Over budget is not an error ──────────────────────────────────────────
 *
 * It is the owner's money either way. Going over means the extra stopped
 * being wages and became profit taken early, which is a thing worth knowing
 * and not a thing worth scolding somebody for. A red error on a person
 * spending their own money is a screen they stop reading.
 */

/** One row of the state table: the fill, the ink, and the word for it. */
const STATE: Record<PayState, { fill: string; ink: string; word: string }> = {
  // Validated against this panel's own surfaces rather than chosen: every
  // fill clears 3:1 on the cream-200 track, every ink clears 4.5:1 on the
  // cream-100 panel. gold-600 failed the track at 2.46:1 and was stepped down
  // to gold-700, which passes at 4.41:1.
  unset: { fill: "bg-ink-950/25", ink: "text-ink-800/70", word: "No budget set" },
  within: { fill: "bg-jade-600", ink: "text-jade-700", word: "On track" },
  close: { fill: "bg-gold-700", ink: "text-gold-700", word: "Nearly used up" },
  spent: { fill: "bg-chili-600", ink: "text-chili-700", word: "Fully drawn" },
  over: { fill: "bg-brand-600", ink: "text-brand-700", word: "Over budget" },
};

const MONTH = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" });

export function OwnerPayPanel({
  pay,
  openPots,
}: {
  pay: OwnerPay;
  openPots: Account[];
}) {
  const [taking, setTaking] = useState(false);
  const [editing, setEditing] = useState<DrawRow | null>(null);
  const [removing, setRemoving] = useState<DrawRow | null>(null);
  const [budgeting, setBudgeting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = pay.month;
  const tone = STATE[m.state];
  const monthName = MONTH.format(new Date());

  return (
    <div className="flex flex-col gap-5">
      {/* ── the headline ──────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Your pay · {monthName}
          </p>
          {/* The state as a word, beside the colour rather than instead of it. */}
          <p className={`text-[11px] font-black uppercase tracking-widest ${tone.ink}`}>
            {tone.word}
          </p>
        </div>

        {/* The headline is whichever number a decision hangs on, which is not
            the same number in every state. Inside the budget it is what is
            LEFT — the answer to "can I take ₱2,000 out of this drawer right
            now". Over it, "₱0 left" is true and useless: what matters then is
            how far over, because that is the part that stopped being wages. */}
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span className="font-display text-4xl font-black leading-none tabular-nums text-ink-950 sm:text-5xl">
            {m.state === "unset"
              ? pesoRound(m.taken)
              : m.state === "over"
                ? pesoRound(m.over)
                : pesoRound(m.left)}
          </span>
          <span className="text-sm font-bold text-ink-800/60">
            {m.state === "unset"
              ? "taken this month"
              : m.state === "over"
                ? `over your ${pesoRound(m.budget)}`
                : `left of ${pesoRound(m.budget)}`}
          </span>
        </p>

        {/* ── the meter ───────────────────────────────────────────────────
            Drawn only when there is a budget to measure against. A track with
            nothing in it, under a heading about a budget nobody has set, reads
            as a thing that is broken rather than a thing that is empty. */}
        {m.state !== "unset" && (
          <div
            className="mt-4"
            role="img"
            aria-label={`${pesoRound(m.taken)} of ${pesoRound(m.budget)} taken. ${tone.word}.`}
          >
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-cream-200">
              <span
                className={`h-full rounded-full transition-[width] duration-500 ${tone.fill}`}
                style={{ width: `${Math.max(m.pct, m.taken > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[11px] font-bold tabular-nums text-ink-800/50">
              <span>{pesoRound(m.taken)} taken</span>
              <span>{pesoRound(m.budget)}</span>
            </div>
          </div>
        )}

        {/* The sentence. Says the state in words, always. */}
        <p className="mt-3 text-sm leading-relaxed text-ink-800/75">
          {payLine(m, pay.daysLeft)}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => {
              setError(null);
              setTaking(true);
            }}
            className="rounded-2xl bg-ink-950 px-5 py-3 text-sm font-black text-gold-400 transition-transform hover:scale-105"
          >
            Take pay
          </button>
          <button
            onClick={() => {
              setError(null);
              setBudgeting(true);
            }}
            className="rounded-2xl bg-cream-50 px-4 py-3 text-sm font-bold text-ink-800/75 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
          >
            {pay.budgetId ? "Change the budget" : "Set your monthly pay"}
          </button>
        </div>

        {pay.budgetLabel && (
          <p className="mt-2 text-xs text-ink-800/45">
            Budget taken from the standing cost{" "}
            <strong className="font-bold text-ink-800/70">{pay.budgetLabel}</strong> —
            already counted once in break-even, which is why drawing it is not a
            second cost.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-2xl bg-brand-600/10 px-4 py-2.5 text-sm font-bold text-brand-700 ring-1 ring-brand-600/25">
            {error}
          </p>
        )}
      </div>

      {/* ── what has been taken ───────────────────────────────────────── */}
      {pay.draws.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 px-5 py-6 text-sm text-ink-800/65">
          Nothing taken this month yet. When you do, it comes out of the pot you
          choose and shows in the drawer&apos;s own history as{" "}
          <strong className="text-ink-950">Owner&apos;s pay</strong> — so whoever
          counts the drawer tonight is not left short with no explanation.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pay.draws.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-cream-100 px-4 py-3 ring-1 ring-ink-950/[0.07]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold text-ink-950">
                  {(d.note ?? "Owner's pay").replace(/^Owner's pay — /, "")}
                </span>
                <span className="text-xs text-ink-800/55">
                  {formatDate(d.date)} · {ACCOUNT_LABELS[d.account as Account] ?? d.account}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="font-display text-base font-black tabular-nums text-ink-950">
                  {peso(d.amount)}
                </span>
                {/* Edit and remove on every row. A figure typed at the counter
                    with one hand is a figure that gets typed wrong, and a
                    money screen you cannot correct is one people stop using. */}
                <button
                  onClick={() => {
                    setError(null);
                    setEditing(d);
                  }}
                  aria-label={`Change this ${peso(d.amount)} entry`}
                  className="ml-1 rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/5 hover:text-ink-950"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setRemoving(d);
                  }}
                  aria-label={`Remove this ${peso(d.amount)} entry`}
                  className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/70 transition-colors hover:bg-brand-600/10 hover:text-brand-600"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {taking && (
        <PayForm
          openPots={openPots}
          onClose={() => setTaking(false)}
          onError={setError}
        />
      )}
      {editing && (
        <PayForm
          row={editing}
          openPots={openPots}
          onClose={() => setEditing(null)}
          onError={setError}
        />
      )}
      {removing && (
        <RemovePay
          row={removing}
          onClose={() => setRemoving(null)}
          onError={setError}
        />
      )}
      {budgeting && (
        <BudgetPicker
          pay={pay}
          onClose={() => setBudgeting(false)}
          onError={setError}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

/**
 * Taking pay, and changing it, in one form.
 *
 * The same four fields either way, so there is one thing to learn rather than
 * two — and an edit that looks different from the entry it corrects is an
 * edit people avoid making.
 */
function PayForm({
  row,
  openPots,
  onClose,
  onError,
}: {
  row?: DrawRow;
  openPots: Account[];
  onClose: () => void;
  onError: (m: string | null) => void;
}) {
  const editingRow = row ?? null;
  const [amount, setAmount] = useState(editingRow ? String(editingRow.amount) : "");
  const [account, setAccount] = useState<Account>(
    (editingRow?.account as Account) ?? openPots[0] ?? "cash"
  );
  const [note, setNote] = useState(
    (editingRow?.note ?? "").replace(/^Owner's pay — /, "").replace(/^Owner's pay$/, "")
  );
  const [when, setWhen] = useState(editingRow?.date ?? "");
  const [busy, startBusy] = useTransition();

  function save() {
    const value = Number(amount);
    if (!(value > 0)) {
      onError("How much are you taking?");
      return;
    }
    startBusy(async () => {
      const result = editingRow
        ? await editPay({ id: editingRow.id, amount: value, account, note, spentOn: when })
        : await takePay({ amount: value, account, note, spentOn: when });
      if (result.error) onError(result.error);
      else {
        onError(null);
        onClose();
      }
    });
  }

  return (
    <AdminDialog
      title={editingRow ? "Change this pay entry" : "Take your pay"}
      subtitle={
        editingRow
          ? "The pot moves with it, so the drawer still counts."
          : "Money out of the pot, measured against your monthly pay. Never counted as a cost of the shop."
      }
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-ink-800/55">
            How much
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="2000"
            className="rounded-2xl bg-cream-100 px-4 py-3 font-display text-2xl font-black tabular-nums text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-brand-600"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-ink-800/55">
            Out of which pot
          </span>
          <div className="flex flex-wrap gap-2">
            {(openPots.length > 0 ? openPots : (["cash"] as Account[])).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAccount(p)}
                aria-pressed={account === p}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                  account === p
                    ? "bg-ink-950 text-cream-50"
                    : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-50"
                }`}
              >
                {ACCOUNT_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-ink-800/55">
            What for <span className="font-bold normal-case tracking-normal text-ink-800/40">— optional, for your own memory</span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Groceries"
            maxLength={120}
            className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-brand-600"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-widest text-ink-800/55">
            Day <span className="font-bold normal-case tracking-normal text-ink-800/40">— leave blank for today</span>
          </span>
          <input
            type="date"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="rounded-2xl bg-cream-100 px-4 py-3 text-sm tabular-nums text-ink-950 outline-none ring-1 ring-ink-950/10 focus:ring-2 focus:ring-brand-600"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-gold-400 hover:bg-ink-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : editingRow ? "Save the change" : "Take it"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

/* ---------------------------------------------------------------- */

function RemovePay({
  row,
  onClose,
  onError,
}: {
  row: DrawRow;
  onClose: () => void;
  onError: (m: string | null) => void;
}) {
  const [busy, startBusy] = useTransition();

  return (
    <AdminDialog
      title="Remove this pay entry?"
      subtitle="Only for something recorded by mistake — a wrong figure, or the same one twice."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
          <strong className="text-ink-950">
            {(row.note ?? "Owner's pay").replace(/^Owner's pay — /, "")}
          </strong>{" "}
          · {formatDate(row.date)}
          <span className="mt-1 block font-display text-lg font-black text-ink-950">
            {peso(row.amount)}
          </span>
        </p>
        <p className="rounded-2xl bg-jade-600/10 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-jade-600/25">
          <strong className="text-ink-950">{peso(row.amount)} goes back</strong> into
          the pot it came out of, and this month&apos;s pay is measured without it
          again. Nothing else changes — a draw was never a cost.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
          >
            Keep it
          </button>
          <button
            onClick={() =>
              startBusy(async () => {
                const r = await deletePay(row.id);
                if (r.error) onError(r.error);
                else {
                  onError(null);
                  onClose();
                }
              })
            }
            disabled={busy}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

/* ---------------------------------------------------------------- */

/**
 * Which standing cost is the owner's pay.
 *
 * A picker over the costs that already exist, rather than a second figure to
 * type. Typing it again would make two numbers for one wage, and the day they
 * disagree the screen would be measuring a month against a budget that is in
 * no sum anywhere else.
 */
function BudgetPicker({
  pay,
  onClose,
  onError,
}: {
  pay: OwnerPay;
  onClose: () => void;
  onError: (m: string | null) => void;
}) {
  const [busy, startBusy] = useTransition();

  function choose(id: string | null) {
    startBusy(async () => {
      const r = await setPayBudget(id);
      if (r.error) onError(r.error);
      else {
        onError(null);
        onClose();
      }
    });
  }

  return (
    <AdminDialog
      title="Which one is your pay?"
      subtitle="Pick the standing monthly cost that is your own wage. Every draw is then measured against it."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        {pay.choices.length === 0 ? (
          <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-gold-500/35">
            There are no standing monthly costs yet. Add your wage as one on the{" "}
            <strong className="text-ink-950">Break-even</strong> panel above —
            call it whatever you like — then come back and pick it here.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {pay.choices.map((c) => {
                const active = c.id === pay.budgetId;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => choose(c.id)}
                      disabled={busy}
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                        active
                          ? "bg-ink-950 text-cream-50"
                          : "bg-cream-100 text-ink-800 ring-1 ring-ink-950/10 hover:bg-cream-50"
                      }`}
                    >
                      <span className="min-w-0 truncate text-sm font-bold">
                        {c.label}
                      </span>
                      <span
                        className={`shrink-0 font-display text-base font-black tabular-nums ${
                          active ? "text-gold-400" : "text-ink-950"
                        }`}
                      >
                        {pesoRound(c.amount)}
                        <span
                          className={`ml-1 text-[10px] font-bold uppercase ${
                            active ? "text-cream-50/50" : "text-ink-800/40"
                          }`}
                        >
                          /mo
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-xs leading-relaxed text-ink-800/55">
              Whichever you pick is already counted once in break-even. That is
              exactly why taking it is not a second cost — the money was
              budgeted before it was drawn.
            </p>

            {pay.budgetId && (
              <button
                onClick={() => choose(null)}
                disabled={busy}
                className="self-start rounded-xl px-1 py-1 text-xs font-bold text-ink-800/50 underline-offset-4 hover:text-brand-600 hover:underline"
              >
                Don&apos;t budget a wage — just record what I take
              </button>
            )}
          </>
        )}
      </div>
    </AdminDialog>
  );
}
