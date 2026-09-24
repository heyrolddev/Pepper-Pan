"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso, pesoRound } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import { ACCOUNT_LABELS, type Account } from "@/lib/money-accounts";
import {
  SPEND_HINT,
  SPEND_KINDS,
  SPEND_LABEL,
  type RunningCost,
  type SpendKind,
  type TankLife,
} from "@/lib/spending";
import type { Supplier } from "@/lib/suppliers";
import { deleteRunningCost, recordSpend } from "@/app/admin/money/spending-actions";

/**
 * Everything the shop buys that is not an ingredient.
 *
 * One button, because from where the owner stands it is one action — "I
 * bought something" — and the differences are questions the form asks rather
 * than four screens to choose between. Where it lands depends on the answer:
 *
 *   supplies / gas / repair / other → running costs, and into break-even
 *   a new bit of kit                → assets, and into payback
 *
 * Rent is deliberately not on this list. It is not a purchase; it is a
 * standing monthly figure that the break-even sum divides, and it has its own
 * editor further down the page. Putting it here would invite it to be entered
 * as a purchase as well as a standing cost, and counted twice.
 *
 * ── The gas warning ──────────────────────────────────────────────────────
 *
 * The owner's question was the good one: gas does not run out on a schedule,
 * it runs out according to how many orders went through, and the price moves.
 * So there is no fixed figure to put anywhere — but there IS a pattern in the
 * refill dates, and it costs nothing to keep. Two refills of a size and the
 * shop can be told how long that size usually lasts and how far into it they
 * are. No weighing, no stock count, no discipline required.
 */

const boxClass =
  "w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400";

type Kind = SpendKind | "asset";

export function SpendPanel({
  runningCosts,
  runningForWindow,
  monthlyRate,
  windowDays,
  tanks,
  suppliers,
  openPots,
}: {
  runningCosts: RunningCost[];
  runningForWindow: number;
  monthlyRate: number;
  windowDays: number;
  tanks: TankLife[];
  suppliers: Supplier[];
  openPots: Account[];
}) {
  const [open, setOpen] = useState(false);
  const [seeAll, setSeeAll] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RunningCost | null>(null);
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {problem && (
        <p className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
          {problem}
        </p>
      )}

      {/* Before anything else: is the gas about to go? It is the one thing on
          this panel that stops service if it is missed. */}
      {tanks.length > 0 && <Tanks tanks={tanks} />}

      <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-ink-800/70">
            Spent over the last {windowDays} days
          </span>
          <span className="font-display text-xl font-black tabular-nums text-ink-950">
            {peso(runningForWindow)}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-800/55">
          That works out at <strong className="text-ink-950">{pesoRound(monthlyRate)}</strong>{" "}
          a month, and break-even now carries it. It didn&apos;t before —
          supplies, gas and repairs were in no sum anywhere, so the shop was
          told it needed less a day than it really did.
        </p>
      </div>

      <div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
        >
          + Record a spend
        </button>
      </div>

      {runningCosts.length === 0 ? (
        <p className="text-sm text-ink-800/55">
          Nothing recorded yet. Paper towels, alcohol, batteries, a gas refill,
          a repair — anything that gets used up and isn&apos;t an ingredient.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {runningCosts.slice(0, 4).map((r) => (
              <Line key={r.id} row={r} onRemove={setConfirmRemove} />
            ))}
          </ul>
          {runningCosts.length > 4 && (
            <button
              onClick={() => setSeeAll(true)}
              className="self-start text-sm font-bold text-brand-600 hover:underline"
            >
              See all {runningCosts.length} →
            </button>
          )}
        </>
      )}

      {seeAll && (
        <AdminDialog
          title="Everything the shop used up"
          subtitle={`${runningCosts.length} in the last ${windowDays} days, ${peso(runningForWindow)} in total.`}
          onClose={() => setSeeAll(false)}
        >
          <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
            {runningCosts.map((r) => (
              <Line
                key={r.id}
                row={r}
                onRemove={(row) => {
                  setSeeAll(false);
                  setConfirmRemove(row);
                }}
              />
            ))}
          </ul>
        </AdminDialog>
      )}

      {open && (
        <SpendDialog
          suppliers={suppliers}
          openPots={openPots}
          onClose={() => setOpen(false)}
        />
      )}

      {confirmRemove && (
        <RemoveDialog
          row={confirmRemove}
          busy={busy}
          onClose={() => setConfirmRemove(null)}
          onRemove={() =>
            startBusy(async () => {
              setProblem(null);
              const res = await deleteRunningCost(confirmRemove.id);
              if (res.error) setProblem(res.error);
              else setConfirmRemove(null);
            })
          }
        />
      )}
    </div>
  );
}

/**
 * Taking a spend back out.
 *
 * Says which of the two things it is about to do, because they are genuinely
 * different and the owner cannot tell them apart by looking at the row. A
 * spend paid out of a pot gets its pesos put back; one taken on utang never
 * moved any, and its debt is a separate row on the utang panel with its own
 * Remove — so this says so rather than leaving the owner to discover that the
 * money they thought they had just un-spent is still owed.
 */
function RemoveDialog({
  row,
  busy,
  onClose,
  onRemove,
}: {
  row: RunningCost;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const paid = row.ledgerId !== null;
  return (
    <AdminDialog
      title="Remove this spend?"
      subtitle="Only for something recorded by mistake — a wrong figure, or the same thing twice."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
          <strong className="text-ink-950">{row.label}</strong> —{" "}
          {SPEND_LABEL[row.kind]} · {formatDate(row.spentOn)}
          <span className="mt-1 block font-display text-lg font-black text-ink-950">
            {peso(row.amount)}
          </span>
        </p>
        <p
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            paid
              ? "bg-jade-600/10 text-ink-800/80 ring-1 ring-jade-600/25"
              : "bg-gold-400/20 text-ink-800/80 ring-1 ring-gold-500/35"
          }`}
        >
          {paid ? (
            <>
              <strong className="text-ink-950">{peso(row.amount)} goes back</strong>{" "}
              into the pot it came out of, so the drawer still counts. Both the
              spend and its money line disappear together.
            </>
          ) : (
            <>
              This one moved no money — it was taken on utang, or recorded
              before the shop started linking the two.{" "}
              <strong className="text-ink-950">
                Nothing comes back into a pot.
              </strong>{" "}
              If a debt was raised for it, remove that on the utang panel too.
            </>
          )}
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
            onClick={onRemove}
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

function Line({
  row,
  onRemove,
}: {
  row: RunningCost;
  onRemove: (row: RunningCost) => void;
}) {
  return (
    <li className="group flex items-center justify-between gap-3 rounded-xl bg-cream-50 px-4 py-2.5 ring-1 ring-ink-950/10">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink-950">
          {row.label}
          {row.sizeLabel && (
            <span className="ml-2 rounded-full bg-ink-950/8 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/60">
              {row.sizeLabel}
            </span>
          )}
        </span>
        <span className="text-xs text-ink-800/55">
          {SPEND_LABEL[row.kind]} · {formatDate(row.spentOn)}
          {row.supplierName && <> · {row.supplierName}</>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="font-display font-black tabular-nums text-ink-950">
          {peso(row.amount, 0)}
        </span>
        {/* Quiet until it is wanted. Removing a spend is rare and mildly
            destructive, so it does not compete with the figure beside it —
            but it stays reachable by keyboard and is always visible on a
            touch screen, where there is no hover to reveal it. */}
        <button
          onClick={() => onRemove(row)}
          aria-label={`Remove ${row.label}`}
          title="Recorded by mistake?"
          className="rounded-lg px-1.5 py-1 text-xs font-bold text-ink-800/35 transition-colors hover:bg-brand-600/10 hover:text-brand-700 focus-visible:text-brand-700 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        >
          ✕
        </button>
      </span>
    </li>
  );
}

/**
 * How long each tank lasts, and how far into it the shop is.
 *
 * Nothing here was typed in. It is the gaps between the refills the owner
 * already recorded, which is the only measurement of gas usage that a busy
 * stall will ever actually keep.
 */
function Tanks({ tanks }: { tanks: TankLife[] }) {
  return (
    <div className="flex flex-col gap-2">
      {tanks.map((t) => {
        const left = t.days === null ? null : t.days - t.sinceLast;
        const soon = left !== null && left <= 3;
        return (
          <div
            key={t.size}
            className={`rounded-2xl px-4 py-3 ring-1 ${
              t.dueNow
                ? "bg-brand-600 text-cream-50 ring-brand-700/30"
                : soon
                  ? "bg-gold-400 text-ink-950 ring-gold-500/40"
                  : "bg-cream-50 text-ink-950 ring-ink-950/10"
            }`}
          >
            <p className="text-[11px] font-black uppercase tracking-widest opacity-70">
              Gas · {t.size}
            </p>
            {t.days === null ? (
              <p className="mt-1 text-sm">
                Last one {formatDate(t.lastOn)} at {peso(t.lastPaid, 0)}. Record
                one more and this will tell you how long a {t.size} lasts you —
                one refill is a date, not a pattern.
              </p>
            ) : (
              <p className="mt-1 text-sm leading-relaxed">
                A {t.size} lasts you about{" "}
                <strong className="font-black">{t.days} days</strong>. You&apos;re
                on day <strong className="font-black">{t.sinceLast}</strong>.{" "}
                {t.dueNow ? (
                  <strong className="font-black">Order one now.</strong>
                ) : soon ? (
                  <strong className="font-black">
                    About {left} {left === 1 ? "day" : "days"} left.
                  </strong>
                ) : (
                  <>Roughly {left} days to go.</>
                )}
              </p>
            )}
            <p className="mt-1 text-[11px] opacity-60">
              Last paid {peso(t.lastPaid, 0)} on {formatDate(t.lastOn)} · from{" "}
              {t.refills} refill{t.refills === 1 ? "" : "s"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SpendDialog({
  suppliers,
  openPots,
  onClose,
}: {
  suppliers: Supplier[];
  openPots: Account[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>("supplies");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [sizeLabel, setSizeLabel] = useState("22kg");
  const [paidFrom, setPaidFrom] = useState<Account | "unpaid">(openPots[0] ?? "cash");
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    setProblem(null);
    startBusy(async () => {
      const res = await recordSpend({
        label,
        kind,
        amount: Number(amount) || 0,
        sizeLabel,
        paidFrom,
        supplierId,
        note,
      });
      if (res.error) setProblem(res.error);
      else onClose();
    });
  }

  return (
    <AdminDialog
      title="Record a spend"
      subtitle="Money that left for something other than ingredients."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            What kind
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...SPEND_KINDS, "asset" as const].map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  // "Gas refill" is the label nine times out of ten. Filling it
                  // in beats making somebody type it at every refill.
                  if (k === "gas" && !label.trim()) setLabel("Gas refill");
                }}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                  kind === k
                    ? "bg-ink-950 text-gold-400"
                    : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                }`}
              >
                {k === "asset" ? "New equipment" : SPEND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-800/50">
            {kind === "asset"
              ? "A freezer, a storage box, a new pan — money turned into a thing that's still there afterwards. Not a cost: it counts toward payback."
              : SPEND_HINT[kind]}
          </p>
        </div>

        <Field label="What was it">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              kind === "gas"
                ? "Gas refill"
                : kind === "asset"
                  ? "Chest freezer"
                  : "Alcohol, paper towels"
            }
            className={boxClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How much">
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
                className={`${boxClass} pl-7`}
              />
            </span>
          </Field>
          {kind === "gas" && (
            <Block label="Tank size" hint="The price moves; the size doesn't.">
              <div className="grid grid-cols-2 gap-2">
                {["22kg", "11kg"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSizeLabel(s)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                      sizeLabel === s
                        ? "bg-ink-950 text-gold-400"
                        : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Block>
          )}
        </div>

        {suppliers.length > 0 && (
          <Block label="Who from" hint="Optional.">
            <div className="flex flex-wrap gap-2">
              {suppliers
                .filter((s) => s.active)
                .slice(0, 8)
                .map((s) => (
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
          </Block>
        )}

        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Paid from
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {openPots.map((a) => (
              <button
                key={a}
                onClick={() => setPaidFrom(a)}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                  paidFrom === a
                    ? "bg-ink-950 text-gold-400"
                    : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                }`}
              >
                {ACCOUNT_LABELS[a].replace(" in the drawer", "")}
              </button>
            ))}
            <button
              onClick={() => setPaidFrom("unpaid")}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                paidFrom === "unpaid"
                  ? "bg-gold-400 text-ink-950"
                  : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
              }`}
            >
              Utang
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-800/50">
            {paidFrom === "unpaid"
              ? "No money moves now — it goes on the list of what the shop owes, and pays out of a pot when you settle it."
              : `Comes straight out of ${ACCOUNT_LABELS[paidFrom]}.`}
          </p>
        </div>

        <Field label="Note" hint="Optional.">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={boxClass}
          />
        </Field>

        {problem && (
          <p className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
            {problem}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
          >
            Never mind
          </button>
          <button
            onClick={save}
            disabled={busy || !label.trim() || !(Number(amount) > 0)}
            className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Recording…" : "Record it"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

/**
 * A labelled group that is NOT a <label>.
 *
 * Anything holding buttons has to use this rather than `Field`. A <button>
 * inside a <label> is invalid nesting: the label takes over the buttons'
 * accessible name, so a screen reader — and a test — cannot find them, and
 * tapping one also activates whatever control the label points at.
 */
function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink-800/45">{hint}</span>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink-800/45">{hint}</span>}
    </label>
  );
}
