"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { createMeal } from "@/app/admin/menu/actions";
import { peso } from "@/lib/costing";

/**
 * A new dish, started on the screen where its cost will be worked out.
 *
 * WHY IT DOES NOT GO ON THE MENU
 *
 * The obvious version of this button creates the dish and puts it straight in
 * front of customers, the way the Menu screen does. On this screen that would
 * be wrong, and quietly so.
 *
 * A dish created here has no recipe yet. With no recipe it costs ₱0, so the
 * margin beside it reads as 100% — the best-performing thing on the menu, and
 * completely false. Live in that state, a customer could order it: the sale
 * would book as pure profit, nothing would come off the stock because there
 * are no ingredients linked to take off, and the day's figures would be wrong
 * in a way nobody would think to check.
 *
 * So it arrives hidden, marked "Not on the menu", and the row carries one
 * button to put it live. The order is the point: add it, cost it, look at
 * what you actually keep, *then* sell it. That is the decision this whole
 * screen exists to support, and this makes it the default path rather than a
 * discipline somebody has to remember.
 */
export function NewDishDialog({
  categories,
  onAdded,
  onClose,
}: {
  /** Names the shop already uses, offered rather than imposed. */
  categories: string[];
  /**
   * Called once the dish exists, so the list can go and show it.
   *
   * Without this the button appears to do nothing: the list is sorted worst
   * food-cost first, and a dish with no recipe has no percentage to sort by,
   * so it lands in the bucket at the very bottom — below every costed dish,
   * off the screen, on a list that may be seventy long.
   */
  onAdded: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, save] = useTransition();

  const priceValue = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(priceValue) && priceValue >= 0;
  const ready = name.trim() !== "" && priceOk;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || saving) return;
    setError(null);

    save(async () => {
      const result = await createMeal({
        name,
        price: priceValue,
        categories: category.trim() ? [category.trim()] : [],
        onMenu: false,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onAdded();
      router.refresh();
      onClose();
    });
  }

  return (
    <AdminDialog
      title="Add a dish"
      subtitle="It starts off the menu so you can cost it first. One tap puts it live once the margin looks right."
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="What it's called">
          <input
            id="new-dish-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Black Pepper Beef"
            autoFocus
            className={inputClass}
          />
        </Field>

        <Field
          label="What it sells for"
          hint={
            priceOk && priceValue > 0
              ? `${peso(priceValue, 0)} — you can change this any time.`
              : "The price on the menu, before any discount."
          }
        >
          <input
            id="new-dish-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className={inputClass}
          />
        </Field>

        <Field
          label="Category"
          hint="Optional — it decides where the dish sits on the menu."
        >
          <input
            id="new-dish-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="new-dish-categories"
            placeholder="Noodles"
            className={inputClass}
          />
          <datalist id="new-dish-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || saving}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add it"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
