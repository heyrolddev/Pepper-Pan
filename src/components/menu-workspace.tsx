"use client";

import { useState } from "react";
import { CategoryBar } from "@/components/category-bar";
import { AdminMenuList } from "@/components/admin-menu-list";
import type { AdminMeal } from "@/components/meal-editor";
import type { MenuCategory } from "@/lib/categories";

/**
 * The category bar and the dish list, sharing one idea of what is being
 * looked at.
 *
 * They were siblings under the page, which is why tapping a category could
 * only ever open its colour editor: the bar had no way to tell the list
 * anything. The state that belongs to both of them now lives in the one place
 * that contains both.
 *
 * Held in React rather than in the URL, and that is a decision rather than
 * laziness. `/admin/menu` is prerendered, and `useSearchParams` in a
 * prerendered tree needs a Suspense boundary or the build refuses it — so the
 * URL version costs a wrapper anyway, and buys a back button on a filter that
 * takes one tap to undo. What it must survive is `router.refresh()`, which
 * runs after every dish edit: client state does, because the component is
 * re-rendered rather than remounted, so the owner filters to Drinks, fixes
 * four prices, and is still looking at Drinks.
 */
export function MenuWorkspace({
  meals,
  categories,
  counts,
}: {
  meals: AdminMeal[];
  categories: MenuCategory[];
  counts: Record<string, number>;
}) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <CategoryBar
        categories={categories}
        counts={counts}
        active={active}
        onFilter={setActive}
      />
      <AdminMenuList
        meals={meals}
        categories={categories}
        activeCategory={active}
        onClearCategory={() => setActive(null)}
      />
    </div>
  );
}
