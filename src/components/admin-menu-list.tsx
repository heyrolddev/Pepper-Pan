"use client";

import { useCallback, useMemo } from "react";
import { AdminSearch } from "@/components/admin-search";
import { BulkCategory } from "@/components/bulk-category";
import { MealEditor, type AdminMeal } from "@/components/meal-editor";
import type { MenuCategory } from "@/lib/categories";

export function AdminMenuList({
  meals,
  categories,
  activeCategory = null,
  onClearCategory,
}: {
  meals: AdminMeal[];
  categories: MenuCategory[];
  /** Set by the category bar above. Null shows everything. */
  activeCategory?: string | null;
  onClearCategory?: () => void;
}) {
  const searchText = useCallback(
    (m: AdminMeal) =>
      [
        m.name,
        m.description,
        ...(m.categories ?? []),
        // So "hidden" / "unavailable" find exactly the items needing attention.
        m.is_public ? "shown" : "hidden",
        m.is_available ? "available" : "unavailable soldout",
      ]
        .filter(Boolean)
        .join(" "),
    []
  );

  // Matched against every category a dish carries, not just its first — the
  // same rule the customer's menu uses. A back-office screen that disagrees
  // with the customer's about what is in Drinks is worse than no filter,
  // because the owner then fixes the wrong thing.
  const shown = useMemo(() => {
    const list = activeCategory
      ? meals.filter((m) =>
          (m.categories ?? []).some((c) => c.trim() === activeCategory)
        )
      : meals;

    /**
     * Hidden dishes go last, always — browsing and searching alike.
     *
     * The menu is read to answer "what are customers seeing", and a hidden
     * dish is not part of that answer. Mixed through the list they are rows
     * the eye has to recognise and reject one at a time; at the bottom they
     * are a group, still findable by typing "hidden", and out of the way of
     * the job.
     *
     * Sold out sits between the two. It IS on the menu — the customer sees it
     * greyed out, and it is the thing most likely to want turning back on.
     */
    const rank = (m: AdminMeal) => (!m.is_public ? 2 : !m.is_available ? 1 : 0);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [meals, activeCategory]);

  return (
    <div className="flex flex-col gap-4">
      {/* Above the list, because it is about the list as a whole and because
          it vanishes once the job is done. Reads the FULL menu rather than the
          filtered view on purpose: a filter on Drinks must not hide the
          untagged dishes this panel exists to find. */}
      <BulkCategory meals={meals} categories={categories} />

      {activeCategory && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink-950/5 px-4 py-2.5">
          <p className="text-sm font-bold text-ink-950">
            Showing {shown.length} dish{shown.length === 1 ? "" : "es"} in{" "}
            {activeCategory}
          </p>
          {/* A way out that doesn't need the chip found again — by now it may
              be off the top of the screen. */}
          <button
            onClick={onClearCategory}
            className="rounded-full bg-cream-50 px-3 py-1 text-xs font-bold text-ink-800/70 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
          >
            Show all {meals.length}
          </button>
        </div>
      )}

      <AdminSearch
        rows={shown}
        searchText={searchText}
        noun="item"
        placeholder="Search menu by name, category, hidden…"
      >
        {(filtered, query) =>
          filtered.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              No menu items match &ldquo;{query}&rdquo;
              {activeCategory ? ` in ${activeCategory}` : ""}.
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {filtered.map((meal) => (
                <li key={meal.id}>
                  <MealEditor meal={meal} categories={categories} />
                </li>
              ))}
            </ul>
          )
        }
      </AdminSearch>
    </div>
  );
}
