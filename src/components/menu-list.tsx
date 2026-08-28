"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { useCart } from "@/lib/cart-context";

export type Meal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
  image_url: string | null;
};

function MealCard({ meal }: { meal: Meal }) {
  const { addItem } = useCart();

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col overflow-hidden rounded-xl border border-brand-200/60 bg-white/70 shadow-sm transition-shadow hover:shadow-lg dark:border-brand-800 dark:bg-brand-900/60"
    >
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-brand-200 to-brand-400 dark:from-brand-800 dark:to-brand-700">
        {meal.image_url ? (
          <Image
            src={meal.image_url}
            alt={meal.name}
            fill
            sizes="(min-width: 768px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-brand-50/90 dark:text-brand-50/80">
            {(meal.name.match(/[a-zA-Z0-9]/)?.[0] ?? meal.name.charAt(0)).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-medium text-brand-950 dark:text-brand-50">{meal.name}</p>
        {meal.description && (
          <p className="line-clamp-2 text-sm text-brand-800/70 dark:text-brand-100/60">
            {meal.description}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-semibold text-brand-900 dark:text-brand-100">
            ₱{Number(meal.price).toFixed(2)}
          </span>
          <button
            onClick={() =>
              addItem({ mealId: meal.id, name: meal.name, price: Number(meal.price) })
            }
            className="whitespace-nowrap rounded-full bg-brand-900 px-3 py-1.5 text-sm font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-gold-400 dark:text-brand-950 dark:hover:bg-gold-300"
          >
            Add
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
        !q || m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [meals, query, activeCategory]);

  const groups = useMemo(() => {
    const map = new Map<string, Meal[]>();
    for (const meal of filtered) {
      const category = meal.categories[0] || "Menu";
      if (!map.has(category)) map.set(category, []);
      map.get(category)!.push(meal);
    }
    return [...map.entries()];
  }, [filtered]);

  const showCategoryHeaders = activeCategory === "All" && groups.length > 1;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          className="w-full max-w-sm rounded-full border border-brand-300 bg-white px-4 py-2 text-sm dark:border-brand-800 dark:bg-brand-900"
        />
        {categories.length > 2 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeCategory === category
                    ? "bg-brand-600 text-white"
                    : "border border-brand-300 text-brand-800 hover:bg-brand-600/10 dark:border-brand-700 dark:text-brand-200"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-brand-800/70 dark:text-brand-100/60">
          No items match &ldquo;{query}&rdquo;.
        </p>
      )}

      {groups.map(([category, items]) => (
        <div key={category} className="flex flex-col gap-4">
          {showCategoryHeaders && (
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
              {category}
            </h2>
          )}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {items.map((meal) => (
              <MealCard key={meal.id} meal={meal} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
