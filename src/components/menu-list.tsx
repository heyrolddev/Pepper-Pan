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

function MealCard({ meal, index }: { meal: Meal; index: number }) {
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
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-chili-400 to-brand-600">
        {meal.image_url ? (
          <Image
            src={meal.image_url}
            alt={meal.name}
            fill
            sizes="(min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <span className="grain absolute inset-0 grid place-items-center font-display text-5xl font-black text-cream-50/80">
            {initialOf(meal.name)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="font-display text-lg font-bold leading-tight text-ink-950">
          {meal.name}
        </p>
        {meal.avg_rating != null && (meal.review_count ?? 0) > 0 && (
          <span className="flex items-center gap-1.5">
            <Stars rating={meal.avg_rating} />
            <span className="text-xs font-semibold text-ink-800/55">
              {meal.avg_rating.toFixed(1)} ({meal.review_count})
            </span>
          </span>
        )}
        {meal.description && (
          <p className="line-clamp-2 text-sm text-ink-800/70">{meal.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-display text-xl font-black text-brand-600">
            ₱{Number(meal.price).toFixed(2)}
          </span>
          <button
            onClick={handleAdd}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all ${
              added
                ? "bg-jade-600 text-cream-50"
                : "bg-ink-950 text-cream-50 hover:bg-brand-600"
            }`}
          >
            {added ? "Added ✓" : "Add +"}
          </button>
        </div>
      </div>
    </motion.li>
  );
}

export function MenuList({ meals }: { meals: Meal[] }) {
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
    <div className="flex flex-col gap-8">
      {/* Sticky filter bar */}
      <div className="sticky top-[var(--nav-h)] z-30 -mx-6 flex flex-col gap-4 border-b border-ink-950/10 bg-cream-50 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the menu…"
            className="w-full max-w-xs rounded-full border-2 border-ink-950/15 bg-cream-100 px-5 py-2.5 text-sm font-medium text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600"
          />
          <span className="text-sm font-semibold text-ink-800/60">
            {filtered.length} item{filtered.length === 1 ? "" : "s"}
          </span>
        </div>

        {categories.length > 2 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
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

      {filtered.length === 0 ? (
        <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
          No items match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((meal, i) => (
              <MealCard key={meal.id} meal={meal} index={i} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
