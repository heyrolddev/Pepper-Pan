import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  costBatches,
  costMeals,
  marginFor,
  type Batch,
  type BatchIngredient,
  type Ingredient,
  type Meal,
  type MealComponent,
  type MealIngredient,
} from "@/lib/costing";
import { DishCosts, type DishRow } from "@/components/dish-costs";

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

  const supabase = createAdminClient();
  const [ing, bat, batIng, mea, meaIng, meaComp] = await Promise.all([
    supabase.from("ingredients").select("*"),
    supabase.from("batches").select("*"),
    supabase.from("batch_ingredients").select("*"),
    supabase.from("meals").select("*").order("name"),
    supabase.from("meal_ingredients").select("*"),
    supabase.from("meal_components").select("*"),
  ]);

  // supabase-js returns errors rather than throwing, so one failed read would
  // otherwise show up as an empty recipe on every dish — which reads exactly
  // like "no recipes entered". Said out loud instead.
  const failed = [
    ing.error && "ingredients",
    bat.error && "batches",
    batIng.error && "batch recipes",
    mea.error && "dishes",
    meaIng.error && "dish recipes",
    meaComp.error && "combos",
  ].filter(Boolean) as string[];

  const ingredients = (ing.data ?? []) as Ingredient[];
  const batches = (bat.data ?? []) as Batch[];

  const batchCosts = costBatches(
    batches,
    (batIng.data ?? []) as BatchIngredient[],
    ingredients
  );
  const mealCosts = costMeals(
    (mea.data ?? []) as Meal[],
    (meaIng.data ?? []) as MealIngredient[],
    (meaComp.data ?? []) as MealComponent[],
    ingredients,
    batchCosts
  );

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

  return <DishCosts dishes={dishes} failed={failed} />;
}
