"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { TrashIcon } from "@/components/icons";
import {
  deleteModifierGroup,
  saveModifierGroup,
  setModifierGroupActive,
  type OptionInput,
} from "@/app/admin/menu/modifier-actions";

/**
 * Add-ons: extra rice, and a drink with that.
 *
 * ── What the owner is actually being asked for ───────────────────────────
 *
 * One question ("Extra rice?"), the ways of answering it, and which dishes it
 * is asked on. Nothing else, because everything else already exists: an
 * option is a DISH, so its cost, its recipe, its stock and its sold-out
 * switch are the ones the shop already keeps — there is no second place to
 * enter the price of rice and no second place for it to go out of date.
 *
 * That is also the one thing this screen has to teach. "Make a hidden dish
 * called Extra rice with its own recipe, then point an option at it" is not
 * obvious, and an owner who doesn't do it ends up with add-ons that earn
 * money the books show no cost against. So the empty state says it, the dish
 * picker says it, and saving without a dish is refused with the same
 * sentence.
 *
 * ── Attached to cards, not copied onto dishes ────────────────────────────
 *
 * "Choose your drink" is the same six drinks on every rice meal. Attaching it
 * to the CARD means adding a seventh drink is one edit; attaching it to each
 * dish means fourteen, and the guarantee that one gets missed. Both are
 * offered because both are real — the drinks belong to the card, the extra
 * noodles belong to the one dish that has noodles in it.
 */

export type ModifierOptionRow = {
  id: string;
  label: string;
  option_meal_id: string | null;
  price_override: number | null;
  sort_order: number;
};

export type ModifierGroupRow = {
  id: string;
  name: string;
  helper: string | null;
  min_select: number;
  max_select: number;
  is_active: boolean;
  options: ModifierOptionRow[];
  productIds: string[];
  mealIds: string[];
};

export type PickableMeal = {
  id: string;
  name: string;
  price: number;
  is_public: boolean;
};

export type PickableCard = { id: string; name: string };

type Draft = {
  id?: string;
  name: string;
  helper: string;
  required: boolean;
  maxSelect: number;
  isActive: boolean;
  options: (OptionInput & { key: string })[];
  productIds: string[];
  mealIds: string[];
};

const field =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";
const label =
  "text-[11px] font-black uppercase tracking-widest text-ink-800/55";

const peso = (n: number) => "₱" + n.toFixed(2);
let seq = 0;
const nextKey = () => `new-${seq++}`;

const blankDraft = (): Draft => ({
  name: "",
  helper: "",
  required: false,
  maxSelect: 1,
  isActive: true,
  options: [],
  productIds: [],
  mealIds: [],
});

const draftOf = (g: ModifierGroupRow): Draft => ({
  id: g.id,
  name: g.name,
  helper: g.helper ?? "",
  required: g.min_select >= 1,
  maxSelect: g.max_select,
  isActive: g.is_active,
  options: [...g.options]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({
      key: o.id,
      id: o.id,
      mealId: o.option_meal_id ?? "",
      label: o.label,
      priceOverride: o.price_override,
    })),
  productIds: [...g.productIds],
  mealIds: [...g.mealIds],
});

export function ModifierGroups({
  groups,
  meals,
  cards,
}: {
  groups: ModifierGroupRow[];
  meals: PickableMeal[];
  cards: PickableCard[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ModifierGroupRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const mealById = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const mealOptions = useMemo(
    () =>
      meals.map((m) => ({
        value: m.id,
        // The price is in the picker because it is the number the option will
        // charge when no override is typed — choosing blind and finding out
        // on the live menu is the mistake this prevents.
        label: `${m.name} · ${peso(m.price)}${m.is_public ? "" : " · hidden"}`,
      })),
    [meals]
  );

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveModifierGroup({
        id: draft.id,
        name: draft.name,
        helper: draft.helper,
        required: draft.required,
        maxSelect: draft.maxSelect,
        isActive: draft.isActive,
        options: draft.options.map((o) => ({
          id: o.id,
          mealId: o.mealId,
          label: o.label,
          priceOverride: o.priceOverride,
        })),
        productIds: draft.productIds,
        mealIds: draft.mealIds,
      });
      if (result.error) return setError(result.error);
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteModifierGroup(id);
      if (result.error) return setError(result.error);
      setConfirmDelete(null);
      router.refresh();
    });
  }

  function toggleActive(g: ModifierGroupRow) {
    setError(null);
    startTransition(async () => {
      const result = await setModifierGroupActive(g.id, !g.is_active);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <section className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-black text-ink-950">
            Add-ons &amp; combos
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/65">
            &ldquo;Extra rice?&rdquo;, &ldquo;Choose your drink&rdquo; — asked
            on the dish, the same on the website and at the counter. Each
            answer points at a real dish, so it costs what that dish costs and
            takes the same things off the shelf.
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setDraft(blankDraft());
          }}
          className="rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50"
        >
          New group
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      {groups.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-50 p-5 text-sm text-ink-800/75">
          <p className="font-bold text-ink-950">Nothing offered with anything yet.</p>
          {/* The setup nobody guesses, written out once where it is needed.
              An add-on that does not point at a dish is revenue with no cost
              behind it, and the margin on every combo reads high forever. */}
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Make the add-on as a dish — &ldquo;Extra rice&rdquo; — with its
              own recipe and price, and untick <strong>Show on menu</strong> so
              it doesn&apos;t get its own card.
            </li>
            <li>
              Make a group here, point an option at that dish, and attach the
              group to the menu cards that should offer it.
            </li>
          </ol>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {groups.map((g) => {
            const orphans = g.options.filter((o) => !o.option_meal_id);
            const where = [
              ...g.productIds.map((id) => cardById.get(id)?.name).filter(Boolean),
              ...g.mealIds.map((id) => mealById.get(id)?.name).filter(Boolean),
            ] as string[];

            return (
              <li
                key={g.id}
                className={`rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10 ${
                  g.is_active ? "" : "opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-lg font-black text-ink-950">
                      {g.name}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide ${
                          g.min_select >= 1
                            ? "bg-brand-600 text-cream-50"
                            : "bg-ink-950/10 text-ink-800/60"
                        }`}
                      >
                        {g.min_select >= 1 ? "Required" : "Optional"}
                      </span>
                      {g.max_select > 1 && (
                        <span className="ml-1.5 rounded-full bg-ink-950/10 px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide text-ink-800/60">
                          up to {g.max_select}
                        </span>
                      )}
                      {!g.is_active && (
                        <span className="ml-1.5 rounded-full bg-ink-950 px-2 py-0.5 align-middle text-[10px] font-black uppercase tracking-wide text-cream-50">
                          off
                        </span>
                      )}
                    </p>

                    <p className="mt-1 text-sm text-ink-800/70">
                      {g.options
                        .map((o) => {
                          const meal = o.option_meal_id
                            ? mealById.get(o.option_meal_id)
                            : null;
                          const price = o.price_override ?? meal?.price ?? 0;
                          return `${o.label} (${price > 0 ? peso(price) : "free"})`;
                        })
                        .join(" · ") || "No options yet"}
                    </p>

                    {/* Where it shows up. Without this the owner has to open
                        every group to find which one is on the rice meals. */}
                    <p className="mt-1 text-xs font-semibold text-ink-800/50">
                      {where.length > 0
                        ? `On: ${where.join(", ")}`
                        : "Not attached to anything yet — nobody is offered this."}
                    </p>

                    {orphans.length > 0 && (
                      // The one failure that is otherwise invisible: the dish
                      // was deleted, so the option is no longer offered and
                      // no longer costs anything. Said here, because the
                      // customer's menu just quietly stops showing it.
                      <p className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-xs font-bold text-ink-800 ring-1 ring-gold-400/60">
                        ⚠︎ {orphans.map((o) => o.label).join(", ")}{" "}
                        {orphans.length === 1 ? "points" : "point"} at a dish
                        that was deleted, so {orphans.length === 1 ? "it is" : "they are"}{" "}
                        no longer offered. Edit the group and pick another dish.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleActive(g)}
                      disabled={busy}
                      className="rounded-full px-3 py-2 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950/5 hover:text-ink-950 disabled:opacity-50"
                    >
                      {g.is_active ? "Turn off" : "Turn on"}
                    </button>
                    <button
                      onClick={() => {
                        setError(null);
                        setDraft(draftOf(g));
                      }}
                      className="rounded-full bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-950 transition-colors hover:bg-ink-950/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(g)}
                      aria-label={`Delete ${g.name}`}
                      className="grid h-9 w-9 place-items-center rounded-full text-ink-800/45 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <AdminDialog
          wide
          title={draft.id ? "Edit add-on group" : "New add-on group"}
          subtitle="One question, the ways of answering it, and where it is asked."
          busy={busy}
          onClose={() => setDraft(null)}
        >
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-1.5">
              <span className={label}>What the customer is asked</span>
              <input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Choose your drink"
                className={field}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={label}>Small print (optional)</span>
              <input
                value={draft.helper}
                onChange={(e) => setDraft({ ...draft, helper: e.target.value })}
                placeholder="Comes with the meal"
                className={field}
              />
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-bold text-ink-950">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) =>
                    setDraft({ ...draft, required: e.target.checked })
                  }
                  className="h-5 w-5 accent-brand-600"
                />
                They must answer
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-ink-950">
                How many can they pick?
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={draft.maxSelect}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      maxSelect: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-20 rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-1.5 text-sm tabular-nums outline-none focus:border-brand-600"
                />
              </label>
            </div>

            {/* ---- the options ---- */}
            <div className="rounded-2xl bg-cream-100 p-3 ring-1 ring-ink-950/10">
              <div className="flex items-center justify-between px-1">
                <span className={label}>Options</span>
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      options: [
                        ...draft.options,
                        { key: nextKey(), mealId: "", label: "", priceOverride: null },
                      ],
                    })
                  }
                  className="rounded-full bg-ink-950/5 px-3 py-1 text-xs font-bold text-ink-950 hover:bg-ink-950/10"
                >
                  Add option
                </button>
              </div>

              {draft.options.length === 0 ? (
                <p className="px-1 py-3 text-xs text-ink-800/60">
                  Each option points at a dish — that is what makes it cost
                  real money and take real stock. Make hidden dishes like
                  &ldquo;Extra rice&rdquo; or &ldquo;Coke&rdquo; first, then
                  choose them here.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {draft.options.map((o, at) => {
                    const meal = o.mealId ? mealById.get(o.mealId) : null;
                    return (
                      /**
                       * Two lines, not four fields fighting over one.
                       *
                       * They were on one row with the two text boxes at fixed
                       * widths and the dish picker taking what was left —
                       * which, inside a 464px dialog, was 36px. A blank box
                       * too small to hold a character, in front of the one
                       * field that decides what the add-on costs and what it
                       * takes off the shelf.
                       *
                       * The picker gets the whole first line now, which it
                       * wanted anyway: it is a search over every dish on the
                       * menu, and reading "Black Pepper Chicken Noodles ·
                       * ₱145.00" needs more than a third of a row. The two
                       * short answers share the second line.
                       */
                      <li
                        key={o.key}
                        className="rounded-xl bg-cream-50 p-3 ring-1 ring-ink-950/10"
                      >
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <Combobox
                              ariaLabel="Which dish is this option?"
                              placeholder="Which dish? Start typing a name…"
                              value={o.mealId}
                              options={mealOptions}
                              onChange={(value) => {
                                const picked = mealById.get(value);
                                const next = [...draft.options];
                                next[at] = {
                                  ...o,
                                  mealId: value,
                                  // The label follows the dish the first time,
                                  // because it is right nine times out of ten
                                  // and the tenth is one edit. Never
                                  // overwritten afterwards: the dish is "Extra
                                  // Rice (cup)" and the chip should say
                                  // "Extra rice".
                                  label: o.label || picked?.name || "",
                                };
                                setDraft({ ...draft, options: next });
                              }}
                            />
                          </div>

                          <button
                            onClick={() =>
                              setDraft({
                                ...draft,
                                options: draft.options.filter((x) => x.key !== o.key),
                              })
                            }
                            aria-label={`Remove ${o.label || "this option"}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-800/45 transition-colors hover:bg-brand-50 hover:text-brand-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            value={o.label}
                            onChange={(e) => {
                              const next = [...draft.options];
                              next[at] = { ...o, label: e.target.value };
                              setDraft({ ...draft, options: next });
                            }}
                            placeholder="What the chip says"
                            aria-label="What the chip says"
                            className={`${field} min-w-0 sm:flex-1`}
                          />

                          <input
                            inputMode="decimal"
                            value={o.priceOverride ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const next = [...draft.options];
                              next[at] = {
                                ...o,
                                // Blank is not zero. Blank means "charge what
                                // that dish costs", which stays right when the
                                // price of rice goes up; zero means free,
                                // which is what a drink in a combo is.
                                priceOverride: raw === "" ? null : Number(raw),
                              };
                              setDraft({ ...draft, options: next });
                            }}
                            placeholder={
                              meal ? `${meal.price.toFixed(2)} (dish price)` : "Price"
                            }
                            aria-label="Price, or blank to use the dish's own"
                            className={`${field} min-w-0 sm:w-40 sm:shrink-0`}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-2 px-1 text-[11px] text-ink-800/50">
                Leave the price blank to charge whatever that dish costs — one
                price to keep up to date instead of two. Type 0 for a drink
                that comes free with the combo.
              </p>
            </div>

            {/* ---- where it is offered ---- */}
            <div className="flex flex-col gap-3">
              <Attach
                title="Menu cards"
                hint="The usual choice — every dish on the card gets it."
                empty="No menu cards yet. Group some dishes into a card above, or attach to dishes below."
                items={cards}
                chosen={draft.productIds}
                onChange={(productIds) => setDraft({ ...draft, productIds })}
              />
              <Attach
                title="Individual dishes"
                hint="For an add-on that only makes sense on one dish."
                empty="No dishes."
                items={meals.map((m) => ({ id: m.id, name: m.name }))}
                chosen={draft.mealIds}
                onChange={(mealIds) => setDraft({ ...draft, mealIds })}
                searchable
              />
            </div>

            {error && (
              <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                disabled={busy}
                className="rounded-full px-5 py-2.5 font-bold text-ink-800/70 hover:text-ink-950 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-full bg-ink-950 px-6 py-2.5 font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save group"}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}

      {confirmDelete && (
        <AdminDialog
          title={`Delete "${confirmDelete.name}"?`}
          subtitle="It stops being offered anywhere. Orders that already carry it keep it."
          busy={busy}
          onClose={() => setConfirmDelete(null)}
        >
          <div className="flex flex-col gap-4">
            {/* The reassurance that matters, because it is the reason this is
                safe: the receipt holds its own copy of every add-on's name and
                price, so deleting the group cannot rewrite anybody's history. */}
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
              No dish, recipe or past order is touched. Every order that
              already has one of these on it keeps the name and the price it
              was charged.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="rounded-full px-5 py-2.5 font-bold text-ink-800/70 hover:text-ink-950 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                onClick={() => remove(confirmDelete.id)}
                disabled={busy}
                className="rounded-full bg-brand-600 px-6 py-2.5 font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete for good"}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </section>
  );
}

/**
 * Where a group is offered.
 *
 * A wrap of togglable chips rather than a multi-select: the owner is choosing
 * from things they named themselves, and seeing all of them at once is how
 * they notice the one rice meal they forgot. The dish list is long enough to
 * need a filter; the card list is not, and a search box over six chips is
 * furniture.
 */
function Attach({
  title,
  hint,
  empty,
  items,
  chosen,
  onChange,
  searchable = false,
}: {
  title: string;
  hint: string;
  empty: string;
  items: { id: string; name: string }[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items;
    // Every term, anywhere, in any order — the same rule as the search box on
    // the dish list, so the two don't behave differently for the same typing.
    return items.filter((i) => {
      const n = i.name.toLowerCase();
      return terms.every((t) => n.includes(t));
    });
  }, [items, query]);

  // Chosen ones stay visible through a filter, or unticking the one you can
  // no longer see is impossible.
  const visible = useMemo(() => {
    const ids = new Set(shown.map((i) => i.id));
    return [...shown, ...items.filter((i) => chosen.includes(i.id) && !ids.has(i.id))];
  }, [shown, items, chosen]);

  return (
    <div className="rounded-2xl bg-cream-100 p-3 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <span className={label}>{title}</span>
        <span className="text-[11px] text-ink-800/50">{hint}</span>
      </div>

      {searchable && items.length > 8 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          aria-label={`Filter ${title.toLowerCase()}`}
          className={`${field} mt-2`}
        />
      )}

      {items.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-800/60">{empty}</p>
      ) : (
        <div className="mt-2 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
          {visible.map((i) => {
            const on = chosen.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  onChange(
                    on ? chosen.filter((id) => id !== i.id) : [...chosen, i.id]
                  )
                }
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  on
                    ? "bg-ink-950 text-cream-50"
                    : "bg-cream-50 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {i.name}
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="px-1 py-1 text-xs text-ink-800/50">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
