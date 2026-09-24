"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { formatDate } from "@/lib/format-date";
import { peso } from "@/lib/peso";
import { ACCOUNT_LABELS, type Account } from "@/lib/money-accounts";
import type { Debt } from "@/lib/money-server";
import type { Supplier } from "@/lib/suppliers";
import { addDebt, deleteDebt, settleDebt } from "@/app/admin/money/spending-actions";

/**
 * What Pepper Pan owes.
 *
 * The money screen has had an "Utang" panel since the beginning and it points
 * the other way — customers who owe the shop. This is the side that was
 * missing entirely: take a delivery on the supplier's credit and the stock
 * arrived, the cost was logged, and the obligation was recorded nowhere at
 * all. So the shop's balance counted pesos that were already spoken for, and
 * the only list of who was owed lived in somebody's head.
 *
 * ── Why paying is three buttons and not a form ───────────────────────────
 *
 * Because paying a supplier in full is what happens most of the time, and it
 * should cost one tap. Half is the next most common — it is how a shop keeps
 * a supplier sweet on a thin week — so it is also one tap, with the figure
 * worked out rather than typed. Anything else opens a box.
 *
 * ── Why the money leaves here and not at the delivery ────────────────────
 *
 * Because that is when it leaves. The cash sits in the drawer until the
 * supplier is actually paid, and a ledger line written at delivery time would
 * make the drawer fail a physical count — which is the one self-correcting
 * check the money screen has.
 */

const SHOWN = 4;

export function SupplierDebts({
  debts,
  owedToSuppliers,
  totalHeld,
  openPots,
  suppliers,
}: {
  debts: Debt[];
  owedToSuppliers: number;
  /** What every pot holds, so the screen can say what is actually the shop's. */
  totalHeld: number;
  openPots: Account[];
  /** For naming who is owed. Optional: an utang can be to somebody who is not
   *  on the supplier list yet, and the shop should not have to add them first
   *  just to write down that it owes them money. */
  suppliers: Supplier[];
}) {
  const [seeAll, setSeeAll] = useState(false);
  const [paying, setPaying] = useState<{ debt: Debt; amount: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Debt | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const open = debts.filter((d) => d.amount - d.paid > 0.001);

  /**
   * Always offered, even with nothing owed — and that is the point of it.
   *
   * A debt could only ever get here one way: by taking a delivery on credit
   * through Inventory. Borrow ₱2,000 off Aling Nena for a gas tank, or agree
   * to pay the landlord's helper next week, and there was nowhere to write it
   * down at all. So the shop's "Actually yours" figure counted pesos that were
   * already spoken for — the exact thing this panel exists to prevent, missing
   * for every obligation that did not arrive as a delivery.
   */
  const addButton = (
    <div>
      <button
        onClick={() => setAdding(true)}
        className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
      >
        + Record an utang
      </button>
    </div>
  );

  const dialogs = (
    <>
      {adding && (
        <AddDialog
          suppliers={suppliers}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );

  if (open.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-800/60">
          Nothing owed. Every delivery is paid for.{" "}
          <span className="text-ink-800/45">
            A delivery taken on utang turns up here on its own — the stock
            arrives, no money moves, and the shop owes it until you say it&apos;s
            paid. Anything else the shop owes, write down below.
          </span>
        </p>
        {addButton}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {problem && (
        <p className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
          {problem}
        </p>
      )}

      <List
        rows={open.slice(0, SHOWN)}
        onPay={(debt, amount) => setPaying({ debt, amount })}
        onRemove={setConfirmRemove}
      />

      {open.length > SHOWN && (
        <button
          onClick={() => setSeeAll(true)}
          className="self-start text-sm font-bold text-brand-600 hover:underline"
        >
          See all {open.length} →
        </button>
      )}

      {addButton}

      {/* The subtraction, which is the whole reason this panel is on the money
          screen and not a page of its own. The pots really do hold what they
          say — that figure has to stay checkable against a physical count —
          but not all of it is the shop's to spend. */}
      <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
        <Line label="Pepper Pan Bank holds" value={peso(totalHeld)} />
        <Line label="− owed to suppliers" value={peso(owedToSuppliers)} minus />
        <div className="mt-2 flex items-center justify-between border-t-2 border-ink-950/15 pt-2">
          <span className="text-sm font-bold text-ink-950">Actually yours</span>
          <span
            className={`font-display text-xl font-black tabular-nums ${
              totalHeld - owedToSuppliers < 0 ? "text-brand-700" : "text-ink-950"
            }`}
          >
            {peso(totalHeld - owedToSuppliers)}
          </span>
        </div>
        {totalHeld - owedToSuppliers < 0 && (
          <p className="mt-2 text-xs leading-relaxed text-brand-700">
            The shop owes more than it holds. Nothing is broken — this is what
            buying on credit looks like — but it is worth knowing before
            spending any of it.
          </p>
        )}
      </div>

      {seeAll && (
        <AdminDialog
          title="Everything owed"
          subtitle={`${open.length} unpaid, ${peso(owedToSuppliers)} in total.`}
          onClose={() => setSeeAll(false)}
        >
          <div className="max-h-[55vh] overflow-y-auto">
            <List
              rows={open}
              onPay={(debt, amount) => {
                setSeeAll(false);
                setPaying({ debt, amount });
              }}
              onRemove={(d) => {
                setSeeAll(false);
                setConfirmRemove(d);
              }}
            />
          </div>
        </AdminDialog>
      )}

      {paying && (
        <PayDialog
          debt={paying.debt}
          amount={paying.amount}
          openPots={openPots}
          busy={busy}
          onClose={() => setPaying(null)}
          onPay={(amount, account) => {
            setProblem(null);
            startBusy(async () => {
              const res = await settleDebt({ id: paying.debt.id, amount, account });
              if (res.error) setProblem(res.error);
              else setPaying(null);
            });
          }}
        />
      )}

      {dialogs}

      {confirmRemove && (
        <AdminDialog
          title="Remove this debt?"
          subtitle="Only do this if it was recorded by mistake — it does not pay anybody."
          onClose={() => setConfirmRemove(null)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
              <strong className="text-ink-950">{confirmRemove.description}</strong>
              {confirmRemove.supplierName && <> — {confirmRemove.supplierName}</>}
              <span className="mt-1 block font-display text-lg font-black text-ink-950">
                {peso(confirmRemove.amount - confirmRemove.paid)}
              </span>
            </p>
            <p className="text-sm leading-relaxed text-ink-800/70">
              If you actually paid it, use <strong className="text-ink-950">Paid</strong>{" "}
              instead — that records the money leaving. Removing it just makes
              the debt disappear, and the pesos stay where they are.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
              >
                Keep it
              </button>
              <button
                onClick={() =>
                  startBusy(async () => {
                    setProblem(null);
                    const res = await deleteDebt(confirmRemove.id);
                    if (res.error) setProblem(res.error);
                    else setConfirmRemove(null);
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
      )}
    </div>
  );
}

function Line({
  label,
  value,
  minus,
}: {
  label: string;
  value: string;
  minus?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm text-ink-800/70">{label}</span>
      <span
        className={`font-display font-bold tabular-nums ${
          minus ? "text-brand-700" : "text-ink-950"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function List({
  rows,
  onPay,
  onRemove,
}: {
  rows: Debt[];
  onPay: (debt: Debt, amount: number) => void;
  onRemove: (debt: Debt) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((d) => {
        const left = d.amount - d.paid;
        const part = d.paid > 0;
        return (
          <li
            key={d.id}
            className="rounded-2xl border-l-[6px] border-gold-400 bg-cream-50 p-4 ring-1 ring-ink-950/10"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-950">
                  {d.supplierName || "Supplier"}
                </p>
                <p className="mt-0.5 text-xs text-ink-800/55">
                  {d.description} · {formatDate(d.incurredOn)}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-display text-lg font-black tabular-nums text-ink-950">
                  {peso(left)}
                </span>
                {/* A part payment is a fact worth seeing. "₱800 of ₱2,100"
                    tells the owner something a boolean never could. */}
                {part && (
                  <span className="text-[11px] text-ink-800/50">
                    {peso(d.paid, 0)} of {peso(d.amount, 0)} paid
                  </span>
                )}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onPay(d, left)}
                className="rounded-lg bg-jade-600 px-4 py-1.5 text-xs font-black text-cream-50 hover:bg-jade-700"
              >
                Paid
              </button>
              <button
                onClick={() => onPay(d, Math.round(left * 50) / 100)}
                className="rounded-lg bg-ink-950/8 px-3 py-1.5 text-xs font-bold text-ink-800 hover:bg-ink-950/15"
              >
                Half — {peso(Math.round(left * 50) / 100, 0)}
              </button>
              <button
                onClick={() => onPay(d, 0)}
                className="rounded-lg bg-ink-950/8 px-3 py-1.5 text-xs font-bold text-ink-800 hover:bg-ink-950/15"
              >
                Custom
              </button>
              {!part && (
                <button
                  onClick={() => onRemove(d)}
                  className="ml-auto rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/40 hover:text-brand-700"
                >
                  Remove
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Writing down money the shop owes somebody.
 *
 * Deliberately three fields and no money movement. A debt recorded here is an
 * obligation, not a transaction — nothing leaves a pot, nothing lands in the
 * ledger — which is the same rule the rest of this panel runs on and the
 * reason the drawer keeps passing a physical count. The pesos move when
 * somebody taps Paid.
 *
 * The supplier is optional, and stays optional on purpose. Half the utang a
 * stall takes on is to a person rather than to a supplier the shop buys stock
 * from, and forcing them onto the supplier list first is the sort of friction
 * that ends with the debt not being written down at all — which is strictly
 * worse than a debt with a name in the description.
 */
function AddDialog({
  suppliers,
  onClose,
}: {
  suppliers: Supplier[];
  onClose: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const owed = Number(amount) || 0;
  const active = suppliers.filter((s) => s.active);

  return (
    <AdminDialog
      title="Record an utang"
      subtitle="Something the shop owes and hasn't paid for yet. No money moves until you tap Paid."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        {problem && (
          <p className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
            {problem}
          </p>
        )}

        {active.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
              Who is owed{" "}
              <span className="font-bold normal-case tracking-normal text-ink-800/40">
                · optional
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {active.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSupplierId(supplierId === s.id ? "" : s.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                    supplierId === s.id
                      ? "bg-ink-950 text-gold-400"
                      : "bg-ink-950/5 text-ink-800/65 hover:bg-ink-950/10"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-800/50">
              Not on the list? Leave it and put the name in what it was for —
              an utang to somebody who isn&apos;t a supplier is still an utang.
            </p>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            What it was for
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Gas tank from Aling Nena"
            className="w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            How much is owed
          </span>
          <span className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-sm font-bold text-ink-800/40">
              ₱
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl bg-cream-50 py-2.5 pl-7 pr-3 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Note{" "}
            <span className="font-bold normal-case tracking-normal text-ink-800/40">
              · optional
            </span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Said we'd pay by Friday"
            className="w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </label>

        {/* The consequence, before it happens. This panel's whole job is the
            subtraction below it, so the one thing worth saying up front is
            which way this moves it. */}
        {owed > 0 && (
          <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-gold-500/35">
            <strong className="text-ink-950">{peso(owed)}</strong> comes off
            what&apos;s actually yours. The pesos stay in the drawer until you
            pay.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              startBusy(async () => {
                setProblem(null);
                const res = await addDebt({
                  supplierId,
                  description,
                  amount: owed,
                  note,
                });
                if (res.error) setProblem(res.error);
                else onClose();
              })
            }
            disabled={busy || owed <= 0 || !description.trim()}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "Recording…" : "Record it"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

function PayDialog({
  debt,
  amount,
  openPots,
  busy,
  onClose,
  onPay,
}: {
  debt: Debt;
  /** Pre-filled from which button was tapped. 0 means "you type it". */
  amount: number;
  openPots: Account[];
  busy: boolean;
  onClose: () => void;
  onPay: (amount: number, account: Account) => void;
}) {
  const left = debt.amount - debt.paid;
  const [value, setValue] = useState(amount > 0 ? String(amount) : "");
  const [account, setAccount] = useState<Account>(openPots[0] ?? "cash");
  const paying = Math.min(Number(value) || 0, left);

  return (
    <AdminDialog
      title={`Pay ${debt.supplierName || "supplier"}`}
      subtitle={`${debt.description} — ${peso(left)} still owed.`}
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            How much
          </span>
          <span className="relative flex items-center">
            <span className="pointer-events-none absolute left-3 text-sm font-bold text-ink-800/40">
              ₱
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={left}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus={amount === 0}
              className="w-full rounded-xl bg-cream-50 py-2.5 pl-7 pr-3 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
            />
          </span>
        </label>

        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Out of which pot
          </p>
          <div className="grid grid-cols-3 gap-2">
            {openPots.map((a) => (
              <button
                key={a}
                onClick={() => setAccount(a)}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                  account === a
                    ? "bg-ink-950 text-gold-400"
                    : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                }`}
              >
                {ACCOUNT_LABELS[a].replace(" in the drawer", "")}
              </button>
            ))}
          </div>
        </div>

        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm leading-relaxed text-ink-800/70">
          {peso(paying)} comes out of{" "}
          <strong className="text-ink-950">{ACCOUNT_LABELS[account]}</strong> now
          — this is the moment the money actually leaves.
          {paying < left && paying > 0 && (
            <> {peso(left - paying)} stays owed.</>
          )}
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
          >
            Never mind
          </button>
          <button
            onClick={() => onPay(paying, account)}
            disabled={busy || paying <= 0}
            className="rounded-xl bg-jade-600 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-jade-700 disabled:opacity-50"
          >
            {busy ? "Recording…" : `Pay ${peso(paying, 0)}`}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}
