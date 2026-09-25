"use client";

import { useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { peso } from "@/lib/peso";
import {
  adjustStock,
  deleteIngredient,
  recordRestock,
  saveIngredient,
} from "@/app/admin/inventory/actions";
import { quickAddSupplier } from "@/app/admin/suppliers/actions";
import {
  PAID_FROM,
  PAID_FROM_HINTS,
  PAID_FROM_LABELS,
  type PaidFrom,
} from "@/lib/money-accounts";
import type { Supplier } from "@/lib/suppliers";

import { entryBasis, fromPerUnit } from "@/lib/nutrition";

export type EditableIngredient = {
  id: string;
  name: string;
  unit: string;
  purchasePrice: number;
  purchaseQty: number;
  reorder: number;
  categories: string[];
  stock: number;
  unitCost: number;
  /** Per one unit, as stored. The form shows it per 100 for g and ml. */
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
};

/** Shared submit button, so every form in here ends the same way. */
function Submit({
  busy,
  label,
  tone = "dark",
}: {
  busy: boolean;
  label: string;
  tone?: "dark" | "green" | "red";
}) {
  const skin = {
    dark: "bg-ink-950 text-cream-50 hover:bg-ink-800",
    green: "bg-jade-600 text-cream-50 hover:bg-jade-700",
    red: "bg-brand-600 text-cream-50 hover:bg-brand-700",
  }[tone];
  return (
    <button
      type="submit"
      disabled={busy}
      className={`w-full rounded-2xl py-3.5 font-display text-lg font-black transition-colors disabled:cursor-not-allowed disabled:bg-ink-950/15 disabled:text-ink-800/40 ${skin}`}
    >
      {busy ? "Saving…" : label}
    </button>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Add / edit                                                          */
/* ------------------------------------------------------------------ */

export function IngredientForm({
  ingredient,
  units,
  categories,
  onClose,
}: {
  /** Omitted when adding. */
  ingredient?: EditableIngredient;
  units: string[];
  categories: string[];
  onClose: () => void;
}) {
  const editing = Boolean(ingredient);
  const [name, setName] = useState(ingredient?.name ?? "");
  const [unit, setUnit] = useState(ingredient?.unit ?? "g");
  const [price, setPrice] = useState(String(ingredient?.purchasePrice ?? ""));
  const [qty, setQty] = useState(String(ingredient?.purchaseQty ?? ""));
  const [reorder, setReorder] = useState(String(ingredient?.reorder ?? ""));

  /**
   * Nutrition, shown the way the packet prints it.
   *
   * The column holds per ONE unit, because that is what a recipe quantity
   * multiplies. Nobody types that: a bag of breading says "368 kcal per
   * 100 g", and asking for 3.68 invites a misplaced decimal that multiplies
   * every dish using it by ten and still looks plausible. `fromPerUnit`
   * brings it back out in the basis it was typed in.
   */
  const asTyped = (v: number | null | undefined) => {
    const out = fromPerUnit(v ?? null, ingredient?.unit ?? "");
    return out === null ? "" : String(Number(out.toFixed(3)));
  };
  const [kcal, setKcal] = useState(asTyped(ingredient?.kcal));
  const [protein, setProtein] = useState(asTyped(ingredient?.protein));
  const [carbs, setCarbs] = useState(asTyped(ingredient?.carbs));
  const [fat, setFat] = useState(asTyped(ingredient?.fat));
  const [opening, setOpening] = useState("");
  const [picked, setPicked] = useState<string[]>(ingredient?.categories ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const p = Number(price) || 0;
  const q = Number(qty) || 0;
  // Shown live, because this is the number every dish cost is built on and a
  // slipped decimal here is invisible everywhere else until the margins look
  // impossible.
  const derived = q > 0 ? p / q : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveIngredient({
        id: ingredient?.id,
        name,
        unit,
        purchasePrice: p,
        purchaseQty: q,
        reorder: Number(reorder) || 0,
        nutrition: {
          // Blank stays blank. `Number("")` is 0, and a zero here would be
          // the form claiming the ingredient has no calories.
          kcal: kcal.trim() === "" ? null : Number(kcal),
          protein: protein.trim() === "" ? null : Number(protein),
          carbs: carbs.trim() === "" ? null : Number(carbs),
          fat: fat.trim() === "" ? null : Number(fat),
        },
        categories: picked,
        openingStock: editing ? undefined : Number(opening) || 0,
      });
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title={editing ? "Edit ingredient" : "Add an ingredient"}
      subtitle={
        editing
          ? "Changing the price reprices every dish that uses it."
          : "What you buy, and what you pay for it."
      }
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. PORK BELLY"
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field label="Measured in" hint="The unit your recipes use — g, ml, pc.">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            list="unit-options"
            placeholder="g"
            className={inputClass}
          />
          <datalist id="unit-options">
            {units.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="You pay (₱)">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="230"
              className={inputClass}
            />
          </Field>
          <Field label={`For how many ${unit || "units"}`}>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="1000"
              className={inputClass}
            />
          </Field>
        </div>

        <p className="rounded-xl bg-gold-400/25 px-4 py-3 text-sm text-ink-950">
          Works out at{" "}
          <strong className="font-display tabular-nums">
            {derived > 0 ? peso(derived, 4) : "—"}
          </strong>{" "}
          per {unit || "unit"}.
          <span className="mt-1 block text-xs text-ink-800/60">
            You never type this — it&apos;s worked out from what you paid, so a
            slipped decimal can&apos;t hide in it.
          </span>
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tell me when it drops to" hint="Leave 0 for no alert.">
            <input
              value={reorder}
              onChange={(e) => setReorder(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="100"
              className={inputClass}
            />
          </Field>
          {!editing && (
            <Field label="How much on hand now" hint="Your opening count.">
              <input
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0"
                className={inputClass}
              />
            </Field>
          )}
        </div>

        {/* ------------------------------------------------------------
            What is in it

            Off the packet, in the packet's own units. Every one of these is
            optional and all four start blank — the dish only shows a figure
            once EVERY ingredient in its recipe has one, so a half-filled
            store room shows nothing rather than a total that is quietly too
            low. Filling in the ten ingredients that actually carry the
            calories gets most of the menu there.
            ------------------------------------------------------------ */}
        <details className="rounded-2xl bg-cream-100 p-3 ring-1 ring-ink-950/10">
          <summary className="cursor-pointer text-sm font-bold text-ink-950">
            What&apos;s in it{" "}
            <span className="font-semibold text-ink-800/45">
              — calories and macros, optional
            </span>
          </summary>
          <p className="mt-2 text-xs text-ink-800/55">
            Straight off the packet, per{" "}
            <strong className="font-bold text-ink-900">
              {entryBasis(unit) === 100 ? `100 ${unit || "g"}` : `1 ${unit || "unit"}`}
            </strong>
            . Leave blank if you don&apos;t know it — a dish stays blank until
            everything in its recipe is filled in, so a guess here is worse
            than a gap.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Calories", kcal, setKcal, "kcal", "368"],
                ["Protein", protein, setProtein, "g", "9"],
                ["Carbs", carbs, setCarbs, "g", "76"],
                ["Fat", fat, setFat, "g", "1.2"],
              ] as const
            ).map(([label, value, set, suffix, example]) => (
              <Field key={label} label={`${label} (${suffix})`}>
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder={example}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-800/45">
            Energy is worked out from the three macros if you leave Calories
            empty — 4 per gram of protein and carbs, 9 for fat, the same sum
            the packet used.
          </p>
        </details>

        {categories.length > 0 && (
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setPicked((cur) =>
                        on ? cur.filter((x) => x !== c) : [...cur, c]
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      on
                        ? "bg-ink-950 text-cream-50"
                        : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <ErrorNote message={error} />
        <Submit busy={busy} label={editing ? "Save changes" : "Add it"} />

        {editing && (
          <DeleteIngredient id={ingredient!.id} name={ingredient!.name} onDone={onClose} />
        )}
      </form>
    </AdminDialog>
  );
}

function DeleteIngredient({
  id,
  name,
  onDone,
}: {
  id: string;
  name: string;
  onDone: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-sm font-bold text-brand-600 hover:underline"
      >
        Delete this ingredient
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-brand-600/10 p-4">
      <p className="text-sm text-ink-800/80">
        Delete <strong className="text-ink-950">{name}</strong>? Its purchase
        history stays, but it disappears from the store room.
      </p>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="flex-1 rounded-xl bg-ink-950/5 py-2.5 text-sm font-bold text-ink-800"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const r = await deleteIngredient(id);
              if (r.error !== null) setError(r.error);
              else onDone();
            })
          }
          className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Restock                                                             */
/* ------------------------------------------------------------------ */

export function RestockForm({
  ingredient,
  suppliers = [],
  onClose,
}: {
  ingredient: EditableIngredient;
  /** The saved list, so a name is tapped rather than typed again. */
  suppliers?: Supplier[];
  onClose: () => void;
}) {
  const [qty, setQty] = useState("");
  const [paid, setPaid] = useState("");
  const [supplier, setSupplier] = useState("");
  /**
   * Which saved supplier this delivery came from, when it came from one.
   *
   * Both this and the free text go to the server. The text is what gets
   * written into `purchase_log.supplier` and stays readable whatever later
   * happens to the list; the id is what lets anything group by supplier at
   * all — which was impossible while "Aling Nena", "aling nena" and "Nena"
   * were three different suppliers.
   */
  const [supplierId, setSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  // Cash by default because that is how a market run is actually paid for,
  // and because a default of "not yet paid" would quietly reinstate the bug
  // this form exists to close.
  const [paidFrom, setPaidFrom] = useState<PaidFrom>("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // A name typed that matches nobody on the list. Case-insensitive, because
  // "aling nena" and "Aling Nena" are the same person and offering to save
  // the second one is how a list gets two of her.
  const unsaved =
    supplier.trim().length > 0 &&
    !supplierId &&
    !suppliers.some((sup) => sup.name.toLowerCase() === supplier.trim().toLowerCase());

  const q = Number(qty) || 0;
  const amount = Number(paid) || 0;
  const newUnitCost = q > 0 ? amount / q : 0;
  const moved = q > 0 && Math.abs(newUnitCost - ingredient.unitCost) > 0.0001;
  const dearer = newUnitCost > ingredient.unitCost;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await recordRestock({
        ingredientId: ingredient.id,
        qty: q,
        amountPaid: amount,
        supplier,
        supplierId: supplierId || null,
        expiryDate: expiry || null,
        updateStandardCost: updateCost,
        paidFrom,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title={`Restock ${ingredient.name}`}
      subtitle={`${ingredient.stock.toLocaleString("en-PH")} ${ingredient.unit} on hand right now.`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`How much arrived (${ingredient.unit})`}>
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              autoFocus
              className={inputClass}
            />
          </Field>
          <Field label="Total paid (₱)">
            <input
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        </div>

        {q > 0 && amount > 0 && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              moved
                ? dearer
                  ? "bg-chili-500/15 text-ink-950"
                  : "bg-jade-500/15 text-ink-950"
                : "bg-ink-950/5 text-ink-800/70"
            }`}
          >
            <strong className="font-display tabular-nums">
              {peso(newUnitCost, 4)}
            </strong>{" "}
            per {ingredient.unit}
            {moved && (
              <>
                {" — "}
                {dearer ? "dearer" : "cheaper"} than the {peso(ingredient.unitCost, 4)}{" "}
                you&apos;ve been costing with.
              </>
            )}
          </div>
        )}

        {/* Where the money came from, asked here because this is the only
            moment the amount is known. The delivery used to move stock and no
            pesos at all, so the drawer counted every sale in and no
            ingredient out. */}
        <Field
          label="Paid with"
          hint={amount > 0 ? PAID_FROM_HINTS[paidFrom] : "It comes out of this pot."}
        >
          <div className="grid grid-cols-3 gap-2">
            {PAID_FROM.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPaidFrom(option)}
                aria-pressed={paidFrom === option}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                  paidFrom === option
                    ? "bg-ink-950 text-cream-50"
                    : "bg-ink-950/[0.05] text-ink-950 hover:bg-ink-950/10"
                }`}
              >
                {PAID_FROM_LABELS[option]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Not inside a `Field`: that renders a <label>, and a <button>
              inside a <label> is invalid nesting — the label takes over the
              buttons' accessible name, and tapping a chip also focuses the
              text box underneath it. Found by a test that could not locate
              the chips by name at all. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/60">
              Supplier
            </span>
            {suppliers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suppliers
                  .filter((sup) => sup.active)
                  .slice(0, 8)
                  .map((sup) => {
                    const on = supplierId === sup.id;
                    return (
                      <button
                        key={sup.id}
                        type="button"
                        onClick={() => {
                          // Tapping fills the text too, so the row written to
                          // `purchase_log` reads the same whether the name was
                          // tapped or typed.
                          setSupplierId(on ? "" : sup.id);
                          setSupplier(on ? "" : sup.name);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                          on
                            ? "bg-ink-950 text-gold-400"
                            : "bg-ink-950/5 text-ink-800/65 hover:bg-ink-950/10"
                        }`}
                      >
                        {sup.name}
                      </button>
                    );
                  })}
              </div>
            )}
            <input
              value={supplier}
              onChange={(e) => {
                setSupplier(e.target.value);
                // Typed over a tapped chip: the id no longer describes what
                // the box says, so it goes rather than mislabelling the row.
                setSupplierId("");
              }}
              placeholder="e.g. Apalit market"
              className={inputClass}
            />
            {/* Typed a name nobody has saved? Offer to save it from here.
                Sending somebody to another tab while they are holding a sack
                of chicken is exactly how the free-text habit survives — which
                is the habit the chips exist to replace. */}
            {unsaved ? (
              <button
                type="button"
                disabled={addingSupplier}
                onClick={() =>
                  startTransition(async () => {
                    setAddingSupplier(true);
                    const r = await quickAddSupplier(supplier.trim());
                    setAddingSupplier(false);
                    if (r.error) setError(r.error);
                    else if (r.id) setSupplierId(r.id);
                  })
                }
                className="self-start rounded-full bg-gold-400 px-3 py-1.5 text-xs font-bold text-ink-950 transition-colors hover:bg-gold-500 disabled:opacity-60"
              >
                {addingSupplier
                  ? "Saving…"
                  : `+ Save \u201C${supplier.trim()}\u201D to your suppliers`}
              </button>
            ) : (
              <span className="text-xs text-ink-800/50">
                {suppliers.length > 0
                  ? "Tap one, or type a name that isn't on the list yet."
                  : "Optional. Add them on the Suppliers tab and they'll be a tap next time."}
              </span>
            )}
          </div>

          <Field label="Best before" hint="Optional. Used up first if set.">
            <input
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              type="date"
              className={inputClass}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-ink-950/[0.03] px-4 py-3">
          <input
            type="checkbox"
            checked={updateCost}
            onChange={(e) => setUpdateCost(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
          />
          <span className="text-xs text-ink-800/70">
            <strong className="text-ink-950">Use this as the new price</strong>
            <span className="block">
              Reprices every dish that uses it. Untick for a one-off buy at a
              price you don&apos;t expect to pay again.
            </span>
          </span>
        </label>

        <ErrorNote message={error} />
        <Submit busy={busy} label="Record the delivery" tone="green" />
      </form>
    </AdminDialog>
  );
}

/* ------------------------------------------------------------------ */
/* Count                                                               */
/* ------------------------------------------------------------------ */

export function CountForm({
  ingredient,
  onWaste,
  onClose,
}: {
  ingredient: EditableIngredient;
  /**
   * Switch to writing it off instead.
   *
   * Counting and writing off produce the same number on the shelf and mean
   * completely different things to the books: a correction says the count was
   * wrong, a write-off says the food was real and is gone. Only the second
   * reaches spoilage, and spoilage is in the break-even sum. Somebody who
   * counts a short shelf because that is the button in front of them has just
   * made the shop's costs look better than they are.
   */
  onWaste?: () => void;
  onClose: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const c = counted === "" ? null : Number(counted);
  const variance = c === null ? 0 : c - ingredient.stock;
  const impact = variance * ingredient.unitCost;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await adjustStock({
        ingredientId: ingredient.id,
        countedQty: c ?? 0,
        note,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title={`Count ${ingredient.name}`}
      subtitle="What's actually on the shelf, not what the system thinks."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-xl bg-ink-950/5 px-4 py-3 text-sm text-ink-800/70">
          The system says{" "}
          <strong className="font-display tabular-nums text-ink-950">
            {ingredient.stock.toLocaleString("en-PH")} {ingredient.unit}
          </strong>
          .
        </div>

        <Field label={`Counted (${ingredient.unit})`}>
          <input
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            autoFocus
            className={inputClass}
          />
        </Field>

        {c !== null && Math.abs(variance) > 0.0001 && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              variance < 0 ? "bg-brand-600/10" : "bg-jade-500/15"
            }`}
          >
            <strong className="font-display tabular-nums text-ink-950">
              {variance > 0 ? "+" : ""}
              {variance.toFixed(2)} {ingredient.unit}
            </strong>{" "}
            <span className="text-ink-800/70">
              — {variance < 0 ? "less" : "more"} than expected, worth{" "}
              {peso(Math.abs(impact))}.
            </span>

            {/* The fork in the road, offered at the exact moment it matters:
                the shelf is short and the person knows why. "It went off" and
                "we miscounted" land in different places, and only the first
                one reaches spoilage — which is in break-even. */}
            {variance < 0 && onWaste && (
              <div className="mt-3 border-t border-ink-950/10 pt-3">
                <p className="text-xs leading-relaxed text-ink-800/70">
                  Do you know where it went? If it spoiled, was thrown away or
                  the shop ate it, write it off instead — a correction says the
                  count was wrong, and only a write-off reaches your spoilage
                  figure.
                </p>
                <button
                  type="button"
                  onClick={onWaste}
                  className="mt-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-black uppercase tracking-wide text-cream-50 transition-colors hover:bg-brand-700"
                >
                  Write it off instead →
                </button>
              </div>
            )}
          </div>
        )}

        <Field label="Why" hint="Optional, but it's what makes the log useful.">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. spillage, miscounted last week"
            className={inputClass}
          />
        </Field>

        <ErrorNote message={error} />
        <Submit busy={busy} label="Correct the count" />
      </form>
    </AdminDialog>
  );
}
