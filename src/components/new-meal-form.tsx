"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createMeal } from "@/app/admin/menu/actions";
import { CategoryPicker } from "@/components/category-picker";
import type { MenuCategory } from "@/lib/categories";

const fieldClass =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

export function NewMealForm({ categories }: { categories: MenuCategory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await createMeal({
        name,
        price: Number(price),
        category,
        description,
      });
      if (res.error) return setError(res.error);
      setName("");
      setPrice("");
      setCategory("");
      setDescription("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-ink-950 px-6 py-3 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600"
      >
        + Add menu item
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl bg-cream-100 p-5 ring-2 ring-brand-600"
    >
      <p className="font-display text-lg font-bold text-ink-950">New menu item</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className={fieldClass}
        />
        <input
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="Price"
          className={fieldClass}
        />
        <CategoryPicker
          value={category}
          onChange={setCategory}
          categories={categories}
        />
      </div>
      {/* Asked for at the point the dish is created, not left until later.
          "You can add a description after creating it" is how seventy-three
          dishes end up on a menu with nothing but a name — and a name alone
          tells a first-time customer nothing about what Ji Pai or XLB is. */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={160}
        placeholder="What is it? e.g. Crispy fried chicken cutlet, Taiwanese street-style"
        className={fieldClass}
      />
      <p className="-mt-1 text-xs text-ink-800/45">
        Shown under the name on the menu. {160 - description.length} characters
        left.
      </p>
      {error && (
        <p className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add item"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-ink-800/55">
        You can add a photo after creating it.
      </p>
    </form>
  );
}
