import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import type { AdminMeal } from "@/components/meal-editor";
import { loadNutrition } from "@/lib/nutrition-server";
import { round } from "@/lib/nutrition";
import { suggestCode } from "@/lib/dish-code";
import { NutritionSwitch } from "@/components/nutrition-switch";
import { NutritionStatus } from "@/components/nutrition-status";
import { rolloutOf } from "@/lib/nutrition-rollout";
import { MenuWorkspace } from "@/components/menu-workspace";
import { MenuAvailability } from "@/components/menu-availability";
import { NewMealForm } from "@/components/new-meal-form";
import { TakeoutMergePanel } from "@/components/takeout-merge-panel";
import { TakeoutPurgePanel } from "@/components/takeout-purge-panel";
import { planTakeoutPurge } from "@/lib/takeout-purge";
import { ProductGroups, type GroupRow } from "@/components/product-groups";
import {
  ModifierGroups,
  type ModifierGroupRow,
} from "@/components/modifier-groups";
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
  const [
    { data, error },
    { data: catRows },
    { data: groupRows, error: groupError },
    { data: modGroupRows, error: modError },
    { data: modOptionRows },
    { data: mealAttachRows },
    { data: productAttachRows },
    { data: recipeRows },
    { data: componentRows },
    { data: optionPriceRows },
  ] = await Promise.all([
    supabase
      .from("meals")
      .select(
        "id, name, price, description, categories, image_url, is_public, is_available, product_id, options, variant_sort, code, kcal, protein_g, carbs_g, fat_g"
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
    /**
     * The add-ons, read raw rather than through `loadModifiers`.
     *
     * That helper answers "what is offered right now" — it drops switched-off
     * groups and options with no dish behind them, which is exactly right for
     * the menu and exactly wrong for the screen where the owner fixes them. A
     * group they turned off has to still be there to turn back on, and an
     * option whose dish was deleted has to be visible to be repointed.
     */
    supabase
      .from("modifier_groups")
      .select("id, name, helper, min_select, max_select, is_active, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("modifier_options")
      .select(
        "id, group_id, label, option_meal_id, option_product_id, price_override, max_qty, sort_order"
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("meal_modifier_groups").select("meal_id, group_id"),
    supabase.from("product_modifier_groups").select("product_id, group_id"),
    /**
     * Which dishes have a recipe at all.
     *
     * Two id-only reads rather than `loadCostBook`, which pulls six tables to
     * work out what everything costs — this screen only needs the yes/no, and
     * the Menu page is already doing seven queries.
     */
    supabase.from("meal_ingredients").select("meal_id"),
    supabase.from("meal_components").select("meal_id"),
    /**
     * What each size of a sized add-on charges.
     *
     * Loaded so the boxes come back filled. An editor that shows a saved
     * override as blank is worse than one that has no box at all: blank
     * means "charge the dish price", so the owner re-opens the group, sees
     * nothing typed, saves, and the ₱15 they set on the large silently
     * becomes the full price.
     */
    supabase.from("modifier_option_prices").select("option_id, meal_id, price"),
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

  /**
   * What each dish works out to, and what is stopping it.
   *
   * The editor shows this beside the override boxes because "why is there no
   * calorie count on this dish" is always the same answer — one ingredient
   * nobody has filled in — and the owner can only act on it if they are told
   * which one.
   */
  const inside = await loadNutrition();

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("show_nutrition")
    .eq("id", 1)
    .maybeSingle();
  const nutritionOn = settingsRow?.show_nutrition === true;

  /**
   * Ready, blocked, and what to fill in next.
   *
   * Built from `rows` rather than `meals` because it only needs the id and
   * the name, and `meals` is not assembled until below — and from the same
   * `inside` map the editor's own per-dish figures come from, so the count
   * beside the switch cannot disagree with the boxes underneath it.
   */
  const rollout = rolloutOf(
    rows.map((m) => ({ id: m.id, name: m.name, isPublic: m.is_public })),
    inside,
    nutritionOn
  );

  const codes = rows.map((m) => m.code ?? "").filter(Boolean);
  const meals: AdminMeal[] = rows.map((m) => {
    const worked = inside.get(m.id);
    const complete = worked && worked.missing === 0 && !worked.manual;
    return {
      ...m,
      worked: complete ? round(worked.per) : null,
      missing: worked?.manual ? [] : (worked?.missingNames ?? []),
      // Every OTHER dish's code — a dish keeping its own is not a clash.
      codesInUse: codes.filter((c) => c !== (m.code ?? "")),
      suggestion: suggestCode(m.categories?.[0] ?? null, codes),
    };
  });
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
  if (modError) {
    console.error(`[admin/menu] modifier_groups unreadable: ${modError.message}`);
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

  type ModRow = Omit<ModifierGroupRow, "options" | "productIds" | "mealIds">;
  type OptRow = {
    id: string;
    group_id: string;
    label: string;
    option_meal_id: string | null;
    option_product_id: string | null;
    price_override: number | null;
    max_qty: number;
    sort_order: number;
  };
  const priceRows = (optionPriceRows ?? []) as {
    option_id: string;
    meal_id: string;
    price: number;
  }[];
  const sizePricesOf = (optionId: string) =>
    Object.fromEntries(
      priceRows
        .filter((r) => r.option_id === optionId)
        .map((r) => [r.meal_id, Number(r.price)])
    );
  const optionRows = ((modOptionRows ?? []) as OptRow[]).map((o) => ({
    ...o,
    sizePrices: sizePricesOf(o.id),
  }));
  const mealAttach = (mealAttachRows ?? []) as { meal_id: string; group_id: string }[];
  const productAttach = (productAttachRows ?? []) as {
    product_id: string;
    group_id: string;
  }[];

  // A dish is costable if it names any ingredient, or is built from dishes
  // that do. Anything else sells for money and books nothing.
  const withRecipe = new Set(
    [
      ...((recipeRows ?? []) as { meal_id: string }[]),
      ...((componentRows ?? []) as { meal_id: string }[]),
    ].map((r) => r.meal_id)
  );

  const modifierGroups: ModifierGroupRow[] = ((modGroupRows ?? []) as ModRow[]).map(
    (g) => ({
      ...g,
      options: optionRows.filter((o) => o.group_id === g.id),
      productIds: productAttach.filter((a) => a.group_id === g.id).map((a) => a.product_id),
      mealIds: mealAttach.filter((a) => a.group_id === g.id).map((a) => a.meal_id),
    })
  );

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

      {canEdit && (
        <div className="flex flex-col gap-3">
          <NutritionSwitch
            on={nutritionOn}
            ready={rollout.ready.length}
            total={meals.length}
            rollout={rollout}
          />
          {/* The same panel the Inventory tab shows, on purpose. That screen
              is where the ingredients get filled in and this one is where
              the switch lives; the owner filled 44 ingredients on one and
              looked for the result on the other, and neither said what the
              third screen was doing. One component, one set of figures, so
              they cannot describe the same state two different ways. */}
          <NutritionStatus rollout={rollout} showMenuLink={false} />
        </div>
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

      {/* Under the cards, because a group is usually attached to one: the
          owner builds the card first and then decides what comes with it. */}
      {canEdit && (
        <ModifierGroups
          groups={modifierGroups}
          meals={meals.map((m) => ({
            id: m.id,
            name: m.name,
            price: Number(m.price),
            is_public: m.is_public,
          }))}
          cards={groups.map((g) => ({ id: g.id, name: g.name }))}
          /**
           * The same groups again, this time with their variants.
           *
           * `cards` says which menu cards a QUESTION can be attached to;
           * this says which cards an ANSWER can be — a drink that comes in
           * sizes. Two different uses of the same rows, kept as two props so
           * neither has to guess which one the component meant.
           */
          products={groups.map((g) => ({
            id: g.id,
            name: g.name,
            variants: g.members.map((m) => ({
              mealId: m.mealId,
              // The variant's own axis values are what the menu already calls
              // it — {"Size":"22oz"} reads "22oz". A second name for the same
              // thing is a second thing to keep in step.
              label:
                Object.values(m.options ?? {})
                  .filter(Boolean)
                  .join(" · ") ||
                meals.find((x) => x.id === m.mealId)?.name ||
                "",
              price: Number(meals.find((x) => x.id === m.mealId)?.price ?? 0),
            })),
          }))}
          withRecipe={withRecipe}
        />
      )}

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
