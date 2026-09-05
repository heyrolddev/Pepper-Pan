"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCategory, deleteCategory } from "@/app/admin/menu/actions";
import { PencilIcon } from "@/components/icons";
import {
  CATEGORY_COLOURS,
  CATEGORY_TONES,
  toneFor,
  type MenuCategory,
} from "@/lib/categories";

/**
 * The menu's own vocabulary, in one place.
 *
 * Categories were free text on each dish, so the shop accumulated "Chicken",
 * "chicken" and "Chicken " without anyone deciding to — and the customer's
 * filter bar showed all three. Here they are a short list the owner can see
 * whole, rename in one edit, and colour.
 *
 * Deliberately at the top of the menu screen rather than behind a settings
 * page: it is the thing you look at while deciding what to call a new dish,
 * and a vocabulary you have to go and find is a vocabulary that gets
 * re-invented on every dish.
 */
export function CategoryBar({
  categories,
  counts,
  active,
  onFilter,
}: {
  categories: MenuCategory[];
  /** How many dishes are in each, so "delete" can say what's in the way. */
  counts: Record<string, number>;
  /** The category the list below is filtered to, or null for all of them. */
  active?: string | null;
  /** Filter the list to a category. Passing the active one again clears it. */
  onFilter?: (name: string | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="rounded-3xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-ink-950">Categories</p>
          <p className="mt-0.5 text-sm text-ink-800/55">
            Tap one to see only those dishes. The pencil renames it or changes
            its colour, which shows on the customer&apos;s menu, the till and
            the costing screen.
          </p>
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditing(null);
          }}
          className="shrink-0 rounded-xl bg-ink-950 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
        >
          + New category
        </button>
      </div>

      {/* One chip, two jobs — so they get separate controls rather than
          sharing a tap.
          
          Filtering is what happens many times in a session; renaming happens
          a handful of times ever. The frequent action gets the whole width of
          the chip, and the rare one gets a small deliberate target beside it.
          The other way round — which is how this started — meant every attempt
          to look at the Drinks dishes opened a colour picker instead.
          
          Two sibling buttons inside a styled span, never a button inside a
          button: nested buttons are invalid and browsers resolve them by
          dropping one, usually the one you wanted. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const tone = toneFor(c.colour);
          const on = active === c.name;
          return (
            <li key={c.name}>
              <span
                className={`inline-flex items-stretch overflow-hidden rounded-full transition-transform hover:scale-105 ${tone.chip} ${
                  on ? "ring-2 ring-ink-950 ring-offset-2 ring-offset-cream-100" : ""
                }`}
              >
                <button
                  onClick={() => onFilter?.(on ? null : c.name)}
                  aria-pressed={on}
                  title={on ? `Show every dish again` : `Show only ${c.name}`}
                  className="py-1.5 pl-3.5 pr-2 text-sm font-bold"
                >
                  {c.name}
                  <span className="ml-2 tabular-nums opacity-60">
                    {counts[c.name] ?? 0}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setEditing(editing === c.name ? null : c.name);
                  }}
                  aria-expanded={editing === c.name}
                  aria-label={`Rename ${c.name} or change its colour`}
                  title={`Rename ${c.name} or change its colour`}
                  className="grid place-items-center border-l border-current/20 px-2.5 opacity-55 transition-opacity hover:opacity-100"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          );
        })}
        {active && (
          <li>
            <button
              onClick={() => onFilter?.(null)}
              className="rounded-full bg-ink-950/5 px-3.5 py-1.5 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950 hover:text-cream-50"
            >
              Show all
            </button>
          </li>
        )}
        {categories.length === 0 && (
          <li className="text-sm text-ink-800/50">
            None yet — every dish will show under &ldquo;Menu&rdquo; until
            there are some.
          </li>
        )}
      </ul>

      {(adding || editing) && (
        <Editor
          key={editing ?? "new"}
          was={editing ?? ""}
          colour={
            categories.find((c) => c.name === editing)?.colour ?? CATEGORY_COLOURS[0]
          }
          dishCount={editing ? (counts[editing] ?? 0) : 0}
          onDone={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function Editor({
  was,
  colour: initialColour,
  dishCount,
  onDone,
}: {
  was: string;
  colour: string;
  dishCount: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(was);
  const [colour, setColour] = useState(initialColour);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveCategory({ was, name, colour });
      if (r.error) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await deleteCategory(was);
      if (r.error) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="mt-3 rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
      {/* Capped rather than flex-1. On a wide screen the name box grew to
          fill the row and pushed the colours to the far edge, so the two
          halves of one decision ended up a hand's width apart. */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="w-full min-w-0 sm:w-64">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Chicken"
            className="w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors focus:border-gold-400"
          />
        </label>
        <div>
          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
            Colour
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLOURS.map((c) => (
              <button
                key={c}
                onClick={() => setColour(c)}
                title={CATEGORY_TONES[c].label}
                aria-label={CATEGORY_TONES[c].label}
                aria-pressed={colour === c}
                className={`h-9 w-9 rounded-lg ring-2 transition-transform hover:scale-110 ${
                  CATEGORY_TONES[c].dot
                } ${colour === c ? "ring-ink-950" : "ring-transparent"}`}
              />
            ))}
          </div>
        </div>
      </div>

      {was && name.trim() && name.trim() !== was && dishCount > 0 && (
        <p className="mt-3 rounded-xl bg-gold-400/25 px-3 py-2 text-xs font-semibold text-ink-900">
          {dishCount} dish{dishCount === 1 ? "" : "es"} will move from &ldquo;
          {was}&rdquo; to &ldquo;{name.trim()}&rdquo;.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={pending || !name.trim()}
          className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {pending ? "Saving…" : was ? "Save" : "Add it"}
        </button>
        <button
          onClick={onDone}
          disabled={pending}
          className="rounded-xl bg-ink-950/5 px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
        >
          Cancel
        </button>
        {was && (
          <button
            onClick={remove}
            disabled={pending}
            className="ml-auto rounded-xl px-4 py-2.5 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-cream-50"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
