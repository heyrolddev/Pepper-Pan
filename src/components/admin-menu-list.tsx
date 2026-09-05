"use client";

import { useCallback } from "react";
import { AdminSearch } from "@/components/admin-search";
import { BulkCategory } from "@/components/bulk-category";
import { MealEditor, type AdminMeal } from "@/components/meal-editor";
import type { MenuCategory } from "@/lib/categories";

export function AdminMenuList({
  meals,
  categories,
}: {
  meals: AdminMeal[];
  categories: MenuCategory[];
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

  return (
    <div className="flex flex-col gap-4">
      {/* Above the list, because it is about the list as a whole and because
          it vanishes once the job is done. */}
      <BulkCategory meals={meals} categories={categories} />
      <AdminSearch
      rows={meals}
      searchText={searchText}
      noun="item"
      placeholder="Search menu by name, category, hidden…"
    >
      {(filtered, query) =>
        filtered.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            No menu items match &ldquo;{query}&rdquo;.
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
