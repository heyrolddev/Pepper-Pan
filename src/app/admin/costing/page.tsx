import { getViewer } from "@/lib/auth";
import { loadCostBook } from "@/lib/costing-server";
import { marginFor } from "@/lib/costing";
import { DishCosts, type DishRow } from "@/components/dish-costs";
import type { RecipeOption } from "@/components/recipe-editor";

// Recipes and prices change from the Menu screen; a cached cost is a wrong one.
export const dynamic = "force-dynamic";

export default async function AdminCostingPage() {
  const viewer = await getViewer();

  // What every dish earns is the owner's business, not a shift's. Hidden from
  // the sidebar for staff too, but checked here because hiding a link is not
  // a permission.
  if (viewer?.profile?.role !== "owner") {
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

  const { mealCosts, batchCosts, ingredients, mealIngredients, failed } =
    await loadCostBook();

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

  // Maps don't survive the trip to a client component, and the client has no
  // business re-deriving arithmetic the server already did.
  const dishes: DishRow[] = [...mealCosts.values()].map((mc) => {
    const m = marginFor(mc.meal.price, mc.cost, mc.costed);
    return {
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

  return <DishCosts dishes={dishes} options={options} failed={failed} />;
}
