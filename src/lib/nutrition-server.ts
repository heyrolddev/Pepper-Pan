import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  nutritionOf,
  type DishNutrition,
  type NutritionLine,
  type PerUnit,
  type RollupInput,
} from "@/lib/nutrition";

/**
 * Everything the nutrition rollup needs, in one read.
 *
 * Six small tables — the same six costing walks, because it is the same walk.
 * Loaded together rather than per dish: the menu asks about seventy-three
 * dishes at once, and seventy-three round trips to work out a calorie count
 * is not a menu, it is a timeout.
 *
 * Failure is not fatal and never partial. If any of these reads fails the
 * whole thing comes back empty, so every dish reads as "not known yet" and
 * the menu renders without nutrition. The alternative — carrying on with
 * whichever tables answered — produces figures computed from half a recipe,
 * which is the one outcome this feature must never have.
 */
export async function loadNutrition(): Promise<Map<string, DishNutrition>> {
  const supabase = createAdminClient();

  const [meals, mealIng, mealComp, batches, batchIng, ingredients] = await Promise.all([
    supabase.from("meals").select("id, name, kcal, protein_g, carbs_g, fat_g"),
    supabase.from("meal_ingredients").select("meal_id, ref_type, ref_id, qty"),
    supabase.from("meal_components").select("meal_id, component_meal_id, qty"),
    supabase.from("batches").select("id, name, yield_qty"),
    supabase.from("batch_ingredients").select("batch_id, ref_type, ref_id, qty"),
    supabase
      .from("ingredients")
      .select("id, name, kcal_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit"),
  ]);

  const failed = [meals, mealIng, mealComp, batches, batchIng, ingredients].find(
    (r) => r.error
  );
  if (failed?.error) {
    console.error(`[nutrition] ${failed.error.message}`);
    return new Map();
  }

  return rollup({
    meals: (meals.data ?? []) as MealRow[],
    mealIng: (mealIng.data ?? []) as MealLineRow[],
    mealComp: (mealComp.data ?? []) as ComponentRow[],
    batches: (batches.data ?? []) as BatchRow[],
    batchIng: (batchIng.data ?? []) as BatchLineRow[],
    ingredients: (ingredients.data ?? []) as IngredientRow[],
  });
}

type MealRow = {
  id: string;
  name: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};
type MealLineRow = { meal_id: string; ref_type: string; ref_id: string; qty: number };
type ComponentRow = { meal_id: string; component_meal_id: string; qty: number };
type BatchRow = { id: string; name: string; yield_qty: number | null };
type BatchLineRow = { batch_id: string; ref_type: string | null; ref_id: string; qty: number };
type IngredientRow = {
  id: string;
  name: string;
  kcal_per_unit: number | null;
  protein_per_unit: number | null;
  carbs_per_unit: number | null;
  fat_per_unit: number | null;
};

/**
 * The rows, rearranged into the shape the pure rollup wants.
 *
 * Exported so a test can drive the whole assembly from plain rows without a
 * database — the indexing is where a rollup like this actually goes wrong,
 * not in the arithmetic.
 */
export function rollup(rows: {
  meals: MealRow[];
  mealIng: MealLineRow[];
  mealComp: ComponentRow[];
  batches: BatchRow[];
  batchIng: BatchLineRow[];
  ingredients: IngredientRow[];
}): Map<string, DishNutrition> {
  const mealLines = new Map<string, NutritionLine[]>();
  for (const r of rows.mealIng) {
    const list = mealLines.get(r.meal_id) ?? [];
    list.push({ ref_type: r.ref_type, ref_id: r.ref_id, qty: Number(r.qty) || 0 });
    mealLines.set(r.meal_id, list);
  }

  const mealParts = new Map<string, { component_meal_id: string; qty: number }[]>();
  for (const r of rows.mealComp) {
    const list = mealParts.get(r.meal_id) ?? [];
    list.push({ component_meal_id: r.component_meal_id, qty: Number(r.qty) || 0 });
    mealParts.set(r.meal_id, list);
  }

  const batchLines = new Map<string, NutritionLine[]>();
  for (const r of rows.batchIng) {
    const list = batchLines.get(r.batch_id) ?? [];
    // `ref_type` arrived with 0046, when a batch could first contain another
    // batch. Older rows have it null and are always ingredients.
    list.push({ ref_type: r.ref_type ?? "inv", ref_id: r.ref_id, qty: Number(r.qty) || 0 });
    batchLines.set(r.batch_id, list);
  }

  const batchYield = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const b of rows.batches) {
    batchYield.set(b.id, Number(b.yield_qty) || 0);
    nameOf.set(b.id, b.name);
  }

  const perIngredient = new Map<string, PerUnit>();
  for (const i of rows.ingredients) {
    nameOf.set(i.id, i.name);
    perIngredient.set(i.id, {
      kcal: i.kcal_per_unit,
      protein: i.protein_per_unit,
      carbs: i.carbs_per_unit,
      fat: i.fat_per_unit,
    });
  }

  const override = new Map<string, PerUnit>();
  for (const m of rows.meals) {
    nameOf.set(m.id, m.name);
    override.set(m.id, {
      kcal: m.kcal,
      protein: m.protein_g,
      carbs: m.carbs_g,
      fat: m.fat_g,
    });
  }

  const input: RollupInput = {
    mealLines,
    mealParts,
    batchLines,
    batchYield,
    perIngredient,
    nameOf,
    override,
  };
  return nutritionOf(rows.meals.map((m) => m.id), input);
}
