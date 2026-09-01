import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  costBatches,
  costMeals,
  makeableServings,
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

/**
 * How much of each dish has actually sold.
 *
 * Menu engineering without sales volume is just a cost list — half the
 * quadrants are about popularity. Kept here rather than in the page because
 * the page is a component, and reading the clock during render is exactly
 * the impurity the React compiler warns about.
 */
export async function loadSalesVolume(
  days = 90
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("order_lines")
    .select("meal_id, qty, orders!inner(date, status)")
    .gte("orders.date", since)
    .neq("orders.status", "cancelled");
  if (error) {
    console.error(`[costing] sales volume: ${error.message}`);
    return new Map();
  }
  const out = new Map<string, number>();
  for (const r of (data ?? []) as { meal_id: string; qty: number }[]) {
    out.set(r.meal_id, (out.get(r.meal_id) ?? 0) + (Number(r.qty) || 0));
  }
  return out;
}

/**
 * How many of each dish the shelf can still produce.
 *
 * Four light queries rather than the full cost book: the customer menu is the
 * busiest page on the site and has no use for prices, recipes or margins —
 * only for whether a thing can still be made.
 *
 * Returns a map of meal id to servings. Absent means unconstrained (no recipe
 * entered), which is not the same as zero.
 */
export async function loadAvailability(): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const [ing, bat, meaIng, meaComp] = await Promise.all([
    supabase.from("ingredients").select("id, stock"),
    supabase.from("batches").select("id, batch_stock"),
    supabase.from("meal_ingredients").select("meal_id, ref_type, ref_id, qty"),
    supabase.from("meal_components").select("meal_id, component_meal_id, qty"),
  ]);

  // A failed read must not close the shop. Returning an empty map leaves
  // every dish unconstrained, which is how the menu behaved before any of
  // this existed — the safe direction to fail in.
  if (ing.error || bat.error || meaIng.error || meaComp.error) {
    console.error(
      `[availability] ${
        ing.error?.message ??
        bat.error?.message ??
        meaIng.error?.message ??
        meaComp.error?.message
      }`
    );
    return new Map();
  }

  const ingredients = (ing.data ?? []).map((r) => ({
    ...(r as { id: string; stock: number }),
  })) as Ingredient[];
  const batches = (bat.data ?? []).map((r) => ({
    ...(r as { id: string; batch_stock: number }),
  })) as Batch[];
  const mealIngredients = (meaIng.data ?? []) as MealIngredient[];
  const mealComponents = (meaComp.data ?? []) as MealComponent[];

  const mealIds = new Set<string>([
    ...mealIngredients.map((m) => m.meal_id),
    ...mealComponents.map((m) => m.meal_id),
  ]);

  const out = new Map<string, number>();
  for (const id of mealIds) {
    const n = makeableServings(
      id,
      mealIngredients,
      mealComponents,
      ingredients,
      batches
    );
    if (Number.isFinite(n)) out.set(id, n);
  }
  return out;
}
