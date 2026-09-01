import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import type { AdminMeal } from "@/components/meal-editor";
import { AdminMenuList } from "@/components/admin-menu-list";
import { MenuAvailability } from "@/components/menu-availability";
import { NewMealForm } from "@/components/new-meal-form";
import { CategoryBar } from "@/components/category-bar";
import { categoryOf, type MenuCategory } from "@/lib/categories";

export default async function AdminMenuPage() {
  const viewer = await getViewer();
  const canEdit = can(viewer, "menu.edit");
  // The sidebar already hides this row from anyone who can't at least mark a
  // dish sold out. Checked again here because hiding a link is not a
  // permission — a bookmark reaches the page all the same.
  if (!can(viewer, "menu.availability")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className="font-display text-2xl font-black text-ink-950">
          Not your screen
        </h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          The menu is set by the owner. If something has run out, tell whoever
          is running the shift — they can mark it sold out.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data, error }, { data: catRows }] = await Promise.all([
    supabase
      .from("meals")
      .select("id, name, price, description, categories, image_url, is_public, is_available")
      .order("name"),
    // The shop's own vocabulary. Ordered the way the customer's menu orders
    // its filter pills, so the owner sets that order here and sees it there.
    supabase
      .from("menu_categories")
      .select("name, colour, sort_order")
      .order("sort_order")
      .order("name"),
  ]);

  const meals = (data ?? []) as AdminMeal[];
  const categories = (catRows ?? []) as MenuCategory[];

  // How many dishes are in each, so deleting one can say what's in the way.
  const counts: Record<string, number> = {};
  for (const m of meals) {
    const c = categoryOf(m.categories);
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const hidden = meals.filter((m) => !m.is_public || !m.is_available).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black text-ink-950">
            Menu ({meals.length})
          </h2>
          <p className="mt-1 text-sm text-ink-800/60">
            {canEdit
              ? `${hidden} item${hidden === 1 ? "" : "s"} hidden from customers`
              : "Mark a dish sold out when it runs out. Prices and photos are the owner's."}
          </p>
        </div>
        {canEdit && <NewMealForm categories={categories} />}
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          Could not load the menu: {error.message}
        </p>
      )}

      {canEdit && <CategoryBar categories={categories} counts={counts} />}

      {canEdit ? (
        <AdminMenuList meals={meals} categories={categories} />
      ) : (
        // Prices stripped on the server, not just left unrendered. Props to a
        // client component are serialised into the page, so a price that is
        // merely not displayed is still a price sitting in the HTML.
        <MenuAvailability
          meals={meals.map((m) => ({ ...m, price: 0, description: null }))}
        />
      )}
    </div>
  );
}
