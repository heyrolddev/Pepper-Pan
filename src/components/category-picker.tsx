"use client";

import { useMemo, useState } from "react";
import { Combobox } from "@/components/combobox";
import { CATEGORY_TONES, colourOf, type MenuCategory } from "@/lib/categories";

/**
 * Pick the categories, don't retype them.
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
 *
 * More than one, because a dish is genuinely more than one thing. Chicken
 * Chop is chicken AND it is rice meals AND it is what the shop is known for;
 * forcing a choice between those meant the dish only appeared under whichever
 * one somebody picked first, and the customer filtering by the other never
 * saw it. The column has been `text[]` since the first migration — the limit
 * was one line of code wrapping a single string in an array, not the data.
 *
 * Chosen ones are chips with a way off them; the box below adds another and
 * hides what is already picked, because offering a choice that does nothing
 * is how a control teaches people to distrust it.
 */
export function CategoryPicker({
  value,
  onChange,
  categories,
  className,
}: {
  /** Every category on this dish. Order is kept — the first one leads. */
  value: string[];
  onChange: (v: string[]) => void;
  categories: MenuCategory[];
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (name: string) => {
    const n = name.trim();
    // Case-insensitively, because "Chicken" and "chicken" being two chips on
    // one dish is exactly the mess this picker exists to prevent.
    if (!n || value.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onChange([...value, n]);
    setDraft("");
    setShowNew(false);
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));
  const [showNew, setShowNew] = useState(false);

  const known = useMemo(
    () => new Map(categories.map((c) => [c.name, c.colour])),
    [categories]
  );

  // Already-chosen ones are left out: a menu of options that do nothing is
  // how a control teaches people to distrust it.
  const options = useMemo(
    () =>
      categories
        .filter((c) => !value.some((v) => v.toLowerCase() === c.name.toLowerCase()))
        .map((c) => ({
          value: c.name,
          label: c.name,
          hint: CATEGORY_TONES[c.colour]?.label,
        })),
    [categories, value]
  );

  const isNew = draft.trim().length > 0 && !known.has(draft.trim());

  return (
    <div className={className}>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((name, i) => {
            const tone = colourOf(name, known);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 py-1 pl-2 pr-1 text-xs font-bold text-ink-950 ring-1 ring-ink-950/10"
              >
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
                {name}
                {/* The first one leads — it is what the dish reads as on a
                    list with no room for three chips. Worth saying, since
                    the order is not otherwise visible. */}
                {i === 0 && value.length > 1 && (
                  <span className="text-[10px] font-semibold text-ink-800/40">
                    main
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(name)}
                  aria-label={`Remove ${name}`}
                  className="grid h-5 w-5 place-items-center rounded-full text-ink-800/40 transition-colors hover:bg-brand-600 hover:text-cream-50"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {showNew || categories.length === 0 ? (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // The form would otherwise submit on Enter, saving the dish
                // without the category the person was half-way through
                // typing.
                e.preventDefault();
                add(draft);
              }
            }}
            placeholder="New category"
            autoFocus={showNew}
            className="min-w-0 flex-1 rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors focus:border-gold-400"
          />
          <button
            type="button"
            onClick={() => add(draft)}
            disabled={!draft.trim()}
            className="shrink-0 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : (
        <Combobox
          value=""
          onChange={add}
          options={options}
          ariaLabel="Add a category"
          placeholder={value.length ? "Add another…" : "Pick a category…"}
        />
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3">
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setShowNew((v) => !v);
          }}
          className="text-xs font-bold text-brand-600 hover:underline"
        >
          {showNew && categories.length > 0 ? "← Pick an existing one" : "+ New category"}
        </button>
        {isNew && (
          <span className="text-xs text-ink-800/50">
            &ldquo;{draft.trim()}&rdquo; is new — it&apos;ll be created when you save.
          </span>
        )}
      </div>
    </div>
  );
}
