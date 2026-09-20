import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import type { AdminMeal } from "@/components/meal-editor";
import { MenuWorkspace } from "@/components/menu-workspace";
import { MenuAvailability } from "@/components/menu-availability";
import { NewMealForm } from "@/components/new-meal-form";
import { TakeoutMergePanel } from "@/components/takeout-merge-panel";
import { TakeoutPurgePanel } from "@/components/takeout-purge-panel";
import { planTakeoutPurge } from "@/lib/takeout-purge";
import { ProductGroups, type GroupRow } from "@/components/product-groups";
import { normalizeOptions } from "@/lib/menu-products";
import { planTakeoutMerge } from "@/lib/takeout-merge";
import { countByCategory, type MenuCategory } from "@/lib/categories";
import { hqTitle } from "@/lib/hq-theme";

export default async function AdminMenuPage() {
  const viewer = await getViewer();
  const canEdit = can(viewer, "menu.edit");
  // The sidebar already hides this row from anyone who can't at least mark a
  // dish sold out. Checked again here because hiding a link is not a
  // permission — a bookmark reaches the page all the same.
  if (!can(viewer, "menu.availability")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>
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
  const [{ data, error }, { data: catRows }, { data: groupRows, error: groupError }] =
    await Promise.all([
    supabase
      .from("meals")
      .select(
        "id, name, price, description, categories, image_url, is_public, is_available, product_id, options, variant_sort"
      )
      .order("name"),
    // The shop's own vocabulary. Ordered the way the customer's menu orders
    // its filter pills, so the owner sets that order here and sees it there.
    supabase
      .from("menu_categories")
      .select("name, colour, sort_order")
      .order("sort_order")
      .order("name"),
    // Null rather than an error when the migration has not been run yet: the
    // Menu screen is where prices get fixed, and it must not go dark because
    // a grouping table is missing.
    supabase
      .from("menu_products")
      .select("id, name, description, image_url, sort_order, is_active")
      .order("sort_order")
      .order("name"),
  ]);

  // Read-only, so it is safe on every load. It is what decides whether the
  // collapse panel exists at all.
  // Both read-only, so they are safe on every load, and both take themselves
  // off the screen when there is nothing left to do.
  const [merge, purge] = canEdit
    ? await Promise.all([planTakeoutMerge(), planTakeoutPurge()])
    : [
        { rows: [], skipped: [], before: 0, after: 0, error: null },
        { rows: [], blocked: [], totalOrderLines: 0, error: null },
      ];

  type MealRow = AdminMeal & {
    product_id: string | null;
    options: unknown;
    variant_sort: number | null;
  };
  const rows = (data ?? []) as MealRow[];
  const meals = rows as AdminMeal[];
  const categories = (catRows ?? []) as MenuCategory[];

  // Members are read off the dishes rather than held on the group, for the
  // same reason the customer's menu reads the options off them: one place
  // that says which card a dish is on, so there is nothing to disagree.
  //
  // Reported, not swallowed. An unreadable grouping table shows this screen
  // an empty "Menu cards" list — which reads as "my cards were deleted" and
  // is one tap away from the owner rebuilding them all by hand.
  if (groupError) {
    console.error(`[admin/menu] menu_products unreadable: ${groupError.message}`);
  }
  const groups: GroupRow[] = (
    (groupRows ?? []) as Omit<GroupRow, "members">[]
  ).map((g) => ({
    ...g,
    members: rows
      .filter((m) => m.product_id === g.id)
      .sort((a, b) => (a.variant_sort ?? 0) - (b.variant_sort ?? 0))
      .map((m) => ({ mealId: m.id, options: normalizeOptions(m.options) })),
  }));

  // How many dishes are in each, so deleting one can say what's in the way.
  // Counts every category a dish carries, not just its first. Counting by
  // first category made "Ji Wings 0" sit next to a Ji Wings dish, because
  // that dish's first category was Mains — the chip and the filter beside it
  // were answering two different questions.
  const counts = countByCategory(meals);
  const hidden = meals.filter((m) => !m.is_public || !m.is_available).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={hqTitle}>
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

      {/* Only appears while there is something to collapse, and takes itself
          away once there isn't — a one-time job shouldn't leave a permanent
          button on the screen. */}
      {canEdit && <TakeoutMergePanel plan={merge} />}

      {/* Below the merge, because it is the step after it: the merge hides
          the twins, this is for when they are no longer wanted at all. */}
      {canEdit && <TakeoutPurgePanel plan={purge} />}

      {/* Above the dish list, because it is about the SHAPE of the menu and
          the list below is about the contents of it. Owner only: grouping
          decides what every customer sees, the same as a price. */}
      {canEdit && <ProductGroups groups={groups} meals={meals} />}

      {canEdit ? (
        <MenuWorkspace meals={meals} categories={categories} counts={counts} />
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
