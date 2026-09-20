"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useCart } from "@/lib/cart-context";
import { Stars } from "@/components/stars";
import { LOW_STOCK_SERVINGS } from "@/lib/costing";
import { usePrefersReducedMotion } from "@/lib/reduced-motion";
import { useDialog } from "@/lib/dialog";
import {
  chipState,
  isSoldOut,
  openingSelection,
  pick,
  variantFor,
  type Product,
  type VariantOptions,
} from "@/lib/menu-products";
import {
  choiceProblem,
  extrasOf,
  extrasTotal,
  isFull,
  optionSoldOut,
  reconcile,
  toggleOption,
  type ModifierChoice,
  type ModifierGroup,
} from "@/lib/modifiers";

/**
 * The dish, opened.
 *
 * The menu is a grid of small squares — a photograph, a name, a price. That
 * is the right shape for choosing WHICH thing, and the wrong shape for
 * everything after: how big, how spicy, what is actually in it. So the card
 * became a door, and this is what is behind it.
 *
 * ── Why the photograph changes ───────────────────────────────────────────
 *
 * Because the thing being sold changes. A 22oz milktea is not a 16oz milktea
 * at a higher price, it is a different cup, and the owner has a photograph of
 * each. Tapping "22oz" and having the picture stay put is the moment a
 * customer stops believing the menu — and the shop had already taken the
 * photographs, they were just spread across four cards nobody could tell
 * apart.
 *
 * ── Why a chip can be grey for two different reasons ─────────────────────
 *
 * "Sold out" and "not available" look the same and mean opposite things. One
 * is come back tomorrow; the other is that combination was never offered, and
 * a customer who reads it as the first waits for something that is not
 * coming. They are told apart in `chipState` and they are labelled apart here.
 *
 * ── Variants above the line, add-ons below it ────────────────────────────
 *
 * The chips at the top answer "which dish is this" — one answer, and the
 * photograph and the price change with it. The panels under the line answer
 * "and what goes with it" — any number of answers, each adding to the price
 * without changing the dish. They look different on purpose: a customer who
 * reads "Extra rice" as a size will tap it expecting the price to replace
 * itself rather than grow.
 *
 * ── What it never does ───────────────────────────────────────────────────
 *
 * Hold a selection that has no dish behind it. Every tap resolves to a real
 * dish before it is shown — see `pick` — so the Add button is never pointing
 * at nothing, and there is no error state for a basket that cannot be filled.
 * The add-ons hold the same line: an option IS a dish, and `reconcile` throws
 * away any tick the dish on screen does not actually offer.
 */

export function ProductDialog({
  product,
  staff,
  onClose,
}: {
  product: Product;
  /** Staff cannot check out, so the button would fill a cart that refuses. */
  staff: boolean;
  onClose: () => void;
}) {
  const { addItem } = useCart();
  const still = usePrefersReducedMotion();
  // Escape, the scroll lock behind it and the focus trap, all from the one
  // place — see `useDialog`. Written by hand here first, which is exactly how
  // the sign-out dialog ended up being the only one without them.
  const { panel } = useDialog<HTMLDivElement>({ onClose });

  const [selection, setSelection] = useState<VariantOptions>(() =>
    openingSelection(product.variants)
  );
  const [ticked, setTicked] = useState<ModifierChoice>({});
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const chosen = useMemo(
    () => variantFor(product.variants, selection) ?? product.variants[0],
    [product.variants, selection]
  );
  const gone = isSoldOut(chosen);

  const groups = useMemo(() => chosen.groups ?? [], [chosen]);
  // Derived on every render rather than corrected in an effect. Changing the
  // size swaps the dish and can swap its add-ons with it; an effect would let
  // one frame go out — and one Add tap land — with the old dish's drink still
  // ticked and charged for.
  const choice = useMemo(() => reconcile(groups, ticked), [groups, ticked]);
  const extras = useMemo(() => extrasOf(groups, choice), [groups, choice]);
  const unanswered = choiceProblem(groups, choice);
  const unit = Number(chosen.price) + extrasTotal(extras);
  const low =
    !gone &&
    chosen.makeable !== null &&
    chosen.makeable !== undefined &&
    chosen.makeable <= LOW_STOCK_SERVINGS;

  function add() {
    if (gone || staff || unanswered) return;
    addItem(
      {
        mealId: chosen.id,
        name: chosen.name,
        price: Number(chosen.price),
        extras,
      },
      qty
    );
    setAdded(true);
    // Long enough to read, short enough that it is clearly about this tap.
    setTimeout(() => onClose(), 700);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: still ? 0 : 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <motion.div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        initial={still ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={still ? undefined : { y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-cream-50 outline-none sm:rounded-3xl"
      >
        <div className="grid sm:grid-cols-2">
          {/* ---- the photograph, which is the point ---- */}
          <div className="relative aspect-square w-full overflow-hidden bg-white sm:rounded-l-3xl">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                // Keyed on the picture, so changing size crossfades to the
                // picture of THAT size instead of holding the old one.
                key={chosen.image_url ?? chosen.id}
                initial={{ opacity: 0, scale: still ? 1 : 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: still ? 0 : 0.28 }}
                className="absolute inset-0"
              >
                {chosen.image_url ? (
                  <Image
                    src={chosen.image_url}
                    alt={chosen.name}
                    fill
                    sizes="(min-width: 640px) 45vw, 100vw"
                    className={`object-cover ${gone ? "opacity-45 saturate-50" : ""}`}
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center bg-cream-100 font-display text-6xl font-black text-ink-950/15">
                    {(product.name.match(/[a-zA-Z0-9]/)?.[0] ?? "?").toUpperCase()}
                  </span>
                )}
              </motion.div>
            </AnimatePresence>

            {gone && (
              <span className="absolute left-4 top-4 rounded-full bg-ink-950 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cream-50">
                Sold out
              </span>
            )}
            {low && (
              <span className="absolute left-4 top-4 rounded-full bg-gold-400 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-ink-950">
                Only {chosen.makeable} left
              </span>
            )}

            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-cream-50/90 text-lg font-black text-ink-950 shadow-lg backdrop-blur transition-colors hover:bg-cream-50"
            >
              ✕
            </button>
          </div>

          {/* ---- what it is, and how you want it ---- */}
          <div className="flex flex-col gap-4 p-6 sm:p-7">
            <div>
              <h2 className="font-display text-2xl font-black leading-tight text-ink-950 sm:text-3xl">
                {product.name}
              </h2>
              {product.avgRating != null && product.reviewCount > 0 && (
                <span className="mt-1.5 flex items-center gap-1.5">
                  <Stars rating={product.avgRating} />
                  <span className="text-xs font-semibold text-ink-800/55">
                    {product.avgRating.toFixed(1)} ({product.reviewCount})
                  </span>
                </span>
              )}
              {product.description && (
                <p className="mt-2 text-sm leading-relaxed text-ink-800/75">
                  {product.description}
                </p>
              )}
            </div>

            {product.axes.map((axis) => (
              <fieldset key={axis.name} className="min-w-0">
                <legend className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/45">
                  {axis.name}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {axis.values.map((value) => {
                    const state = chipState(
                      product.variants,
                      selection,
                      axis.name,
                      value
                    );
                    const on = selection[axis.name] === value;
                    const dead = state !== "ok" && !on;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={state === "unavailable"}
                        aria-pressed={on}
                        onClick={() =>
                          setSelection((s) =>
                            pick(product.variants, s, axis.name, value)
                          )
                        }
                        className={`rounded-xl border-2 px-4 py-2 text-sm font-bold transition-colors ${
                          on
                            ? "border-ink-950 bg-ink-950 text-cream-50"
                            : dead
                              ? "border-ink-950/10 bg-ink-950/[0.03] text-ink-800/35"
                              : "border-ink-950/15 bg-cream-100 text-ink-950 hover:border-brand-600"
                        }`}
                      >
                        {value}
                        {/* Said in words, not by being faint. The difference
                            between "gone today" and "never offered that way"
                            is the difference between waiting and choosing
                            something else. */}
                        {dead && (
                          <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide">
                            {state === "sold_out" ? "· sold out" : "· n/a"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {/* What is actually going in the basket. With four ji pai on one
                card, "Giant Jipai w/cheese (SPICY)" is the only line that
                confirms the taps landed where the customer meant. */}
            {product.axes.length > 0 && (
              <p className="text-xs font-semibold text-ink-800/45">{chosen.name}</p>
            )}

            {groups.map((group) => (
              <AddOnGroup
                key={group.id}
                group={group}
                chosen={choice[group.id] ?? []}
                full={isFull(group, choice)}
                onToggle={(optionId) =>
                  setTicked((t) => toggleOption(group, reconcile(groups, t), optionId))
                }
              />
            ))}

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 pt-4">
              <div>
                <p className="font-display text-3xl font-black text-brand-600">
                  ₱{unit.toFixed(2)}
                </p>
                {/* Shown as a sum, not as a single grown number. A customer
                    who sees ₱135 where the card said ₱120 checks the menu;
                    one who sees "₱120 + ₱15 add-ons" checks their own taps. */}
                {extras.length > 0 && (
                  <p className="text-xs font-semibold text-ink-800/50">
                    ₱{Number(chosen.price).toFixed(2)} + ₱
                    {extrasTotal(extras).toFixed(2)} add-ons
                  </p>
                )}
                {qty > 1 && (
                  <p className="text-xs font-semibold text-ink-800/50">
                    ₱{(unit * qty).toFixed(2)} for {qty}
                  </p>
                )}
              </div>

              {!staff && !gone && (
                <div className="flex items-center gap-2 rounded-full bg-ink-950/5 p-1">
                  <Step label="One fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    −
                  </Step>
                  <span className="w-6 text-center font-display text-lg font-black tabular-nums text-ink-950">
                    {qty}
                  </span>
                  <Step label="One more" onClick={() => setQty((q) => Math.min(99, q + 1))}>
                    +
                  </Step>
                </div>
              )}
            </div>

            {/* Staff and the owner have no cart — that rule predates this
                dialog, and the cart empties itself for them on load, so an
                Add button here would fill something that wipes itself.
                
                What was wrong was saying it with NOTHING. The controls simply
                did not render, which leaves a blank panel under the price and
                reads as a dish you cannot order — reported as exactly that.
                A missing button explains nothing; this says whose screen it
                is and where the till actually is. */}
            {staff ? (
              <p className="rounded-xl bg-ink-950/5 px-4 py-3 text-center text-xs font-semibold text-ink-800/60">
                You&apos;re signed in as staff, so there&apos;s no cart here —
                this is the customer&apos;s view of the menu.{" "}
                <Link
                  href="/admin/counter"
                  className="font-bold text-brand-600 underline underline-offset-2"
                >
                  Ring it up on the Counter
                </Link>
                .
              </p>
            ) : (
              <button
                onClick={add}
                disabled={gone || !!unanswered}
                className={`w-full rounded-full px-6 py-3.5 font-bold transition-colors ${
                  gone || unanswered
                    ? "cursor-not-allowed bg-ink-950/10 text-ink-800/40"
                    : added
                      ? "bg-jade-600 text-cream-50"
                      : "bg-ink-950 text-cream-50 hover:bg-brand-600"
                }`}
              >
                {gone
                  ? "Sold out"
                  : /* The button says what is missing rather than sitting
                       grey and silent — with three panels above it, "choose
                       your drink" is the only version of this a customer can
                       act on without hunting. */
                    (unanswered ??
                      (added
                        ? "Added ✓"
                        : `Add ${qty > 1 ? `${qty} ` : ""}to cart`))}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * One question, and the ways of answering it.
 *
 * Deliberately not the same shape as the variant chips above. Those are a
 * row of pills that replace one another; these are rows in a bordered panel
 * with a price on the right, because that is how every counter menu in the
 * country writes an add-on and because the money is the part being agreed to.
 *
 * "Required" and "up to 2" are said in words next to the heading. A checkbox
 * that silently refuses the third tick is a broken checkbox to the person
 * tapping it.
 */
function AddOnGroup({
  group,
  chosen,
  full,
  onToggle,
}: {
  group: ModifierGroup;
  chosen: string[];
  full: boolean;
  onToggle: (optionId: string) => void;
}) {
  const single = group.max === 1;
  const rule =
    group.min >= 1
      ? single
        ? "Required"
        : `Pick ${group.min}`
      : single
        ? "Optional"
        : `Up to ${group.max}`;

  return (
    <fieldset className="min-w-0 rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      <legend className="flex items-center gap-2 px-1">
        <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/60">
          {group.name}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
            group.min >= 1
              ? "bg-brand-600 text-cream-50"
              : "bg-ink-950/10 text-ink-800/60"
          }`}
        >
          {rule}
        </span>
      </legend>

      {group.helper && (
        <p className="mb-2 mt-1 text-xs text-ink-800/60">{group.helper}</p>
      )}

      <div className="mt-1 flex flex-col">
        {group.options.map((option) => {
          const on = chosen.includes(option.id);
          const out = optionSoldOut(option);
          // Full only blocks the ones not already ticked — otherwise the
          // customer cannot undo their own second choice.
          const blocked = out || (full && !on);

          return (
            <button
              key={option.id}
              type="button"
              role={single ? "radio" : "checkbox"}
              aria-checked={on}
              disabled={blocked}
              onClick={() => onToggle(option.id)}
              className={`flex items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${
                blocked
                  ? "cursor-not-allowed text-ink-800/35"
                  : "hover:bg-cream-50"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-5 w-5 shrink-0 place-items-center border-2 text-[11px] font-black ${
                  single ? "rounded-full" : "rounded-md"
                } ${
                  on
                    ? "border-ink-950 bg-ink-950 text-cream-50"
                    : "border-ink-950/25 bg-cream-50"
                }`}
              >
                {on ? "✓" : ""}
              </span>

              <span className="min-w-0 flex-1 text-sm font-bold leading-snug">
                {option.label}
                {out && (
                  <span className="ml-1.5 text-[10px] font-black uppercase tracking-wide">
                    · sold out
                  </span>
                )}
              </span>

              {/* Free is written as free. A blank space next to a ₱15 row
                  reads as a price that failed to load. */}
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink-800/70">
                {option.price > 0 ? `+₱${option.price.toFixed(2)}` : "Free"}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-full bg-cream-50 text-lg font-black text-ink-950 transition-colors hover:bg-cream-100"
    >
      {children}
    </button>
  );
}
