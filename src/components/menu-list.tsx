"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useCart } from "@/lib/cart-context";
import { Stars } from "@/components/stars";

export type Meal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
  image_url: string | null;
  avg_rating?: number | null;
  review_count?: number;
};

function initialOf(name: string) {
  return (name.match(/[a-zA-Z0-9]/)?.[0] ?? name.charAt(0)).toUpperCase();
}

function MealCard({
  meal,
  index,
  staff,
}: {
  meal: Meal;
  index: number;
  staff: boolean;
}) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addItem({ mealId: meal.id, name: meal.name, price: Number(meal.price) });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ y: -6 }}
      className="group flex flex-col overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10 transition-shadow hover:shadow-xl hover:shadow-ink-950/10"
    >
      {/* Square, to match how the food is actually photographed: a round dish
          shot from above fills a square and gets trimmed by anything else. The
          card was 4:3, which cut the top and bottom off every photo. */}
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-chili-400 to-brand-600">
        {meal.image_url ? (
          <Image
            src={meal.image_url}
            alt={meal.name}
            fill
            sizes="(min-width: 1200px) 360px, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="grain absolute inset-0 grid place-items-center font-display text-5xl font-black text-cream-50/80">
            {initialOf(meal.name)}
          </span>
        )}
      </div>

      {/* Tighter on a phone. Two columns leaves about 160px of card, and at the
          old size one dish ran most of the screen — you scrolled a menu of 73
          items four at a time. The desktop sizes are unchanged. */}
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:gap-2 sm:p-5">
        <p className="line-clamp-2 font-display text-sm font-bold leading-tight text-ink-950 sm:text-lg">
          {meal.name}
        </p>
        {meal.avg_rating != null && (meal.review_count ?? 0) > 0 && (
          <span className="flex items-center gap-1.5">
            <Stars rating={meal.avg_rating} />
            <span className="text-[11px] font-semibold text-ink-800/55 sm:text-xs">
              {meal.avg_rating.toFixed(1)} ({meal.review_count})
            </span>
          </span>
        )}
        {meal.description && (
          <p className="line-clamp-2 hidden text-sm text-ink-800/70 sm:block">{meal.description}</p>
        )}
        {/* Wraps rather than squeezing. Two columns on a phone leaves about
            120px of card, and a peso price beside a button doesn't fit that —
            they were overlapping, with the button sitting on the price. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-2 sm:gap-2 sm:pt-3">
          <span className="font-display text-base font-black text-brand-600 sm:text-xl">
            ₱{Number(meal.price).toFixed(2)}
          </span>
          {/* Nothing to add to: staff can't check out, so the button would
              only fill a cart that leads to a refusal. */}
          {!staff && (
            <button
              onClick={handleAdd}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-all sm:px-4 sm:py-2 sm:text-sm ${
                added
                  ? "bg-jade-600 text-cream-50"
                  : "bg-ink-950 text-cream-50 hover:bg-brand-600"
              }`}
            >
              {added ? "Added ✓" : "Add +"}
            </button>
          )}
        </div>
      </div>
    </motion.li>
  );
}

export function MenuList({ meals, staff = false }: { meals: Meal[]; staff?: boolean }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const meal of meals) set.add(meal.categories[0] || "Menu");
    return ["All", ...set];
  }, [meals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return meals.filter((m) => {
      const category = m.categories[0] || "Menu";
      const matchesCategory = activeCategory === "All" || category === activeCategory;
      const matchesQuery =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.description ?? "").toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [meals, query, activeCategory]);

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
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`relative rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    activeCategory === category
                      ? "text-cream-50"
                      : "text-ink-800 hover:text-brand-600"
                  }`}
                >
                  {activeCategory === category && (
                    <motion.span
                      layoutId="menu-filter-pill"
                      className="absolute inset-0 rounded-full bg-brand-600"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
          No items match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((meal, i) => (
              <MealCard key={meal.id} meal={meal} index={i} staff={staff} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
