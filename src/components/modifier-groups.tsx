"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { ruleLabel } from "@/lib/modifiers";
import {
  BandButton,
  Panel,
  PanelBand,
  PanelBody,
  PreviewBand,
  RailRow,
  Stat,
  StatDot,
  Step,
  Steps,
} from "@/components/hq-panel";
import {
  deleteModifierGroup,
  saveModifierGroup,
  reorderModifierGroup,
  setModifierGroupActive,
  type OptionInput,
} from "@/app/admin/menu/modifier-actions";
import { peso } from "@/lib/peso";

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
 *
 * ── Why this panel is the loud one on the Menu screen ────────────────────
 *
 * Every other panel here edits something the owner can already see: a price,
 * a photograph, which card a dish sits on. This one builds a thing that does
 * not exist yet, out of parts that are not obviously related — a hidden dish,
 * a question, and a list of menu cards. So it carries its own header band and
 * its own colour, and every group shows a PREVIEW of the chips the customer
 * will get rather than a sentence describing them. The owner should not have
 * to open the website in another tab to see what they just built.
 *
 * The colour is not decoration either. A red rail is a question the customer
 * cannot skip; a green one is an extra they can ignore; a grey one is
 * switched off. That is the single most consequential fact about a group and
 * it is legible from across the room.
 */

export type ModifierOptionRow = {
  id: string;
  label: string;
  option_meal_id: string | null;
  /** Set instead of `option_meal_id` when this add-on comes in sizes. */
  option_product_id: string | null;
  price_override: number | null;
  /** What each size charges, by dish id. Absent size = charge its own price. */
  sizePrices?: Record<string, number>;
  max_qty: number;
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

/**
 * A menu card offered as an ANSWER rather than a place to ask.
 *
 * `PickableCard` is where a question gets attached; this is a drink that
 * comes in sizes being chosen as one of the ways of answering it. The sizes
 * are the card's variants, read from the menu rather than typed here — so
 * the day a 1L is added to the menu, every combo offering that drink has it,
 * and there is no second list to remember to update.
 */
export type PickableProduct = {
  id: string;
  name: string;
  variants: { mealId: string; label: string; price: number }[];
};

/**
 * How a product is told apart from a dish inside one picker.
 *
 * Two comboboxes side by side would make the owner decide which KIND of
 * thing they are choosing before they may type its name — and they think in
 * names, not in kinds. One list, and the prefix keeps the two id spaces from
 * colliding on the way back out.
 */
const PRODUCT_PREFIX = "product:";

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
      productId: o.option_product_id ?? null,
      label: o.label,
      priceOverride: o.price_override,
      sizePrices: { ...(o.sizePrices ?? {}) },
      maxQty: Math.max(1, Number(o.max_qty) || 1),
    })),
  productIds: [...g.productIds],
  mealIds: [...g.mealIds],
});

/** Required is the loud one, optional the quiet one, off the grey one. */
function toneOf(g: { min_select: number; is_active: boolean }) {
  if (!g.is_active) {
    return {
      rail: "bg-ink-950/20",
      badge: "bg-ink-950/10 text-ink-800/55",
      ring: "ring-ink-950/10",
    };
  }
  return g.min_select >= 1
    ? { rail: "bg-brand-600", badge: "bg-brand-600 text-cream-50", ring: "ring-brand-600/20" }
    : { rail: "bg-jade-600", badge: "bg-jade-600 text-cream-50", ring: "ring-jade-600/20" };
}

/**
 * One answer, drawn the way the customer will see it.
 *
 * The list used to be a sentence — "Coke (free) · Iced tea (free)". A sentence
 * is the wrong shape for a set of choices: it reads as prose, so the prices
 * hide inside it, and nothing about it resembles the thing being built. These
 * are the chips, with the money where the money goes.
 */
function OptionChip({
  label,
  price,
  sizes,
  maxQty,
}: {
  label: string;
  price: number;
  /** How many sizes it comes in. 0 for a plain add-on. */
  sizes: number;
  maxQty: number;
}) {
  const free = price <= 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream-50 py-1 pl-3 pr-1.5 text-xs font-bold text-ink-950 ring-1 ring-ink-950/10">
      <span className="truncate">{label}</span>
      {/* Only where it is more than one. "×1" on every chip would be noise
          on the setting that is almost always left alone. */}
      {maxQty > 1 && (
        <span className="rounded-full bg-ink-950/[0.07] px-1.5 py-0.5 text-[10px] font-black tabular-nums text-ink-800/70">
          up to {maxQty}
        </span>
      )}
      {/* The price beside it is the cheapest size, so the chip has to say
          that it IS the cheapest — "+₱0" on a drink whose large costs ₱15
          reads as a mistake in the books. */}
      {sizes > 0 && (
        <span className="rounded-full bg-ink-950/[0.07] px-1.5 py-0.5 text-[10px] font-black tabular-nums text-ink-800/70">
          {sizes} sizes
        </span>
      )}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
          free ? "bg-jade-600/12 text-jade-700" : "bg-gold-400/30 text-ink-900"
        }`}
      >
        {/* Free is written as free. A blank space where a price goes reads as
            a number that failed to load. */}
        {sizes > 0 ? (free ? "FROM FREE" : `from +${peso(price)}`) : free ? "FREE" : `+${peso(price)}`}
      </span>
    </span>
  );
}

export function ModifierGroups({
  groups,
  meals,
  cards,
  products = [],
  withRecipe,
}: {
  groups: ModifierGroupRow[];
  meals: PickableMeal[];
  cards: PickableCard[];
  /** The same cards again, with their sizes — see `PickableProduct`. */
  products?: PickableProduct[];
  /**
   * Dishes that have a recipe — ingredients, or components of their own.
   *
   * The one failure this feature can produce silently. An option pointing at
   * a dish with no recipe sells for real money and books zero cost, so every
   * combo carrying it reads as pure profit; and `makeable` is null for it, so
   * it never goes sold out however much rice is left. Both are invisible
   * until somebody compares the books with the shelf.
   */
  withRecipe: Set<string>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ModifierGroupRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const mealById = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  /**
   * One picker holding both, sized cards first.
   *
   * Sized first because it is the better answer whenever it exists: picking
   * "Iced Tea · 2 sizes" offers both and keeps them in step with the menu,
   * while picking the Regular dish underneath it quietly offers only the
   * one. A card with no variants is left out — it would be an answer that
   * resolves to nothing.
   */
  const mealOptions = useMemo(
    () => [
      ...products
        .filter((p) => p.variants.length > 0)
        .map((p) => ({
          value: `${PRODUCT_PREFIX}${p.id}`,
          label: `${p.name} · ${p.variants.length} size${
            p.variants.length === 1 ? "" : "s"
          }`,
        })),
      ...meals.map((m) => ({
        value: m.id,
        // The price is in the picker because it is the number the option will
        // charge when no override is typed — choosing blind and finding out
        // on the live menu is the mistake this prevents.
        label: `${m.name} · ${peso(m.price)}${m.is_public ? "" : " · hidden"}`,
      })),
    ],
    [meals, products]
  );

  /**
   * What an option costs today: the override, or the dish's own price.
   *
   * A sized one has no single answer, so it is quoted from its cheapest size
   * — the number the chip on the menu leads with, and the one the customer
   * reads before opening the sizes.
   */
  const priceOf = (o: ModifierOptionRow) => {
    if (o.option_product_id) {
      const sizes = productById.get(o.option_product_id)?.variants ?? [];
      if (sizes.length === 0) return o.price_override ?? 0;
      return Math.min(
        ...sizes.map(
          (v) => o.sizePrices?.[v.mealId] ?? o.price_override ?? v.price
        )
      );
    }
    return (
      o.price_override ??
      (o.option_meal_id ? (mealById.get(o.option_meal_id)?.price ?? 0) : 0)
    );
  };

  // One line under the title instead of three big number tiles. These figures
  // are context, not the point of the screen — a row of stat cards here would
  // claim they were.
  const live = groups.filter((g) => g.is_active);
  const attached = new Set(
    live.flatMap((g) => [...g.productIds, ...g.mealIds])
  ).size;

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
          productId: o.productId ?? null,
          label: o.label,
          priceOverride: o.priceOverride,
          sizePrices: o.sizePrices,
          maxQty: o.maxQty,
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

  function move(g: ModifierGroupRow, direction: -1 | 1) {
    setError(null);
    startTransition(async () => {
      const result = await reorderModifierGroup(g.id, direction);
      if (result.error) return setError(result.error);
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
    <Panel>
      <PanelBand
        title="Add-ons"
        accent="&"
        after="combos"
        lead={
          <>
            &ldquo;Extra rice?&rdquo;, &ldquo;Choose your drink&rdquo; — asked
            on the dish, the same on the website and at the counter. Every
            answer points at a real dish, so it costs what that dish costs and
            takes the same things off the shelf.
          </>
        }
        stats={
          groups.length > 0 && (
            <>
              <Stat n={live.length}>live</Stat>
              <StatDot />
              <Stat n={live.reduce((n, g) => n + g.options.length, 0)}>
                answers
              </Stat>
              <StatDot />
              <span>offered on</span>
              <Stat n={attached}>{attached === 1 ? "place" : "places"}</Stat>
            </>
          )
        }
        action={
          <BandButton
            onClick={() => {
              setError(null);
              setDraft(blankDraft());
            }}
          >
            + New group
          </BandButton>
        }
      />

      <PanelBody>
        {error && (
          <p className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-600/20">
            {error}
          </p>
        )}

        {groups.length === 0 ? (
          <div className="rounded-2xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
            <p className="font-display text-lg font-black text-ink-950">
              Nothing offered with anything yet.
            </p>
            <p className="mt-1 text-sm text-ink-800/65">
              Two steps, and the first one is the one nobody guesses.
            </p>
            {/* Numbered because it IS a sequence — the group cannot be built
                until the dish exists. Numbers that encode nothing are
                decoration; these encode an order you cannot reverse. */}
            <Steps
              items={[
                <>
                  Make the add-on as a <strong>dish</strong> —
                  &ldquo;Extra rice&rdquo; — with its own recipe and price, and
                  untick <strong>Show on menu</strong> so it doesn&apos;t get a
                  card of its own.
                </>,
                <>
                  Come back here, point an option at that dish, and attach the
                  group to the <strong>menu cards</strong> that should offer it.
                </>,
              ]}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g, i) => {
              const tone = toneOf(g);
              const orphans = g.options.filter((o) => !o.option_meal_id);
              const where = [
                ...g.productIds.map((id) => cardById.get(id)?.name),
                ...g.mealIds.map((id) => mealById.get(id)?.name),
              ].filter(Boolean) as string[];
              const shownWhere = where.slice(0, 4);

              return (
                /* The rail. Red is compulsory, green is optional, grey is
                   switched off — the one fact worth reading first. */
                <RailRow
                  key={g.id}
                  rail={tone.rail}
                  ring={tone.ring}
                  dimmed={!g.is_active}
                >
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-lg font-black text-ink-950">
                            {g.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone.badge}`}
                          >
                            {ruleLabel({ min: g.min_select, max: g.max_select })}
                          </span>
                          {!g.is_active && (
                            <span className="rounded-full bg-ink-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cream-50">
                              off
                            </span>
                          )}
                        </p>
                        {g.helper && (
                          <p className="mt-0.5 text-xs text-ink-800/55">{g.helper}</p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {/* The order the customer meets these in, on every
                            dish that carries them. Worth having because the
                            default was alphabetical by name — which put
                            "Choose your drinks" above "Extra rice" on a rice
                            combo, asking for the drink before the thing the
                            customer came for.

                            One order for all dishes: a group sits on a dozen
                            of them, and a position per dish is a rule free to
                            contradict itself. */}
                        <button
                          onClick={() => move(g, -1)}
                          disabled={busy || i === 0}
                          aria-label={`Show ${g.name} earlier`}
                          title="Show this earlier on the dish"
                          className="grid h-9 w-9 place-items-center rounded-full bg-ink-950/5 font-black text-ink-800/60 transition-colors hover:bg-ink-950/10 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(g, 1)}
                          disabled={busy || i === groups.length - 1}
                          aria-label={`Show ${g.name} later`}
                          title="Show this later on the dish"
                          className="grid h-9 w-9 place-items-center rounded-full bg-ink-950/5 font-black text-ink-800/60 transition-colors hover:bg-ink-950/10 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => toggleActive(g)}
                          disabled={busy}
                          className="rounded-full px-3 py-1.5 text-xs font-bold text-ink-800/60 transition-colors hover:bg-ink-950/5 hover:text-ink-950 disabled:opacity-50"
                        >
                          {g.is_active ? "Turn off" : "Turn on"}
                        </button>
                        <button
                          onClick={() => {
                            setError(null);
                            setDraft(draftOf(g));
                          }}
                          aria-label={`Edit ${g.name}`}
                          className="grid h-9 w-9 place-items-center rounded-full bg-ink-950/5 text-ink-800 transition-colors hover:bg-ink-950 hover:text-cream-50"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(g)}
                          aria-label={`Delete ${g.name}`}
                          className="grid h-9 w-9 place-items-center rounded-full text-ink-800/40 transition-colors hover:bg-brand-50 hover:text-brand-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* The answers, as the customer meets them. */}
                    {g.options.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {g.options.map((o) => (
                          <OptionChip
                            key={o.id}
                            label={o.label}
                            price={priceOf(o)}
                            sizes={
                              o.option_product_id
                                ? (productById.get(o.option_product_id)
                                    ?.variants.length ?? 0)
                                : 0
                            }
                            maxQty={Math.max(1, Number(o.max_qty) || 1)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-bold text-ink-800/45">
                        No answers yet — nobody is offered anything.
                      </p>
                    )}

                    {/* Where it shows up. Named, not counted: "on 4 cards"
                        still leaves the owner opening the group to find out
                        whether the rice meals are among them. */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-950/[0.07] pt-3">
                      {where.length === 0 ? (
                        <span className="rounded-full bg-gold-400/25 px-2.5 py-1 text-[11px] font-bold text-ink-900">
                          ⚠︎ Not attached to anything — nobody is offered this
                        </span>
                      ) : (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                            On
                          </span>
                          {shownWhere.map((name) => (
                            <span
                              key={name}
                              className="max-w-[14rem] truncate rounded-full bg-ink-950/[0.06] px-2.5 py-1 text-[11px] font-bold text-ink-800/75"
                            >
                              {name}
                            </span>
                          ))}
                          {where.length > shownWhere.length && (
                            <span className="rounded-full px-1.5 py-1 text-[11px] font-bold text-ink-800/45">
                              +{where.length - shownWhere.length} more
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {orphans.length > 0 && (
                      // The one failure that is otherwise invisible: the dish
                      // was deleted, so the option is no longer offered and
                      // no longer costs anything. Said here, because the
                      // customer's menu just quietly stops showing it.
                      <p className="mt-3 rounded-xl bg-gold-50 px-3 py-2 text-xs font-bold text-ink-800 ring-1 ring-gold-400/60">
                        ⚠︎ {orphans.map((o) => o.label).join(", ")}{" "}
                        {orphans.length === 1 ? "points" : "point"} at a dish
                        that was deleted, so{" "}
                        {orphans.length === 1 ? "it is" : "they are"} no longer
                        offered. Edit the group and pick another dish.
                      </p>
                    )}
                  </>
                </RailRow>
              );
            })}
          </ul>
        )}
      </PanelBody>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          mealById={mealById}
          mealOptions={mealOptions}
          meals={meals}
          cards={cards}
          productById={productById}
          withRecipe={withRecipe}
          busy={busy}
          error={error}
          onSave={save}
          onClose={() => setDraft(null)}
        />
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
    </Panel>
  );
}

/**
 * Building a group.
 *
 * Three numbered steps, in the order the thing is actually built: what you
 * ask, the ways of answering, and where it is asked. Numbered because the
 * order is real — a group with no answers cannot be attached to anything
 * useful, and one attached to nothing is never seen.
 *
 * And a preview at the bottom that redraws as they type. It is not a
 * flourish: everything above it is a form about an abstraction, and the one
 * question the owner actually has — "so what does the customer get?" — was
 * only answerable by saving, opening the website and finding a dish that
 * carries it. Now it is answered in place, in the same chips the customer
 * sees, with the total the dish will show.
 */
function Editor({
  draft,
  setDraft,
  mealById,
  mealOptions,
  meals,
  cards,
  productById,
  withRecipe,
  busy,
  error,
  onSave,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  mealById: Map<string, PickableMeal>;
  mealOptions: { value: string; label: string }[];
  meals: PickableMeal[];
  cards: PickableCard[];
  productById: Map<string, PickableProduct>;
  withRecipe: Set<string>;
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const rule = ruleLabel({
    min: draft.required ? 1 : 0,
    max: Math.max(1, draft.maxSelect),
  });

  /** The sizes an option comes in — empty for a plain one. */
  const sizesOf = (o: { productId?: string | null }) =>
    o.productId ? (productById.get(o.productId)?.variants ?? []) : [];

  /**
   * What one size charges.
   *
   * The same three steps the menu and the counter resolve — see
   * `variantPrice` in lib/modifiers.ts, which has the tests. Written out
   * here rather than imported because this one takes the DRAFT's shape,
   * which is being typed into and is not a saved option yet.
   */
  const sizePrice = (
    o: { sizePrices?: Record<string, number | null>; priceOverride: number | null },
    v: { mealId: string; price: number }
  ) => o.sizePrices?.[v.mealId] ?? o.priceOverride ?? v.price;

  const priced = draft.options.map((o) => {
    const sizes = sizesOf(o);
    return {
      ...o,
      sizes,
      price:
        sizes.length > 0
          ? Math.min(...sizes.map((v) => sizePrice(o, v)))
          : (o.priceOverride ??
            (o.mealId ? (mealById.get(o.mealId)?.price ?? 0) : 0)),
    };
  });

  /**
   * Options whose dish has no recipe.
   *
   * Not refused — a shop mid-setup has half its recipes entered, and blocking
   * the save would mean building the group twice. Said, and said in terms of
   * the two things that actually go wrong, because neither is visible
   * anywhere else until the books stop matching the shelf.
   *
   * A sized option is counted when ANY of its sizes is missing one. Checking
   * only the cheapest would let a large iced tea sell all day booking no
   * cost, behind a regular that looked fine.
   */
  const noRecipe = draft.options.filter((o) => {
    const sizes = sizesOf(o);
    if (sizes.length > 0) return sizes.some((v) => !withRecipe.has(v.mealId));
    return Boolean(o.mealId) && !withRecipe.has(o.mealId);
  });

  return (
    <AdminDialog
      wide
      title={draft.id ? "Edit add-on group" : "New add-on group"}
      subtitle="One question, the ways of answering it, and where it is asked."
      busy={busy}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <Step n={1} title="What the customer is asked">
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Choose your drink"
              aria-label="What the customer is asked"
              className={field}
            />
            <input
              value={draft.helper}
              onChange={(e) => setDraft({ ...draft, helper: e.target.value })}
              placeholder="Small print — “Comes with the meal” (optional)"
              aria-label="Small print"
              className={field}
            />

            <div className="flex flex-wrap items-center gap-2">
              {/* Two buttons rather than a checkbox, because they are the two
                  halves of one decision and a checkbox only ever shows you
                  the half you are not in. */}
              {[false, true].map((required) => (
                <button
                  key={String(required)}
                  type="button"
                  aria-pressed={draft.required === required}
                  onClick={() => setDraft({ ...draft, required })}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    draft.required === required
                      ? required
                        ? "bg-brand-600 text-cream-50"
                        : "bg-jade-600 text-cream-50"
                      : "bg-cream-50 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                  }`}
                >
                  {required ? "They must answer" : "They can skip it"}
                </button>
              ))}

              <label className="ml-auto flex items-center gap-2 text-xs font-bold text-ink-800/70">
                How many?
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
                  className="w-16 rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-1.5 text-sm font-bold tabular-nums text-ink-950 outline-none focus:border-brand-600"
                />
              </label>
            </div>
          </div>
        </Step>

        <Step
          n={2}
          title="The ways of answering"
          hint="Each one points at a dish — that is what makes it cost real money and take real stock. Pick a menu card instead when it comes in sizes."
        >
          <div className="flex flex-col gap-2">
            {draft.options.length === 0 && (
              <p className="rounded-xl bg-cream-50 px-3 py-3 text-xs text-ink-800/65 ring-1 ring-ink-950/10">
                Make hidden dishes like &ldquo;Extra rice&rdquo; or
                &ldquo;Coke&rdquo; first — with their own recipe and price —
                then choose them here. A drink that comes in sizes is a menu
                card: choose the card and every size comes with it, each with
                its own cost, stock and price.
              </p>
            )}

            {draft.options.map((o, at) => {
              const meal = o.mealId ? mealById.get(o.mealId) : null;
              const product = o.productId ? productById.get(o.productId) : null;
              const sizes = product?.variants ?? [];
              return (
                /**
                 * Two lines, not four fields fighting over one.
                 *
                 * They were on one row with the two text boxes at fixed widths
                 * and the dish picker taking what was left — which, inside the
                 * dialog, was 36px. A blank box too small to hold a character,
                 * in front of the one field that decides what the add-on costs
                 * and what it takes off the shelf.
                 */
                <div
                  key={o.key}
                  className="rounded-xl bg-cream-50 p-3 ring-1 ring-ink-950/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-950/5 font-display text-xs font-black tabular-nums text-ink-800/60">
                      {at + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Combobox
                        ariaLabel="Which dish is this option?"
                        placeholder="Which dish or sized drink? Start typing…"
                        value={
                          o.productId ? `${PRODUCT_PREFIX}${o.productId}` : o.mealId
                        }
                        options={mealOptions}
                        onChange={(value) => {
                          const isProduct = value.startsWith(PRODUCT_PREFIX);
                          const productId = isProduct
                            ? value.slice(PRODUCT_PREFIX.length)
                            : "";
                          const picked = isProduct
                            ? productById.get(productId)
                            : mealById.get(value);
                          const next = [...draft.options];
                          next[at] = {
                            ...o,
                            // One or the other, never both — the same rule
                            // the database enforces (0061). Cleared here so
                            // the save cannot carry a stale dish under a
                            // newly-chosen card.
                            mealId: isProduct ? "" : value,
                            productId: isProduct ? productId : null,
                            // Sizes belong to the card that was chosen.
                            // Keeping the old card's per-size prices would
                            // reattach them by dish id to whatever happened
                            // to match, which is a wrong price nobody typed.
                            sizePrices: {},
                            // The label follows the dish the first time,
                            // because it is right nine times out of ten and
                            // the tenth is one edit. Never overwritten
                            // afterwards: the dish is "Extra Rice (cup)" and
                            // the chip should say "Extra rice".
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
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-800/40 transition-colors hover:bg-brand-50 hover:text-brand-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-col gap-2 pl-9 sm:flex-row">
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

                    {/* How many of THIS one. Not the group's "how many
                        answers" above — extra rice can sensibly be taken
                        twice, and "upgrade to large" cannot, so the answer
                        belongs on the answer. */}
                    <label className="flex shrink-0 items-center gap-2 rounded-xl bg-cream-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-ink-800/55">
                      Max
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={o.maxQty}
                        onChange={(e) => {
                          const next = [...draft.options];
                          next[at] = {
                            ...o,
                            maxQty: Math.max(
                              1,
                              Math.min(20, Number(e.target.value) || 1)
                            ),
                          };
                          setDraft({ ...draft, options: next });
                        }}
                        aria-label={`How many ${o.label || "of this"} may be taken`}
                        className="w-14 rounded-lg border-2 border-ink-950/15 bg-cream-50 px-2 py-1 text-sm font-bold normal-case tabular-nums tracking-normal text-ink-950 outline-none focus:border-brand-600"
                      />
                    </label>
                    <input
                      inputMode="decimal"
                      value={o.priceOverride ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const next = [...draft.options];
                        next[at] = {
                          ...o,
                          // Blank is not zero. Blank means "charge what that
                          // dish costs", which stays right when the price of
                          // rice goes up; zero means free, which is what a
                          // drink in a combo is.
                          priceOverride: raw === "" ? null : Number(raw),
                        };
                        setDraft({ ...draft, options: next });
                      }}
                      placeholder={
                        meal
                          ? `${meal.price.toFixed(2)} (dish price)`
                          : sizes.length > 0
                            ? "Price for every size"
                            : "Price"
                      }
                      aria-label={
                        sizes.length > 0
                          ? "Price for every size, unless a size sets its own"
                          : "Price, or blank to use the dish's own"
                      }
                      className={`${field} min-w-0 sm:w-40 sm:shrink-0`}
                    />
                  </div>

                  {/* ── the sizes ──────────────────────────────────────────
                      Listed, not entered. They are the card's own variants,
                      so the only thing typed here is what each one CHARGES —
                      the cost, the recipe, the stock and the sold-out switch
                      are already that dish's, and there is nowhere for a
                      second copy of them to go out of date.

                      Three steps behind every box, in the order they are
                      tried: this size's price, then the option's price above,
                      then the dish's own. Each placeholder shows which one is
                      answering right now, so a blank box is never a mystery. */}
                  {o.productId &&
                    (sizes.length === 0 ? (
                      <p className="mt-2 ml-9 rounded-xl bg-gold-50 px-3 py-2 text-xs font-semibold text-ink-800 ring-1 ring-gold-400/60">
                        ⚠︎ That menu card has no sizes on it yet, so this
                        answer has nothing to offer. Add its dishes to the
                        card in <strong>Menu cards</strong> above, or pick a
                        single dish here instead.
                      </p>
                    ) : (
                      <div className="mt-2 ml-9 rounded-xl bg-cream-100 p-2.5 ring-1 ring-ink-950/[0.07]">
                        <p className={label}>
                          What each size charges
                        </p>
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          {sizes.map((v) => {
                            const own = o.sizePrices?.[v.mealId];
                            const falls = o.priceOverride ?? v.price;
                            return (
                              <div
                                key={v.mealId}
                                className="flex items-center gap-2"
                              >
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950">
                                  {v.label}
                                  {!withRecipe.has(v.mealId) && (
                                    <span className="ml-1.5 rounded-full bg-gold-400/30 px-1.5 py-0.5 text-[10px] font-black uppercase text-ink-900">
                                      no recipe
                                    </span>
                                  )}
                                </span>
                                <span className="text-[11px] font-bold tabular-nums text-ink-800/45">
                                  dish {peso(v.price)}
                                </span>
                                <span className="w-28 shrink-0">
                                  <input
                                    inputMode="decimal"
                                    value={own ?? ""}
                                    onChange={(e) => {
                                      const raw = e.target.value.trim();
                                      const next = [...draft.options];
                                      const prices = {
                                        ...(o.sizePrices ?? {}),
                                      };
                                      // Blank REMOVES the row rather than
                                      // writing a null: "not set" is the
                                      // absence of an override, and a row
                                      // saying null would have to mean the
                                      // same thing in a second way.
                                      if (raw === "") delete prices[v.mealId];
                                      else prices[v.mealId] = Number(raw);
                                      next[at] = { ...o, sizePrices: prices };
                                      setDraft({ ...draft, options: next });
                                    }}
                                    placeholder={falls.toFixed(2)}
                                    aria-label={`What ${v.label} charges`}
                                    className="w-full rounded-lg border-2 border-ink-950/15 bg-cream-50 px-2 py-1 text-sm font-bold tabular-nums text-ink-950 outline-none focus:border-brand-600"
                                  />
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-ink-800/50">
                          Leave a size blank to charge{" "}
                          {o.priceOverride === null
                            ? "that dish's own price"
                            : `the ${peso(o.priceOverride)} above`}
                          . Type <strong>0</strong> for the size that comes
                          free with the combo.
                        </p>
                      </div>
                    ))}
                </div>
              );
            })}

            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  options: [
                    ...draft.options,
                    {
                      key: nextKey(),
                      mealId: "",
                      productId: null,
                      label: "",
                      priceOverride: null,
                      sizePrices: {},
                      maxQty: 1,
                    },
                  ],
                })
              }
              className="self-start rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50"
            >
              + Add an answer
            </button>

            {noRecipe.length > 0 && (
              <p className="rounded-xl bg-gold-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-ink-800 ring-1 ring-gold-400/60">
                ⚠︎{" "}
                {noRecipe
                  .map(
                    (o) =>
                      o.label.trim() ||
                      (o.productId
                        ? productById.get(o.productId)?.name
                        : mealById.get(o.mealId)?.name)
                  )
                  .filter(Boolean)
                  .join(", ")}{" "}
                {noRecipe.length === 1 ? "has" : "have"} no recipe yet. You can
                still save — but until the recipe is in, selling{" "}
                {noRecipe.length === 1 ? "it" : "them"} books{" "}
                <strong>no cost</strong>, so every combo carrying{" "}
                {noRecipe.length === 1 ? "it" : "them"} reads as pure profit,
                and {noRecipe.length === 1 ? "it" : "they"} will{" "}
                <strong>never go sold out</strong> however much is left. Add it
                in <strong>Dish costs</strong>.
              </p>
            )}

            <p className="text-[11px] leading-relaxed text-ink-800/50">
              Leave the price blank to charge whatever that dish costs — one
              price to keep up to date instead of two. Type <strong>0</strong>{" "}
              for a drink that comes free with the combo. <strong>Max</strong>{" "}
              is how many of that one answer a customer may take — leave it at
              1 for a plain tick, raise it for something like extra rice.
              Choosing a <strong>menu card</strong> instead of a dish offers
              its sizes — the customer picks the answer, then the size, and
              the one they pick is the dish that gets costed and taken off
              the shelf.
            </p>
          </div>
        </Step>

        <Step
          n={3}
          title="Where it is asked"
          hint="A menu card is the usual choice — every dish on the card gets it."
        >
          <div className="flex flex-col gap-3">
            <Attach
              title="Menu cards"
              empty="No menu cards yet. Group some dishes into a card above, or attach to dishes below."
              items={cards}
              chosen={draft.productIds}
              onChange={(productIds) => setDraft({ ...draft, productIds })}
              tone="bg-brand-600"
            />
            <Attach
              title="Individual dishes"
              empty="No dishes."
              items={meals.map((m) => ({ id: m.id, name: m.name }))}
              chosen={draft.mealIds}
              onChange={(mealIds) => setDraft({ ...draft, mealIds })}
              tone="bg-ink-950"
              searchable
            />
          </div>
        </Step>

        {/* ── the preview ───────────────────────────────────────────────
            Everything above is a form about an abstraction. This is the
            answer to the only question the owner actually has, and it used to
            require saving, opening the website, and finding a dish that
            carries the group. */}
        <PreviewBand>
          <>
            <p className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/45">
                {draft.name.trim() || "Your question"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                  draft.required
                    ? "bg-brand-600 text-cream-50"
                    : "bg-ink-950/10 text-ink-800/60"
                }`}
              >
                {rule}
              </span>
            </p>
            {draft.helper.trim() && (
              <p className="mt-1 text-xs text-ink-800/55">{draft.helper}</p>
            )}

            {priced.length === 0 ? (
              <p className="mt-2 text-xs text-ink-800/40">
                Nothing to choose from yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {priced.map((o, i) => (
                  <li key={o.key} className="rounded-lg px-1 py-1.5">
                   <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`grid h-5 w-5 shrink-0 place-items-center border-2 text-[11px] font-black ${
                        draft.maxSelect === 1 ? "rounded-full" : "rounded-md"
                      } ${
                        // The first one shown ticked when the question is
                        // compulsory, because that is exactly what the dish
                        // dialog does — see `openingChoice`.
                        draft.required && i === 0
                          ? "border-ink-950 bg-ink-950 text-cream-50"
                          : "border-ink-950/25 bg-cream-100"
                      }`}
                    >
                      {draft.required && i === 0 ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950">
                      {o.label.trim() || "(no label yet)"}
                    </span>
                    {/* The stepper the customer will get, drawn but not
                        wired: this panel is a picture of the dish dialog, and
                        a working control here would be a second place to set
                        something that is already set above. */}
                    {o.maxQty > 1 && (
                      <span
                        aria-hidden
                        className="flex shrink-0 items-center gap-0.5 rounded-full bg-ink-950/5 px-1 py-0.5 text-xs font-black text-ink-800/50"
                      >
                        <span className="px-1">−</span>
                        <span className="tabular-nums text-ink-950">1</span>
                        <span className="px-1">+</span>
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink-800/70">
                      {o.sizes.length > 0
                        ? `from ${o.price > 0 ? `+${peso(o.price)}` : "Free"}`
                        : o.price > 0
                          ? `+${peso(o.price)}`
                          : "Free"}
                    </span>
                   </div>

                    {/* The size chips, drawn where the customer meets them:
                        under the answer, once it is ticked. The cheapest is
                        shown chosen because that is what the dish dialog
                        opens on — see `defaultVariant`. */}
                    {o.sizes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-8">
                        {o.sizes.map((v) => {
                          const p = sizePrice(o, v);
                          const cheapest = p === o.price;
                          return (
                            <span
                              key={v.mealId}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                cheapest
                                  ? "bg-ink-950 text-cream-50"
                                  : "bg-cream-50 text-ink-950 ring-1 ring-ink-950/10"
                              }`}
                            >
                              <span className="truncate">{v.label}</span>
                              <span className="tabular-nums opacity-70">
                                {p > 0 ? `+${peso(p)}` : "Free"}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        </PreviewBand>

        {error && (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-600/20">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-5 py-2.5 font-bold text-ink-800/70 hover:text-ink-950 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={busy}
            className="rounded-full bg-ink-950 px-6 py-2.5 font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save group"}
          </button>
        </div>
      </div>
    </AdminDialog>
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
  empty,
  items,
  chosen,
  onChange,
  tone,
  searchable = false,
}: {
  title: string;
  empty: string;
  items: { id: string; name: string }[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  /** What a picked chip is filled with, so the two lists are told apart. */
  tone: string;
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

  const picked = chosen.length;

  return (
    <div className="rounded-xl bg-cream-50 p-3 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <span className={label}>{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide tabular-nums ${
            picked > 0 ? "bg-jade-600 text-cream-50" : "bg-ink-950/8 text-ink-800/45"
          }`}
        >
          {picked} picked
        </span>
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
        <p className="px-0.5 py-2 text-xs text-ink-800/60">{empty}</p>
      ) : (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
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
                    ? `${tone} text-cream-50`
                    : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {on && <span aria-hidden className="mr-1">✓</span>}
                {i.name}
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="px-0.5 py-1 text-xs text-ink-800/50">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
