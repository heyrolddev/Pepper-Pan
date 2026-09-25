"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { CODE_MAX, cleanCode, codeProblem } from "@/lib/dish-code";
import { useRouter } from "next/navigation";
import { deleteMeal, saveMeal, uploadMealImage } from "@/app/admin/menu/actions";
import { TrashIcon } from "@/components/icons";
import { CategoryPicker } from "@/components/category-picker";
import type { MenuCategory } from "@/lib/categories";

export type AdminMeal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
  image_url: string | null;
  is_public: boolean;
  is_available: boolean;
  /** The short name the counter says — "C1". */
  code: string | null;
  /** The owner's override. All null means "work it out from the recipe". */
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /**
   * What the recipe works out to, and what is stopping it. Read-only — the
   * editor shows it so the owner can see whether an override is even needed.
   */
  worked?: { kcal: number; protein: number; carbs: number; fat: number } | null;
  missing?: string[];
  /** Every other dish's code, so a duplicate is caught before the save. */
  codesInUse?: string[];
  /** The next free code for this dish's category. */
  suggestion?: string | null;
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

export function MealEditor({
  meal,
  categories,
}: {
  meal: AdminMeal;
  categories: MenuCategory[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(meal.name);
  const [price, setPrice] = useState(String(meal.price));
  const [description, setDescription] = useState(meal.description ?? "");
  const [chosen, setChosen] = useState<string[]>(meal.categories ?? []);
  const [isPublic, setIsPublic] = useState(meal.is_public);
  const [isAvailable, setIsAvailable] = useState(meal.is_available);
  const [imageUrl, setImageUrl] = useState(meal.image_url);
  const [code, setCode] = useState(meal.code ?? "");
  const num = (v: number | null) => (v === null ? "" : String(v));
  const [kcal, setKcal] = useState(num(meal.kcal));
  const [protein, setProtein] = useState(num(meal.protein_g));
  const [carbs, setCarbs] = useState(num(meal.carbs_g));
  const [fat, setFat] = useState(num(meal.fat_g));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Caught here as well as in the action. The database has a
  // case-insensitive unique index, so a clash saved anyway comes back as a
  // constraint error naming an index — which tells the owner nothing.
  const codeNote = codeProblem(code, meal.codesInUse ?? []);

  /**
   * What the database holds, as far as this form knows.
   *
   * The button used to say "Save", then "Saved ✓" for two seconds, then
   * "Save" again — which reads as *you still have work to do* on a form
   * that is already identical to what is stored. Pressing it again writes
   * the same row a second time, and every so often someone sits there
   * pressing it because the label keeps asking them to.
   *
   * So the button reports the form's state rather than the last thing that
   * happened to it. Nothing to save and it says so, greyed out; change one
   * character and it turns back into a live Save. The photo is not in here:
   * it uploads and saves on its own the moment it is chosen, so counting it
   * would leave the button asking to save something already saved.
   */
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      name: meal.name,
      price: String(meal.price),
      description: meal.description ?? "",
      chosen: meal.categories ?? [],
      isPublic: meal.is_public,
      isAvailable: meal.is_available,
      code: meal.code ?? "",
      kcal: num(meal.kcal),
      protein: num(meal.protein_g),
      carbs: num(meal.carbs_g),
      fat: num(meal.fat_g),
    })
  );

  const snapshot = JSON.stringify({
    name,
    price,
    description,
    chosen,
    isPublic,
    isAvailable,
    code,
    kcal,
    protein,
    carbs,
    fat,
  });
  // Compared as JSON rather than field by field so that adding a field to the
  // form cannot quietly leave it out of the comparison. Category order is
  // part of the value on purpose — the first one is the dish's main category
  // and decides its colour, so reordering is a real change.
  const dirty = snapshot !== savedSnapshot;
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await deleteMeal(meal.id);
      if (res.error) {
        setConfirmDelete(false);
        return setError(res.error);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that item.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await saveMeal({
        id: meal.id,
        name,
        price: Number(price),
        description,
        categories: chosen,
        isPublic,
        isAvailable,
        code,
        nutrition: {
          // Blank stays blank — `Number("")` is 0, and a zero here would be
          // the form claiming the dish has no calories rather than deferring
          // to the recipe.
          kcal: kcal.trim() === "" ? null : Number(kcal),
          protein: protein.trim() === "" ? null : Number(protein),
          carbs: carbs.trim() === "" ? null : Number(carbs),
          fat: fat.trim() === "" ? null : Number(fat),
        },
      });
      if (res.error) return setError(res.error);
      // The form is now what the database holds, so the button goes quiet
      // until something actually changes again.
      setSavedSnapshot(snapshot);
      router.refresh();
    } catch (e) {
      // Without this a thrown Server Action would leave the button stuck.
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("mealId", meal.id);
    fd.set("file", file);
    try {
      const res = await uploadMealImage(fd);
      if (res.error) return setError(res.error);
      if (res.url) setImageUrl(res.url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:flex-row"
    >
      {/* Whatever shape the customer's menu card is, this matches it. When the
          two disagree the owner approves a crop nobody else ever sees, and the
          live menu quietly loses the edges of every photo. */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="relative aspect-square w-32 overflow-hidden rounded-xl bg-gradient-to-br from-chili-400 to-brand-600">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={meal.name}
              fill
              sizes="128px"
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
        {/* The one number that stops photos being trimmed. Said here, where
            the photo is chosen, rather than in a document nobody opens. */}
        <p className="text-center text-[11px] leading-tight text-ink-800/45">
          Best at <strong className="font-semibold">1200 × 1200</strong>
          <br />
          (square)
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[auto_2fr_1fr_1fr]">
          {/* The code first, because that is the order it is said in. Narrow
              on purpose: it is four characters, and a full-width box invites
              somebody to type the dish name into it. */}
          <input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            placeholder="C1"
            aria-label="Dish code"
            maxLength={CODE_MAX}
            className={`${fieldClass} w-full text-center font-black tabular-nums tracking-wide sm:w-24`}
          />
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
          <CategoryPicker
            value={chosen}
            onChange={setChosen}
            categories={categories}
          />
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Short description shown on the menu (optional)"
          className={fieldClass}
        />

        {codeNote && (
          <p className="-mt-1 text-xs font-semibold text-brand-700">{codeNote}</p>
        )}
        {!code && meal.suggestion && (
          <button
            type="button"
            onClick={() => setCode(meal.suggestion!)}
            className="-mt-1 self-start text-xs font-bold text-ink-800/60 underline decoration-dotted underline-offset-2 hover:text-ink-950"
          >
            Use {meal.suggestion}
          </button>
        )}

        {/* ------------------------------------------------------------
            What is in it

            Read-only until the owner wants to overrule it. The figure above
            the boxes is what the recipe works out to, and what is stopping
            it — which is nearly always the answer to "why is there no
            calorie count on this dish": one ingredient nobody has filled in.
            Typing here is for the dishes the recipe cannot answer for, like
            a bought-in bottled drink with the numbers on the label.
            ------------------------------------------------------------ */}
        <details className="rounded-2xl bg-cream-100 p-3 ring-1 ring-ink-950/10">
          <summary className="cursor-pointer text-sm font-bold text-ink-950">
            What&apos;s in it{" "}
            <span className="font-semibold text-ink-800/45">
              {meal.worked
                ? `— ${Math.round(meal.worked.kcal).toLocaleString("en-PH")} kcal from the recipe`
                : meal.missing?.length
                  ? `— nothing yet, ${meal.missing.length} to fill in`
                  : "— calories and macros"}
            </span>
          </summary>

          {meal.missing && meal.missing.length > 0 && (
            <p className="mt-2 text-xs text-ink-800/55">
              No figure yet because{" "}
              <strong className="font-bold text-ink-900">
                {meal.missing.slice(0, 4).join(", ")}
                {meal.missing.length > 4 ? ` and ${meal.missing.length - 4} more` : ""}
              </strong>{" "}
              {meal.missing.length === 1 ? "has" : "have"} no nutrition filled
              in. Fill {meal.missing.length === 1 ? "it" : "them"} in under
              Inventory and this works itself out — and stays right when the
              recipe changes.
            </p>
          )}

          <p className="mt-2 text-xs text-ink-800/55">
            Leave these blank unless the recipe can&apos;t answer for this
            dish — a bought-in drink with the numbers printed on it. Anything
            typed here overrules the recipe for good.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Calories", kcal, setKcal, "kcal", meal.worked?.kcal],
                ["Protein", protein, setProtein, "g", meal.worked?.protein],
                ["Carbs", carbs, setCarbs, "g", meal.worked?.carbs],
                ["Fat", fat, setFat, "g", meal.worked?.fat],
              ] as const
            ).map(([label, value, set, suffix, fromRecipe]) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-xs font-bold text-ink-800/70">
                  {label} ({suffix})
                </span>
                <input
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  type="number"
                  step="0.1"
                  min="0"
                  inputMode="decimal"
                  placeholder={
                    fromRecipe === undefined || fromRecipe === null
                      ? "—"
                      : String(Math.round(fromRecipe))
                  }
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <Toggle checked={isPublic} onChange={setIsPublic} label="Shown on menu" />
          <Toggle checked={isAvailable} onChange={setIsAvailable} label="Available" />

          {confirmDelete ? (
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-800">Delete this item?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-cream-50 disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-full px-3 py-2 text-xs font-bold text-ink-800 hover:text-brand-600"
              >
                Keep
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                aria-label={`Delete ${meal.name}`}
                title="Delete this item"
                className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-800/50 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-60"
              >
                <TrashIcon className="h-4 w-4" />
              </button>

              <button
                type="submit"
                disabled={busy || !dirty}
                className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                  dirty
                    ? "bg-brand-600 text-cream-50 hover:bg-brand-700 disabled:opacity-60"
                    : "cursor-default bg-jade-600/15 text-jade-700"
                }`}
              >
                {busy ? "Saving…" : dirty ? "Save changes" : "Saved ✓"}
              </button>
            </>
          )}
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
