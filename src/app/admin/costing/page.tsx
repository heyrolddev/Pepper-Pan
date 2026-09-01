import { can, getViewer } from "@/lib/auth";
import { loadCostBook, loadSalesVolume } from "@/lib/costing-server";
import { classifyMenu, marginFor, menuClassFor } from "@/lib/costing";
import { DishCosts, type DishRow } from "@/components/dish-costs";
import type { RecipeOption } from "@/components/recipe-editor";

// Recipes and prices change from the Menu screen; a cached cost is a wrong one.
export const dynamic = "force-dynamic";

export default async function AdminCostingPage() {
  const viewer = await getViewer();

  // What every dish earns is the owner's business, not a shift's. Hidden from
  // the sidebar for staff too, but checked here because hiding a link is not
  // a permission.
  if (!can(viewer, "costs")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className="font-display text-2xl font-black text-ink-950">Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Costs and margins are the owner&apos;s to see. Staff can check what
          stock is left on the Inventory screen.
        </p>
      </div>
    );
  }

  const {
    mealCosts,
    batchCosts,
    ingredients,
    mealIngredients,
    packagingCost,
    mealPackaging,
    orderPackaging,
    orderPackagingCost,
    failed,
  } = await loadCostBook();

  const packagingByMeal = new Map<string, typeof mealPackaging>();
  for (const mp of mealPackaging) {
    const list = packagingByMeal.get(mp.meal_id) ?? [];
    list.push(mp);
    packagingByMeal.set(mp.meal_id, list);
  }

  // Menu engineering needs popularity as well as margin.
  const soldByMeal = await loadSalesVolume();

  // What a recipe line may point at: every ingredient, and every batch at its
  // cost per unit of yield — the same number the costing engine multiplies by.
  const options: RecipeOption[] = [
    ...ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      unitCost: Number(i.cost) || 0,
      kind: "inv" as const,
      stock: Number(i.stock) || 0,
    })),
    ...[...batchCosts.values()].map((b) => ({
      id: b.batch.id,
      name: b.batch.name,
      unit: b.batch.yield_unit,
      unitCost: b.perUnit,
      kind: "batch" as const,
      stock: Number(b.batch.batch_stock) || 0,
    })),
  ];

  const recipeByMeal = new Map<string, typeof mealIngredients>();
  for (const mi of mealIngredients) {
    const list = recipeByMeal.get(mi.meal_id) ?? [];
    list.push(mi);
    recipeByMeal.set(mi.meal_id, list);
  }

  // Averages first, from every costed dish, so each dish can be placed
  // against the menu it's actually on.
  const forSplit = [...mealCosts.values()]
    .filter((mc) => mc.costed && mc.meal.price > 0)
    .map((mc) => ({
      qty: soldByMeal.get(mc.meal.id) ?? 0,
      gross: marginFor(mc.meal.price, mc.cost, mc.costed).gross,
    }));
  const { avgQty, avgGross } = classifyMenu(forSplit);
  const anySales = forSplit.some((r) => r.qty > 0);

  const dishes: DishRow[] = [...mealCosts.values()].map((mc) => {
    const m = marginFor(mc.meal.price, mc.cost, mc.costed);
    const sold = soldByMeal.get(mc.meal.id) ?? 0;
    return {
      sold,
      // Withheld entirely until something has sold. Classifying a menu where
      // every dish has sold nothing puts them all in the same box and calls
      // it insight.
      menuClass:
        anySales && mc.costed && mc.meal.price > 0
          ? menuClassFor(sold, m.gross, avgQty, avgGross)
          : null,
      id: mc.meal.id,
      name: mc.meal.name,
      price: Number(mc.meal.price) || 0,
      categories: mc.meal.categories ?? [],
      onMenu: mc.meal.is_public,
      available: mc.meal.is_available,
      cost: mc.cost,
      costed: mc.costed,
      gross: m.gross,
      foodCostPct: m.foodCostPct,
      verdict: m.verdict,
      problems: mc.problems,
      packagingCost: packagingCost.get(mc.meal.id) ?? 0,
      packaging: (packagingByMeal.get(mc.meal.id) ?? []).map((r) => ({
        refType: r.ref_type as "inv" | "batch",
        refId: r.ref_id,
        qty: Number(r.qty) || 0,
      })),
      recipe: (recipeByMeal.get(mc.meal.id) ?? []).map((r) => ({
        refType: r.ref_type as "inv" | "batch",
        refId: r.ref_id,
        qty: Number(r.qty) || 0,
      })),
      lines: mc.lines.map((l) => ({
        label: l.label,
        kind: l.kind,
        qty: l.qty,
        unit: l.unit,
        unitCost: l.unitCost,
        cost: l.cost,
        problem: l.problem,
      })),
    };
  });

  return (
    <DishCosts
      dishes={dishes}
      options={options}
      classified={anySales}
      orderPackagingCost={orderPackagingCost}
      orderPackaging={orderPackaging.map((l) => ({
        refType: l.ref_type as "inv" | "batch",
        refId: l.ref_id,
        qty: Number(l.qty) || 0,
      }))}
      failed={failed}
    />
  );
}
