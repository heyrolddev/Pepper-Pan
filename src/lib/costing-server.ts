import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  costBatches,
  costMeals,
  type Batch,
  type BatchCost,
  type BatchIngredient,
  type Ingredient,
  type Meal,
  type MealComponent,
  type MealCost,
  type MealIngredient,
} from "@/lib/costing";

/**
 * The recipe book, loaded once.
 *
 * Three screens and one server action need the same six tables costed the same
 * way. Three copies of that query is three places to forget a table the day a
 * seventh one matters — and the failure would be silent, because a missing
 * recipe table reads exactly like "no recipes entered".
 */
export type CostBook = {
  ingredients: Ingredient[];
  batches: Batch[];
  /** The raw recipe rows, for the screens that edit them rather than cost them. */
  batchIngredients: BatchIngredient[];
  mealIngredients: MealIngredient[];
  batchCosts: Map<string, BatchCost>;
  mealCosts: Map<string, MealCost>;
  /** Human-readable names of any table that wouldn't load. */
  failed: string[];
};

export async function loadCostBook(): Promise<CostBook> {
  const supabase = createAdminClient();
  const [ing, bat, batIng, mea, meaIng, meaComp] = await Promise.all([
    supabase.from("ingredients").select("*"),
    supabase.from("batches").select("*"),
    supabase.from("batch_ingredients").select("*"),
    supabase.from("meals").select("*").order("name"),
    supabase.from("meal_ingredients").select("*"),
    supabase.from("meal_components").select("*"),
  ]);

  // supabase-js returns errors rather than throwing, so a failed read arrives
  // as an empty array and would otherwise cost every dish at ₱0 — which looks
  // like wonderful margins rather than a broken query.
  const failed = [
    ing.error && "ingredients",
    bat.error && "batches",
    batIng.error && "batch recipes",
    mea.error && "dishes",
    meaIng.error && "dish recipes",
    meaComp.error && "combos",
  ].filter(Boolean) as string[];
  for (const [label, err] of [
    ["ingredients", ing.error],
    ["batches", bat.error],
    ["batch_ingredients", batIng.error],
    ["meals", mea.error],
    ["meal_ingredients", meaIng.error],
    ["meal_components", meaComp.error],
  ] as const) {
    if (err) console.error(`[costing] ${label}: ${err.message}`);
  }

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

  return {
    ingredients,
    batches,
    batchIngredients: (batIng.data ?? []) as BatchIngredient[],
    mealIngredients: (meaIng.data ?? []) as MealIngredient[],
    batchCosts,
    mealCosts,
    failed,
  };
}

/**
 * What an order cost to make, priced at the moment it was sold.
 *
 * Snapshotted onto the order rather than worked out again later, because
 * ingredient prices move: a bowl sold in August cost what pork cost in August,
 * and re-deriving it next year from next year's prices would quietly rewrite
 * history. `orders.cogs` and `orders.gross_profit` have been columns since the
 * first migration and have been zero on every row ever written.
 */
export async function recordOrderCost(orderId: string): Promise<void> {
  const supabase = createAdminClient();

  const [{ data: order, error: orderError }, { data: lines, error: linesError }] =
    await Promise.all([
      supabase.from("orders").select("revenue").eq("id", orderId).maybeSingle(),
      supabase.from("order_lines").select("meal_id, qty").eq("order_id", orderId),
    ]);

  if (orderError || linesError || !order) {
    // Never fatal. A sale that was recorded but not costed is a small gap in
    // the reporting; a sale that failed to record because the costing failed
    // is money missing from the day's takings.
    console.error(
      `[costing] couldn't cost order ${orderId}: ${
        orderError?.message ?? linesError?.message ?? "order not found"
      }`
    );
    return;
  }

  const { mealCosts } = await loadCostBook();

  let cogs = 0;
  for (const line of (lines ?? []) as { meal_id: string; qty: number }[]) {
    const mc = mealCosts.get(line.meal_id);
    // A dish with no recipe adds nothing rather than guessing. It makes the
    // cost a floor and the profit a ceiling, which is why the screens that
    // show profit also say how many dishes still have no recipe.
    if (!mc?.costed) continue;
    cogs += mc.cost * (Number(line.qty) || 0);
  }

  const revenue = Number(order.revenue) || 0;
  const { error } = await supabase
    .from("orders")
    .update({
      cogs: Math.round(cogs * 100) / 100,
      gross_profit: Math.round((revenue - cogs) * 100) / 100,
    })
    .eq("id", orderId);
  if (error) console.error(`[costing] update ${orderId}: ${error.message}`);
}
