"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/combobox";
import { CATEGORY_TONES, colourOf, type MenuCategory } from "@/lib/categories";

/**
 * Pick the category, don't retype it.
 *
 * This was a plain text box on every dish form, which is how a menu ends up
 * with "Chicken", "chicken" and "Chicken " as three separate filter pills on
 * the customer's screen. Nobody decided that; the box just didn't remember.
 *
 * So: the categories that already exist, searchable, with their colours shown
 * — the colour is what makes the right one findable at a glance. Typing a
 * name that doesn't exist yet is still allowed, because refusing it would
 * mean going somewhere else to create a category before you can finish adding
 * a dish. It's just no longer the default path.
 */
export function CategoryPicker({
  value,
  onChange,
  categories,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: MenuCategory[];
  className?: string;
}) {
  const [showNew, setShowNew] = useState(false);

  const known = useMemo(
    () => new Map(categories.map((c) => [c.name, c.colour])),
    [categories]
  );
  const options = useMemo(
    () =>
      categories.map((c) => ({
        value: c.name,
        label: c.name,
        hint: CATEGORY_TONES[c.colour]?.label,
      })),
    [categories]
  );

  // A name that isn't on the list yet. Worth saying out loud — a typo and a
  // deliberate new category look identical at the moment of typing, and only
  // one of them should be a surprise later.
  const isNew = value.trim().length > 0 && !known.has(value.trim());

  if (showNew || categories.length === 0) {
    return (
      <div className={className}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New category"
          autoFocus={showNew}
          className="w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors focus:border-gold-400"
        />
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNew(false)}
            className="mt-1 text-xs font-bold text-brand-600 hover:underline"
          >
            ← Pick an existing one
          </button>
        )}
      </div>
    );
  }

  const tone = colourOf(value.trim(), known);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {value.trim() && (
          <span
            aria-hidden
            className={`h-4 w-4 shrink-0 rounded-full ring-1 ring-ink-950/15 ${tone.dot}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <Combobox
            value={value}
            onChange={onChange}
            options={options}
            ariaLabel="Category"
            placeholder="Pick a category…"
          />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          onClick={() => {
            onChange("");
            setShowNew(true);
          }}
          className="text-xs font-bold text-brand-600 hover:underline"
        >
          + New category
        </button>
        {isNew && (
          <span className="text-xs text-ink-800/50">
            &ldquo;{value.trim()}&rdquo; is new — it&apos;ll be created when
            you save.
          </span>
        )}
      </div>
    </div>
  );
}
