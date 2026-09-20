"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { ruleLabel } from "@/lib/modifiers";
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
  price_override: number | null;
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
  maxQty,
}: {
  label: string;
  price: number;
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
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
          free ? "bg-jade-600/12 text-jade-700" : "bg-gold-400/30 text-ink-900"
        }`}
      >
        {/* Free is written as free. A blank space where a price goes reads as
            a number that failed to load. */}
        {free ? "FREE" : `+${peso(price)}`}
      </span>
    </span>
  );
}

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

  /** What an option costs today: the override, or the dish's own price. */
  const priceOf = (o: { price_override: number | null; option_meal_id: string | null }) =>
    o.price_override ??
    (o.option_meal_id ? (mealById.get(o.option_meal_id)?.price ?? 0) : 0);

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
          label: o.label,
          priceOverride: o.priceOverride,
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

  function toggleActive(g: ModifierGroupRow) {
    setError(null);
    startTransition(async () => {
      const result = await setModifierGroupActive(g.id, !g.is_active);
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
      {/* ── the band ──────────────────────────────────────────────────
          Dark, and the only dark header on this screen. The panels above it
          edit things the owner can already see on their own menu; this one
          builds something out of parts that do not look related until it is
          finished, so it is worth being told apart from across the page. */}
      <div className="relative bg-ink-950 px-5 py-5 text-cream-50 sm:px-6">
        {/* A gold hairline along the top — the accent this whole section of
            HQ already uses, so the panel belongs to the Menu screen rather
            than looking like something that wandered in. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-400 via-brand-600 to-jade-600"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-black text-cream-50 sm:text-2xl">
              Add-ons <span className="text-gold-400">&amp;</span> combos
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-100/70">
              &ldquo;Extra rice?&rdquo;, &ldquo;Choose your drink&rdquo; — asked
              on the dish, the same on the website and at the counter. Every
              answer points at a real dish, so it costs what that dish costs
              and takes the same things off the shelf.
            </p>
            {groups.length > 0 && (
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-cream-100/55">
                <span className="tabular-nums text-gold-400">{live.length}</span>
                <span>live</span>
                <span aria-hidden className="text-cream-100/25">•</span>
                <span className="tabular-nums text-gold-400">
                  {live.reduce((n, g) => n + g.options.length, 0)}
                </span>
                <span>answers</span>
                <span aria-hidden className="text-cream-100/25">•</span>
                <span>offered on</span>
                <span className="tabular-nums text-gold-400">{attached}</span>
                <span>{attached === 1 ? "place" : "places"}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setError(null);
              setDraft(blankDraft());
            }}
            className="shrink-0 rounded-full bg-gold-400 px-5 py-2.5 text-sm font-black text-ink-950 shadow-lg shadow-gold-400/20 transition-transform hover:scale-105"
          >
            + New group
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">
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
            <ol className="mt-4 flex flex-col gap-3">
              {[
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
              ].map((text, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink-800/80">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-400 font-display text-sm font-black text-ink-950">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const tone = toneOf(g);
              const orphans = g.options.filter((o) => !o.option_meal_id);
              const where = [
                ...g.productIds.map((id) => cardById.get(id)?.name),
                ...g.mealIds.map((id) => mealById.get(id)?.name),
              ].filter(Boolean) as string[];
              const shownWhere = where.slice(0, 4);

              return (
                <li
                  key={g.id}
                  className={`flex overflow-hidden rounded-2xl bg-cream-50 ring-1 transition-shadow hover:shadow-md hover:shadow-ink-950/5 ${tone.ring} ${
                    g.is_active ? "" : "opacity-65"
                  }`}
                >
                  {/* The rail. Red is compulsory, green is optional, grey is
                      switched off — the one fact worth reading first. */}
                  <span aria-hidden className={`w-1.5 shrink-0 ${tone.rail}`} />

                  <div className="min-w-0 flex-1 p-4">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          mealById={mealById}
          mealOptions={mealOptions}
          meals={meals}
          cards={cards}
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
    </section>
  );
}

/** A numbered section of the form. The order is not arbitrary — see below. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/[0.07]">
      <div className="flex items-baseline gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-xs font-black text-gold-400">
          {n}
        </span>
        <div className="min-w-0">
          <h4 className="font-display text-base font-black leading-none text-ink-950">
            {title}
          </h4>
          {hint && <p className="mt-1 text-xs text-ink-800/55">{hint}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
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
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const rule = ruleLabel({
    min: draft.required ? 1 : 0,
    max: Math.max(1, draft.maxSelect),
  });

  const priced = draft.options.map((o) => ({
    ...o,
    price: o.priceOverride ?? (o.mealId ? (mealById.get(o.mealId)?.price ?? 0) : 0),
  }));

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
          hint="Each one points at a dish — that is what makes it cost real money and take real stock."
        >
          <div className="flex flex-col gap-2">
            {draft.options.length === 0 && (
              <p className="rounded-xl bg-cream-50 px-3 py-3 text-xs text-ink-800/65 ring-1 ring-ink-950/10">
                Make hidden dishes like &ldquo;Extra rice&rdquo; or
                &ldquo;Coke&rdquo; first — with their own recipe and price —
                then choose them here.
              </p>
            )}

            {draft.options.map((o, at) => {
              const meal = o.mealId ? mealById.get(o.mealId) : null;
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
                        meal ? `${meal.price.toFixed(2)} (dish price)` : "Price"
                      }
                      aria-label="Price, or blank to use the dish's own"
                      className={`${field} min-w-0 sm:w-40 sm:shrink-0`}
                    />
                  </div>
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
                      label: "",
                      priceOverride: null,
                      maxQty: 1,
                    },
                  ],
                })
              }
              className="self-start rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50"
            >
              + Add an answer
            </button>

            <p className="text-[11px] leading-relaxed text-ink-800/50">
              Leave the price blank to charge whatever that dish costs — one
              price to keep up to date instead of two. Type <strong>0</strong>{" "}
              for a drink that comes free with the combo. <strong>Max</strong>{" "}
              is how many of that one answer a customer may take — leave it at
              1 for a plain tick, raise it for something like extra rice.
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
        <section className="overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-ink-950">
          <p className="flex items-center gap-2 px-4 pt-3 text-[10px] font-black uppercase tracking-widest text-cream-100/45">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade-400" />
            What the customer sees
          </p>
          <div className="m-3 mt-2 rounded-xl bg-cream-50 p-3">
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
                  <li
                    key={o.key}
                    className="flex items-center gap-3 rounded-lg px-1 py-1.5"
                  >
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
                      {o.price > 0 ? `+${peso(o.price)}` : "Free"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

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
