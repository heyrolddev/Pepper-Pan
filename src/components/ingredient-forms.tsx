"use client";

import { useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { peso } from "@/lib/costing";
import {
  adjustStock,
  deleteIngredient,
  recordRestock,
  saveIngredient,
} from "@/app/admin/inventory/actions";

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
  onClose,
}: {
  ingredient: EditableIngredient;
  onClose: () => void;
}) {
  const [qty, setQty] = useState("");
  const [paid, setPaid] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expiry, setExpiry] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

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
        expiryDate: expiry || null,
        updateStandardCost: updateCost,
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" hint="Optional.">
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Apalit market"
              className={inputClass}
            />
          </Field>
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
  onClose,
}: {
  ingredient: EditableIngredient;
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
