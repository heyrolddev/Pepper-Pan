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
import {
  costPerDay,
  humanSpan,
  type ItemLife,
} from "@/lib/supply-life";
import type { Supplier } from "@/lib/suppliers";
import {
  clearRanOut,
  deleteRunningCost,
  markRanOut,
  recordSpend,
} from "@/app/admin/money/spending-actions";

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
  supplies,
  suppliers,
  openPots,
}: {
  runningCosts: RunningCost[];
  runningForWindow: number;
  monthlyRate: number;
  windowDays: number;
  tanks: TankLife[];
  supplies: ItemLife[];
  suppliers: Supplier[];
  openPots: Account[];
}) {
  const [open, setOpen] = useState(false);
  const [seeAll, setSeeAll] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RunningCost | null>(null);
  const [ranOut, setRanOut] = useState<RunningCost | null>(null);
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

      {/* What the shop's own record says about how long things last. Below
          the gas warning because gas stops service and a bottle of Joy does
          not, and above the spending figure because "buy more tissue" is
          something to do and a monthly total is something to know. */}
      {supplies.length > 0 && <HowLongThingsLast items={supplies} />}

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
              <Line
                key={r.id}
                row={r}
                onRemove={setConfirmRemove}
                onRanOut={setRanOut}
              />
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
                onRanOut={(row) => {
                  setSeeAll(false);
                  setRanOut(row);
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

      {ranOut && (
        <RanOutDialog
          row={ranOut}
          onClose={() => setRanOut(null)}
          onProblem={setProblem}
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
  onRanOut,
}: {
  row: RunningCost;
  onRemove: (row: RunningCost) => void;
  onRanOut: (row: RunningCost) => void;
}) {
  const finished = row.ranOutOn !== null;
  // A repair is done the day it is done. It never "runs out", so offering to
  // record the day it did would be asking a question with no answer.
  const wearsOut = row.kind !== "repair";
  return (
    <li className="group flex items-start justify-between gap-3 rounded-xl bg-cream-50 px-4 py-2.5 ring-1 ring-ink-950/10">
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
          {row.qty > 1 && <> · {row.qty}×</>}
          {row.supplierName && <> · {row.supplierName}</>}
        </span>
        {/* The lifespan, said on the row it was measured from. Two states,
            and they are genuinely different questions: one is finished and
            has an answer, the other is running and is the one that will need
            replacing. */}
        {wearsOut && (
          <button
            onClick={() => onRanOut(row)}
            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
              finished
                ? "bg-jade-600/12 text-jade-700 hover:bg-jade-600/20"
                : "bg-gold-400/25 text-ink-800/70 hover:bg-gold-400/45 hover:text-ink-950"
            }`}
          >
            {finished ? (
              <>Ran out {formatDate(row.ranOutOn!)}</>
            ) : (
              <>+ Naubos na?</>
            )}
          </button>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="font-display font-black tabular-nums text-ink-950">
          {peso(row.amount, 0)}
        </span>
        {/* Quiet, but never hidden.
            
            This was hover-to-reveal on anything wider than a phone, which
            looked tidy and meant the owner on a laptop had no way to find out
            the button existed at all. A control you cannot discover is a
            control that is not there — and the whole point of this one is
            that a mistyped spend stops being permanent. So it stays on
            screen, faint enough not to compete with the figure beside it and
            plain enough to be seen. */}
        <button
          onClick={() => onRemove(row)}
          aria-label={`Remove ${row.label}`}
          title="Recorded by mistake?"
          className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/35 transition-colors hover:bg-brand-600/10 hover:text-brand-700 focus-visible:text-brand-700"
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
  const [qty, setQty] = useState("1");
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
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
        qty: Number(qty) || 1,
        spentOn,
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="When you bought it"
            hint="Today unless you say otherwise. A date three days out makes every lifespan built on it three days short."
          >
            <input
              type="date"
              value={spentOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSpentOn(e.target.value)}
              className={boxClass}
            />
          </Field>
          {/* Equipment is counted, not consumed — two freezers are two
              assets, and asking "how many" here would invite one row saying
              both, which the payback sum cannot then take apart. */}
          {kind !== "asset" && (
            <Field
              label="How many"
              hint="Three tanks in one go? Say 3 — that is three lifespans, not one long one."
            >
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={boxClass}
              />
            </Field>
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

/**
 * The day it ran out.
 *
 * This is the only measurement in the whole feature, and it is made by a
 * person standing in a stall with an empty bottle in their hand. So the
 * dialog does exactly one thing, offers today as the answer because today is
 * the answer nine times out of ten, and says what the shop gets in return —
 * because filling in a date for no visible reason is a habit that lasts
 * about a week.
 *
 * Clearing it is here too, on the same dialog, for the wrong row tapped.
 */
function RanOutDialog({
  row,
  onClose,
  onProblem,
}: {
  row: RunningCost;
  onClose: () => void;
  onProblem: (message: string | null) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(row.ranOutOn ?? today);
  const [busy, startBusy] = useTransition();

  const days = Math.round(
    (new Date(date + "T00:00:00Z").getTime() -
      new Date(row.spentOn + "T00:00:00Z").getTime()) /
      864e5
  );
  const each = row.qty > 1 ? Math.max(1, Math.round(days / row.qty)) : Math.max(1, days);
  const sane = Number.isFinite(days) && days >= 0 && date <= today;

  return (
    <AdminDialog
      title={row.ranOutOn ? "When did it run out?" : "Naubos na?"}
      subtitle="The one thing nobody can measure any other way — and the reason the shop can be told when to buy the next one."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
          <strong className="text-ink-950">{row.label}</strong>
          {row.sizeLabel && <> ({row.sizeLabel})</>}
          <span className="mt-1 block text-xs">
            Bought {formatDate(row.spentOn)} · {peso(row.amount, 0)}
            {row.qty > 1 && <> · {row.qty} of them</>}
          </span>
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-black uppercase tracking-wide text-ink-800/55">
            The day it was finished
          </span>
          <input
            type="date"
            value={date}
            max={today}
            min={row.spentOn}
            onChange={(e) => setDate(e.target.value)}
            className={boxClass}
          />
        </label>

        {sane ? (
          <p className="rounded-2xl bg-jade-600/10 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-jade-600/25">
            That is{" "}
            <strong className="text-ink-950">
              {days === 0 ? "the same day" : `${days} ${days === 1 ? "day" : "days"}`}
            </strong>
            {row.qty > 1 ? (
              <>
                {" "}
                across {row.qty} of them —{" "}
                <strong className="text-ink-950">
                  about {each} {each === 1 ? "day" : "days"} each
                </strong>
                .
              </>
            ) : (
              <>.</>
            )}{" "}
            From now on the shop can say roughly when the next one is due.
          </p>
        ) : (
          <p className="rounded-2xl bg-brand-600/10 px-4 py-3 text-sm text-ink-800/80 ring-1 ring-brand-600/25">
            That date is before it was bought, or in the future. Check it —
            a wrong date here quietly makes every future estimate wrong too.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {/* Only once there is something to undo. A "still in use" button on
              a row that is already still in use is a control that does
              nothing, and one of those makes every other button look
              unreliable. */}
          {row.ranOutOn && (
            <button
              onClick={() =>
                startBusy(async () => {
                  onProblem(null);
                  const res = await clearRanOut(row.id);
                  if (res.error) onProblem(res.error);
                  else onClose();
                })
              }
              disabled={busy}
              className="mr-auto rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950 disabled:opacity-50"
            >
              Still in use, actually
            </button>
          )}
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
                onProblem(null);
                const res = await markRanOut(row.id, date);
                if (res.error) onProblem(res.error);
                else onClose();
              })
            }
            disabled={busy || !sane}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

/**
 * How long each thing the shop buys actually lasts.
 *
 * Every figure here was earned the slow way — a purchase date, and a date
 * somebody came back and filled in weeks later — which is exactly why it is
 * worth showing prominently. Nothing else in the system can produce it, and
 * an owner who fills in end dates and never sees anything come of it stops
 * filling them in.
 *
 * The item that needs buying first is at the top, because that is the only
 * row on this panel anybody has to act on today.
 */
function HowLongThingsLast({ items }: { items: ItemLife[] }) {
  const [all, setAll] = useState(false);
  const due = items.filter((i) => i.dueNow);
  // Everything, or the ones worth a glance: what is due, and what has an
  // estimate at all. A list of "not enough yet" rows teaches nothing.
  const shown = all ? items : [...due, ...items.filter((i) => !i.dueNow)].slice(0, 5);

  return (
    <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-sm font-black text-ink-950">
          How long things last
        </h4>
        {due.length > 0 && (
          <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-cream-50">
            {due.length} to buy
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-800/55">
        From the dates you fill in when something runs out. Nothing here is
        guessed from how often you buy — that only works for things replaced
        the day they die.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {shown.map((item) => (
          <LifeRow key={item.key} item={item} />
        ))}
      </ul>

      {items.length > shown.length && (
        <button
          onClick={() => setAll(true)}
          className="mt-2 text-sm font-bold text-brand-600 hover:underline"
        >
          See all {items.length} →
        </button>
      )}
    </div>
  );
}

function LifeRow({ item }: { item: ItemLife }) {
  const left = item.days !== null && item.openFor !== null ? item.days - item.openFor : null;
  const soon = left !== null && left > 0 && left <= 3;
  const perDay = costPerDay(item);

  return (
    <li
      className={`rounded-xl px-3 py-2.5 ring-1 ${
        item.dueNow
          ? "bg-brand-600 text-cream-50 ring-brand-700/30"
          : soon
            ? "bg-gold-400 text-ink-950 ring-gold-500/40"
            : "bg-cream-100 text-ink-950 ring-ink-950/8"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-black">{item.name}</span>
        {item.days === null ? (
          <span className="text-xs opacity-60">not measured yet</span>
        ) : (
          <span className="text-xs font-bold tabular-nums opacity-80">
            {item.days} {item.days === 1 ? "day" : "days"} · {humanSpan(item.days)}
          </span>
        )}
      </div>

      <p className="mt-0.5 text-xs leading-relaxed opacity-75">
        {item.days === null ? (
          item.open > 0 ? (
            <>
              Open {item.openFor} {item.openFor === 1 ? "day" : "days"}. Tap
              &ldquo;Naubos na?&rdquo; on it when it finishes and this will
              start telling you when the next one is due.
            </>
          ) : (
            <>Bought once, never marked as finished.</>
          )
        ) : item.open === 0 ? (
          <>
            None open. Last one lasted from {formatDate(item.lastOn)} · from{" "}
            {item.finished} {item.finished === 1 ? "purchase" : "purchases"}.
          </>
        ) : item.dueNow ? (
          <>
            <strong className="font-black">Buy one.</strong> The open one is on
            day {item.openFor} of a usual {item.days}.
          </>
        ) : (
          <>
            On day {item.openFor}. Roughly {left} {left === 1 ? "day" : "days"}{" "}
            to go.
          </>
        )}
      </p>

      <p className="mt-0.5 text-[11px] opacity-55">
        {peso(item.lastUnitCost, 0)} each, last bought {formatDate(item.lastOn)}
        {perDay !== null && <> · {peso(perDay)} a day</>}
        {item.finished > 1 && (
          <>
            {" "}
            · measured over {item.units}{" "}
            {item.units === 1 ? "one" : "of them"}
          </>
        )}
      </p>
    </li>
  );
}
