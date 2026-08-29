"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveMeal, uploadMealImage } from "@/app/admin/menu/actions";

export type AdminMeal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
  image_url: string | null;
  is_public: boolean;
  is_available: boolean;
};

const fieldClass =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        checked ? "bg-jade-600 text-cream-50" : "bg-ink-950/10 text-ink-800"
      }`}
    >
      {checked ? "✓ " : ""}
      {label}
    </button>
  );
}

export function MealEditor({ meal }: { meal: AdminMeal }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(meal.name);
  const [price, setPrice] = useState(String(meal.price));
  const [description, setDescription] = useState(meal.description ?? "");
  const [category, setCategory] = useState(meal.categories?.[0] ?? "");
  const [isPublic, setIsPublic] = useState(meal.is_public);
  const [isAvailable, setIsAvailable] = useState(meal.is_available);
  const [imageUrl, setImageUrl] = useState(meal.image_url);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const res = await saveMeal({
      id: meal.id,
      name,
      price: Number(price),
      description,
      category,
      isPublic,
      isAvailable,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("mealId", meal.id);
    fd.set("file", file);
    const res = await uploadMealImage(fd);
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.url) setImageUrl(res.url);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:flex-row"
    >
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="relative h-28 w-28 overflow-hidden rounded-xl bg-gradient-to-br from-chili-400 to-brand-600">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={meal.name}
              fill
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-3xl font-black text-cream-50/80">
              {(meal.name.match(/[a-zA-Z0-9]/)?.[0] ?? "?").toUpperCase()}
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-full bg-ink-950 px-3 py-1.5 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {imageUrl ? "Replace photo" : "Add photo"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Item name"
            className={fieldClass}
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Price"
            className={fieldClass}
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category"
            className={fieldClass}
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Short description shown on the menu (optional)"
          className={fieldClass}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Toggle checked={isPublic} onChange={setIsPublic} label="Shown on menu" />
          <Toggle checked={isAvailable} onChange={setIsAvailable} label="Available" />

          <button
            type="submit"
            disabled={busy}
            className={`ml-auto rounded-full px-5 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
              saved ? "bg-jade-600 text-cream-50" : "bg-brand-600 text-cream-50 hover:bg-brand-700"
            }`}
          >
            {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>

        {error && (
          <p className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
