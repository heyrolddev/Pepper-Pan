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
  colourOf,
  inCategory,
  orderForMenu,
  type MenuCategory,
} from "@/lib/categories";

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
  onOpen,
}: {
  product: Product;
  index: number;
  staff: boolean;
  onOpen: () => void;
}) {
  const only = product.variants.length === 1 ? product.variants[0] : null;
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
    <motion.li
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ y: -6 }}
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
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-white text-left ring-1 ring-ink-950/[0.08] transition-shadow hover:shadow-xl hover:shadow-ink-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
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
          for, where an arrow only says that something happens. */}
      {product.variants.length > 1 && (
        <span className="absolute right-3 top-3 z-10 rounded-full bg-ink-950/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-cream-50 backdrop-blur">
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

      {/* Tighter on a phone. Two columns leaves about 160px of card, and at the
          old size one dish ran most of the screen — you scrolled a menu of 73
          items four at a time. The desktop sizes are unchanged. */}
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-4">
        <p className="line-clamp-2 font-display text-sm font-bold leading-tight text-ink-950 sm:text-base">
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
    </motion.li>
  );
}

export function MenuList({
  products,
  staff = false,
  known = [],
}: {
  products: Product[];
  staff?: boolean;
  /** The shop's categories and their colours. Empty is fine — see `colourOf`. */
  known?: MenuCategory[];
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

  // The same array that draws the pills also decides what leads the grid.
  //
  // Before this, "All" was whatever order the database handed back — `order
  // by name` — so a menu of Taiwanese street food opened on 1.5 Coke, 1.5
  // Sprite and a milktea, because those names start with digits. The food was
  // three rows down. The pills said one thing about what this shop sells and
  // the first screenful said another.
  const sorted = useMemo(() => orderForMenu(products, order), [products, order]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((p) => {
      const matchesCategory =
        activeCategory === "All" || inCategory(p, activeCategory);
      // The dishes behind the card are searchable too. Grouping four ji pai
      // under one name would otherwise make "spicy" find nothing, because the
      // only place that word still appears is on a variant.
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.variants.some(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            Object.values(v.options).some((o) => o.toLowerCase().includes(q))
        );
      return matchesCategory && matchesQuery;
    });
  }, [sorted, query, activeCategory]);

  return (
    <div className="flex flex-col gap-6">
      {/* The search box and the filters sit on one line from small screens up,
          rather than stacking. This bar is pinned under the header for the
          whole page, so every row it takes is a row of food nobody can see —
          and it stays that way the entire time they scroll. */}
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

          {categories.length > 2 && (
            <div className="flex flex-wrap gap-1">
              {categories.map((category) => {
                const active = activeCategory === category;
                // "All" keeps the brand red it always had — it isn't a
                // category and shouldn't borrow one's colour. Everything else
                // is painted in its own, which is the whole point: the eye
                // learns where Drinks is and stops reading the words.
                const tone = colourOf(category, colours);
                const dot = category === "All" ? "bg-brand-600" : tone.dot;
                return (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`relative rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                      active
                        ? category === "All"
                          ? "text-cream-50"
                          : tone.chip
                        : "text-ink-800 hover:text-brand-600"
                    }`}
                  >
                    {active && category === "All" && (
                      <motion.span
                        layoutId="menu-filter-pill"
                        className="absolute inset-0 rounded-full bg-brand-600"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {!active && category !== "All" && (
                        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
                      )}
                      {category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Two on a phone, three on a tablet, four from a laptop up — and four
          is the ceiling now. Five fitted, in the sense that the boxes did not
          overlap: in a 1152px container it left each card about 210px, which
          is not enough for "16oz Brown Sugar Milktea" and not enough for the
          photograph above it, so a menu of pictures became a menu of wrapped
          captions. Four gives roughly 270px. The gap opens with the cards
          rather than staying tight, or the extra width reads as drift. */}
      {filtered.length === 0 ? (
        <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
          No items match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => (
              <ProductCard
                key={product.id}
                product={product}
                index={i}
                staff={staff}
                onOpen={() => setOpen(product.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

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
