"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Stars } from "@/components/stars";
import { LOW_STOCK_SERVINGS } from "@/lib/costing";
import { ProductDialog } from "@/components/product-dialog";
import type { Product } from "@/lib/menu-products";
import {
  categoriesUsed,
  cardTone,
  colourOf,
  paletteFor,
  type CategoryTone,
  inCategory,
  orderForMenu,
  type MenuCategory,
} from "@/lib/categories";
import { isComplete, macroSplit, round } from "@/lib/nutrition";

/**
 * The card is a door now.
 *
 * It used to be the whole transaction: a photograph, a price and an Add
 * button, which works right up until the dish comes in two sizes. Then the
 * menu grows a second card with the same photograph, and a third and a fourth
 * for spicy and cheese, and a customer scrolling it reads a menu with
 * duplicates in it rather than a shop with choices.
 *
 * So a card is one THING now, and tapping it opens the ways of having it —
 * see product-dialog.tsx. The grouping is the owner's, in the Menu tab; a
 * dish nobody has grouped is a group of one, which is what lets every card
 * open from the day this ships rather than only the handful that were tidied
 * up first.
 *
 * Add opens that door too, rather than dropping one straight in the basket.
 *
 * It used to add directly whenever there was nothing to choose, on the
 * reasoning that opening a dialog to buy one bowl of noodles is a tap charged
 * for nothing. That reasoning only holds for ONE bowl. Somebody ordering four
 * had to tap four times and watch the same card flash "Added ✓" four times
 * with no running count anywhere near it, where the dialog has a stepper and
 * asks once. The shop's own owner put it plainly: it is easier for a customer
 * who is ordering a lot.
 *
 * So every card behaves the same way now, which is worth something on its
 * own — a grid where some buttons add and others open is a grid where you
 * find out which by pressing it.
 */

function initialOf(name: string) {
  return (name.match(/[a-zA-Z0-9]/)?.[0] ?? name.charAt(0)).toUpperCase();
}

function ProductCard({
  product,
  index,
  staff,
  palette,
  showNutrition,
  onOpen,
}: {
  product: Product;
  index: number;
  staff: boolean;
  palette: Map<string, CategoryTone>;
  showNutrition: boolean;
  onOpen: () => void;
}) {
  const only = product.variants.length === 1 ? product.variants[0] : null;
  /**
   * The card's colour, or none.
   *
   * One category paints the card; two or more leave it cream. The tint is
   * deliberately slight and the rail under the photo carries the actual
   * signal — seventy-three cards at full strength is a colour chart, not a
   * menu, and the food in the photographs is the thing meant to be bright.
   */
  const tone = cardTone(product.categories, palette);
  const facts =
    showNutrition && isComplete(product.nutrition) ? round(product.nutrition!.per) : null;
  const split = facts ? macroSplit(facts) : null;
  const soldOut = product.soldOut;
  // Only ever shown for a card with one dish behind it. "Only 2 left" over a
  // group is a promise about which of four things, and the card cannot say
  // which — the dialog can, so that is where it is said.
  const low =
    only != null &&
    !soldOut &&
    only.makeable !== null &&
    only.makeable !== undefined &&
    only.makeable <= LOW_STOCK_SERVINGS;


  return (
    /**
     * A plain `li` with a CSS entrance, where this was a motion component
     * with `layout`, an exit animation and a `whileHover`.
     *
     * Seventy-two dishes meant seventy-two spring simulations on the page at
     * once, and `layout` inside an `AnimatePresence` meant every tap on a
     * category filter measured every card's box before and after and animated
     * the difference. That is the most expensive possible way to fade a
     * photograph in, and it is paid on the one interaction the menu exists
     * for.
     *
     * The stagger is an `animation-delay`, capped so the ninth card onwards
     * all arrive together — a customer should never be waiting on a queue of
     * animations to see the food.
     */
    <li
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      // `relative` matters: the sold-out badge is absolutely positioned, and
      // without a positioned ancestor it escapes to the top-left of the page
      // — which it did, landing on the logo. It only looked right on some
      // cards because framer-motion's transform creates a containing block
      // while the entrance animation runs, and drops it when the animation
      // settles.
      onClick={onOpen}
      // A real button, not a div with a click handler: this is now the main
      // way into a dish, so it has to be reachable by tab and by Enter.
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${product.name} — see details`}
      // The lift is a CSS transform now: composited, off the main thread, and
      // indistinguishable from the spring it replaces.
      className="card-in group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-white text-left ring-1 ring-ink-950/[0.08] transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-ink-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {/* Square, to match how the food is actually photographed: a round dish
          shot from above fills a square and gets trimmed by anything else. The
          card was 4:3, which cut the top and bottom off every photo. */}
      {soldOut && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-ink-950 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cream-50">
          Sold out
        </span>
      )}
      {low && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-gold-400 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-ink-950">
          Only {only!.makeable} left
        </span>
      )}
      {/* The one thing on the card that says there is more behind it. A count
          rather than a chevron: "2 sizes" tells a customer what the tap is
          for, where an arrow only says that something happens.

          Green, because it is the only badge on the card that is GOOD NEWS.
          It was a translucent black, which is what "Sold out" is — two
          opposite messages in one colour, on cards that carry both, so the
          eye had to read every badge to sort them. Now the grid answers at a
          glance: black is gone, yellow is nearly gone, green is a choice.

          Jade rather than the gold used for "Only 2 left": that one is also
          on these cards, on the opposite corner, and a second yellow badge
          would be a warning-coloured thing that is not a warning.

          Except on a sold-out card, where it goes quiet. "2 FLAVOURS" in
          bright green above a dish nobody can buy today reads as an offer,
          and the card underneath has already faded to say otherwise. */}
      {product.variants.length > 1 && (
        <span
          className={`absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide backdrop-blur ${
            soldOut
              ? "bg-ink-950/45 text-cream-50/80"
              : "bg-jade-600 text-cream-50 ring-1 ring-jade-700/40"
          }`}
        >
          {product.axes.length === 1
            ? `${product.axes[0].values.length} ${product.axes[0].name.toLowerCase()}s`
            : `${product.variants.length} ways`}
        </span>
      )}

      {/* White, and so is the card. A photo set to `object-cover` fills its
          square exactly, so recolouring only the space *behind* it would have
          changed nothing visible — what actually reads as the picture's
          background is the card around it, which was warm cream sitting on a
          red-orange wash. White lets the food carry the colour instead. */}
      <div
        className={`relative aspect-square w-full overflow-hidden bg-white ${
          soldOut ? "opacity-45 saturate-50" : ""
        }`}
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            // Cards are smaller on a laptop now, so the browser can be asked
            // for less: a stale `sizes` downloads a 360px image for a 220px
            // slot on every card of a 73-dish menu.
            sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          // A dish with no photo yet. Quiet rather than the old saturated
          // gradient: it's a gap, not a feature, and seventy-three of them
          // was a wall of orange with the actual food nowhere in it.
          <span className="absolute inset-0 grid place-items-center bg-cream-100 font-display text-5xl font-black text-ink-950/15">
            {initialOf(product.name)}
          </span>
        )}
      </div>

      {/* The rail is where the colour coding actually lives. A full-strength
          card seventy-three times over is a colour chart; four pixels under
          the photo is legible down a scrolling grid and leaves the food the
          brightest thing on the card. A dish in two categories has no single
          answer, so it gets no rail — that gap is information too. */}
      {tone && <div className={`h-1 w-full shrink-0 ${tone.dot}`} aria-hidden />}

      {/* Tighter on a phone. Two columns leaves about 160px of card, and at the
          old size one dish ran most of the screen — you scrolled a menu of 73
          items four at a time. The desktop sizes are unchanged. */}
      <div
        className={`flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4 ${
          tone ? tone.soft : ""
        }`}
      >
        <p className="line-clamp-2 font-display text-sm font-bold leading-tight text-ink-950 sm:text-base">
          {/* The code leads the name, the way a counter says it. Only on a
              card with one dish behind it: four ji pai have four codes, and
              printing the first would send somebody to the till saying "C1"
              for a dish that is C3. */}
          {product.code && (
            <span
              className={`mr-1.5 inline-block rounded-md px-1.5 py-0.5 align-middle text-[11px] font-black tabular-nums tracking-wide ${
                tone ? tone.chip : "bg-ink-950 text-cream-50"
              }`}
            >
              {product.code}
            </span>
          )}
          {product.name}
        </p>
        {product.avgRating != null && product.reviewCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Stars rating={product.avgRating} />
            <span className="text-[11px] font-semibold text-ink-800/55 sm:text-xs">
              {product.avgRating.toFixed(1)} ({product.reviewCount})
            </span>
          </span>
        )}
        {/* Shown at every size now. A name alone tells a first-time customer
            nothing about what "Ji Pai" or "XLB" actually is, which is the one
            thing a menu has to do. Clamped to two lines so a long description
            can't push the price off the bottom of the card. */}
        {product.description && (
          <p className="line-clamp-2 text-xs leading-snug text-ink-800/70 sm:text-[13px]">
            {product.description}
          </p>
        )}
        {/* Wraps rather than squeezing. Two columns on a phone leaves about
            120px of card, and a peso price beside a button doesn't fit that —
            they were overlapping, with the button sitting on the price. */}
        {/* Only ever a complete figure. A dish whose recipe is half filled in
            has a sum, and that sum is smaller than the truth — see
            `isComplete`. Somebody counting calories would be handed a number
            that is confidently too low and looks exactly like a right one. */}
        {facts && split && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-black tabular-nums text-ink-900 sm:text-xs">
                {facts.kcal.toLocaleString("en-PH")}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-ink-800/45">
                kcal
              </span>
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-ink-800/50">
                {facts.protein}P · {facts.carbs}C · {facts.fat}F
              </span>
            </div>
            {/* Three segments that always fill the bar exactly — the split is
                computed from the macros' own energy, so a rounded label can
                never leave a gap. Colours are fixed across every dish: the
                bar is only readable if protein is the same colour on all of
                them, so it does NOT take the category's. */}
            <span
              className="flex h-1 w-full overflow-hidden rounded-full bg-ink-950/10"
              role="img"
              aria-label={`${facts.protein} grams protein, ${facts.carbs} carbs, ${facts.fat} fat`}
            >
              <span className="bg-ocean-600" style={{ width: `${split.protein}%` }} />
              <span className="bg-gold-400" style={{ width: `${split.carbs}%` }} />
              <span className="bg-chili-500" style={{ width: `${split.fat}%` }} />
            </span>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-2 sm:gap-2 sm:pt-3">
          <span className="font-display text-base font-black text-brand-600 sm:text-lg">
            {/* "from" only when the ways of having it cost different money.
                Four ji pai at two prices is a range; two sizes of the same
                price is not, and printing "from" over a single figure reads
                as a charge waiting to appear at the till. */}
            {product.priceFrom !== product.priceTo && (
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-ink-800/50 sm:text-xs">
                from
              </span>
            )}
            ₱{Number(product.priceFrom).toFixed(2)}
          </span>
          {/* Nothing to add to: staff can't check out, so the button would
              only fill a cart that leads to a refusal. */}
          {!staff && (
            <button
              // `stopPropagation` is still needed even though both the card
              // and the button now open the same dialog: without it the click
              // runs twice, and the second one lands on a card that is
              // already behind an overlay.
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              disabled={soldOut}
              // Says what it does, not what it opens. "Add +" is the outcome
              // the customer is after and the dialog is one step on the way;
              // labelling it "Choose" or "See" would describe the software's
              // route rather than their errand.
              aria-label={`Add ${product.name} — opens the dish`}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all sm:px-4 sm:py-2 sm:text-sm ${
                soldOut
                  ? "cursor-not-allowed bg-ink-950/10 text-ink-800/40"
                  : "bg-ink-950 text-cream-50 hover:bg-brand-600"
              }`}
            >
              {soldOut ? "Sold out" : "Add +"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * One category, wherever it is being offered.
 *
 * Two shapes, one component, because they are the same control and the day
 * they drift is the day the phone and the laptop disagree about what colour
 * Drinks is. `stacked` is the sidebar: full width, the count pushed to the
 * far edge where a column of numbers lines up and can be read down.
 *
 * The count is new, and it is the reason the sidebar is worth having. It is
 * measured against what the SEARCH left, so it answers the only question
 * worth asking of a filter — how much is behind this — rather than how much
 * the shop sells in total. A category the current search has emptied fades
 * instead of vanishing: a list that reshuffles itself as you type is a list
 * you cannot aim at.
 */
function CategoryPill({
  name,
  count,
  active,
  colours,
  onPick,
  stacked = false,
}: {
  name: string;
  count: number;
  active: boolean;
  colours: Map<string, string>;
  onPick: () => void;
  stacked?: boolean;
}) {
  // "All" keeps the brand red it always had — it isn't a category and
  // shouldn't borrow one's colour. Everything else is painted in its own,
  // which is the whole point: the eye learns where Drinks is and stops
  // reading the words.
  const isAll = name === "All";
  const tone = colourOf(name, colours);
  const empty = count === 0 && !active;

  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      title={active ? `Showing ${name}` : `Show only ${name}`}
      className={`relative whitespace-nowrap rounded-full text-sm font-bold transition-colors ${
        stacked ? "flex w-full items-center gap-2 px-3.5 py-2" : "px-3.5 py-1.5"
      } ${
        active
          ? isAll
            ? "text-cream-50"
            : tone.chip
          : empty
            ? "text-ink-800/30"
            : "text-ink-800 hover:bg-ink-950/5 hover:text-brand-600"
      }`}
    >
      {active && isAll && (
        <motion.span
          // Shared between the two layouts on purpose: at the one width where
          // both could exist the id would be claimed twice and the pill would
          // fly across the screen. Only one is ever rendered — the other side
          // is `hidden` / `lg:hidden` — so there is nothing to fight over.
          layoutId={stacked ? "menu-filter-rail" : "menu-filter-pill"}
          className="absolute inset-0 rounded-full bg-brand-600"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span
        className={`relative z-10 flex items-center gap-1.5 ${
          stacked ? "w-full" : ""
        }`}
      >
        {!active && !isAll && (
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${
              empty ? "opacity-40" : ""
            }`}
          />
        )}
        {/* Reserving the dot's space in the sidebar keeps every name on the
            same left edge whether it is selected or not — without it the
            whole column shifted 14px sideways on every tap. */}
        {stacked && (active || isAll) && (
          <span aria-hidden className="h-2 w-2 shrink-0" />
        )}
        <span className={stacked ? "truncate" : ""}>{name}</span>
        {stacked && (
          <span className="ml-auto shrink-0 pl-2 text-xs font-black tabular-nums opacity-55">
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

export function MenuList({
  products,
  staff = false,
  known = [],
  showNutrition = false,
}: {
  products: Product[];
  staff?: boolean;
  /** The shop's categories and their colours. Empty is fine — see `colourOf`. */
  known?: MenuCategory[];
  /** The owner's switch. Off until the ingredients are filled in. */
  showNutrition?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const colours = useMemo(
    () => new Map(known.map((c) => [c.name, c.colour])),
    [known]
  );

  // The dishes decide which pills exist; `known` only decides their order.
  // See `categoriesUsed` — this was written inline here first, which is
  // exactly why the same bug survived in two other screens.
  const order = useMemo(() => categoriesUsed(products, known), [products, known]);
  const categories = useMemo(() => ["All", ...order], [order]);

  /**
   * One colour per category, none of them repeated.
   *
   * Worked out from the whole list at once rather than one name at a time —
   * `colourOf` cannot tell whether the colour it is about to hand out is
   * already on another category, which is how two of them ended up the same.
   * The pills keep using `colourOf`; the CARDS use this, because a repeat on
   * a pill is a nuisance and a repeat across a grid of cards is a colour code
   * that means nothing.
   */
  const palette = useMemo(() => paletteFor(order, colours), [order, colours]);

  // One category plus "All" is not a filter, it is a label — and a sidebar
  // holding a single choice is a column of whitespace charged to the food.
  const hasFilters = categories.length > 2;

  // The same array that draws the pills also decides what leads the grid.
  //
  // Before this, "All" was whatever order the database handed back — `order
  // by name` — so a menu of Taiwanese street food opened on 1.5 Coke, 1.5
  // Sprite and a milktea, because those names start with digits. The food was
  // three rows down. The pills said one thing about what this shop sells and
  // the first screenful said another.
  const sorted = useMemo(() => orderForMenu(products, order), [products, order]);

  /**
   * The search, applied on its own — before the category is.
   *
   * Two steps rather than one because the category list wants to carry a
   * count, and the only useful count is "how many you would see if you tapped
   * this". That has to be measured against everything the search left, not
   * against everything on the menu: searching "spicy" and then reading
   * "Drinks 6" sends the customer to an empty grid.
   */
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        // The dishes behind the card are searchable too. Grouping four ji pai
        // under one name would otherwise make "spicy" find nothing, because
        // the only place that word still appears is on a variant.
        p.variants.some(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            Object.values(v.options).some((o) => o.toLowerCase().includes(q))
        )
    );
  }, [sorted, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { All: found.length };
    for (const name of order) {
      out[name] = found.filter((p) => inCategory(p, name)).length;
    }
    return out;
  }, [found, order]);

  const filtered = useMemo(
    () =>
      activeCategory === "All"
        ? found
        : found.filter((p) => inCategory(p, activeCategory)),
    [found, activeCategory]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* The search box and the filters sit on one line from small screens up,
          rather than stacking. This bar is pinned under the header for the
          whole page, so every row it takes is a row of food nobody can see —
          and it stays that way the entire time they scroll.

          From `lg` up the categories leave it for the sidebar below, and only
          the search and the count stay. */}
      <div className="sticky top-[var(--nav-h)] z-30 -mx-6 border-b border-ink-950/10 bg-cream-50 px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:flex-none">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu…"
              className="w-full min-w-0 rounded-full border-2 border-ink-950/15 bg-cream-100 px-4 py-2 text-sm font-medium text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600 sm:w-52"
            />
            <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-ink-800/50">
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Scrolls sideways rather than wrapping to a second row. Wrapped,
              a shop with eight categories pushed the first row of food off a
              phone screen — which is the problem the sidebar solves on a
              laptop and this solves here. */}
          {hasFilters && (
            <div className="-mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max gap-1">
                {categories.map((category) => (
                  <CategoryPill
                    key={category}
                    name={category}
                    count={counts[category] ?? 0}
                    active={activeCategory === category}
                    colours={colours}
                    onPick={() => setActiveCategory(category)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── the sidebar, and the food ──────────────────────────────────
          The categories move to the side from `lg` up, and stay a row of
          pills below it. Not one control at two widths for the sake of it:
          they are genuinely different problems. A phone has no width to give
          away, so the filters have to sit in the one line already reserved
          for them. A laptop has width nobody is using — the grid stops at
          1152px and the rest is margin — and a vertical list is where a
          column of names is easiest to read, which is what the owner said:
          mas madali i-navigate pag side.

          Both are drawn by the same `CategoryPill`, so there is one place
          that decides what a category looks like, one that decides the
          colour, and no way for the two to start disagreeing. */}
      <div className={hasFilters ? "lg:grid lg:grid-cols-[13rem_1fr] lg:gap-7" : ""}>
        {hasFilters && (
          <nav
            aria-label="Menu categories"
            // Sticks below the search bar, which is itself sticky under the
            // header — so the nav offset is both of them, and the max-height
            // is what is left, or a shop with twenty categories gets a list
            // that scrolls off the bottom with no way back to it.
            className="hidden self-start lg:sticky lg:top-[calc(var(--nav-h)+4rem)] lg:block lg:max-h-[calc(100vh-var(--nav-h)-6rem)] lg:overflow-y-auto"
          >
            <ul className="flex flex-col gap-0.5 pb-2">
              {categories.map((category) => (
                <li key={category}>
                  <CategoryPill
                    name={category}
                    count={counts[category] ?? 0}
                    active={activeCategory === category}
                    colours={colours}
                    onPick={() => setActiveCategory(category)}
                    stacked
                  />
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Two on a phone, three on a tablet, and three beside the sidebar.
            Four was the laptop ceiling before, at roughly 270px a card; with
            13rem gone to the sidebar, four would leave about 215px — below
            the width where "16oz Brown Sugar Milktea" stops wrapping into a
            caption, which is the exact failure five columns had. Three gives
            about 290px, so the cards come out slightly LARGER than they were
            rather than the sidebar costing the food anything. */}
        {filtered.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
            {query.trim()
              ? `No items match “${query}”${
                  activeCategory === "All" ? "" : ` in ${activeCategory}`
                }.`
              : `Nothing in ${activeCategory} right now.`}
          </p>
        ) : (
          <ul
            className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:gap-5 ${
              hasFilters ? "" : "lg:grid-cols-4"
            }`}
          >
            {/* No AnimatePresence. An exit animation on a filtered grid is
                what forces the expensive layout path — and nobody has ever
                needed to watch the dishes they filtered OUT leave. */}
            {filtered.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                index={i}
                staff={staff}
                palette={palette}
                showNutrition={showNutrition}
                onOpen={() => setOpen(product.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Mounted here rather than inside the card: a dialog rendered inside a
          grid item inherits the grid's stacking context, and a card two rows
          down puts the overlay behind the sticky filter bar. */}
      <AnimatePresence>
        {open && (
          <ProductDialog
            key={open}
            product={products.find((p) => p.id === open)!}
            staff={staff}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
