"use client";

import { useCallback } from "react";
import { AdminSearch } from "@/components/admin-search";
import { MealEditor, type AdminMeal } from "@/components/meal-editor";

export function AdminMenuList({ meals }: { meals: AdminMeal[] }) {
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
                <MealEditor meal={meal} />
              </li>
            ))}
          </ul>
        )
      }
    </AdminSearch>
  );
}
