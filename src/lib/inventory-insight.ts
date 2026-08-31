import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import type { Batch, BatchIngredient, Ingredient } from "@/lib/costing";

/**
 * The two things the store room can work out that a person can't at a glance.
 *
 * A reorder level is a number somebody guessed once. Now that every sale
 * writes to `consumption_log`, the shop can be told what it actually gets
 * through — and a static "reorder at 100g" can be compared against "you use
 * 43g a day, so 100g is two days".
 */

export type Suggestion = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** Average used per day over the lookback window. */
  dailyAvg: number;
  /** How many days the current stock lasts at that rate. */
  daysLeft: number;
  /** What to have on the shelf to cover `coverDays`. */
  parLevel: number;
  /** parLevel − stock, floored at zero. */
  buy: number;
  cost: number;
  /**
   * Batches already made from this ingredient that are still in stock.
   * "Low, but you've got 2,125g of Black Pepper Sauce made" stops a panic
   * buy for something already prepped — the single most useful line in the
   * old app.
   */
  coveredBy: { name: string; qty: number; unit: string }[];
};

export type ExpiringLot = {
  ingredientId: string;
  name: string;
  unit: string;
  qty: number;
  cost: number;
  expiryDate: string;
  /** Negative when it has already gone. */
  daysLeft: number;
};

export type Insight = {
  suggestions: Suggestion[];
  expiring: ExpiringLot[];
  /** How many days of history the averages are built on. */
  lookbackDays: number;
  coverDays: number;
  /** True when there isn't enough history for the averages to mean anything. */
  thin: boolean;
};

const LOOKBACK_DAYS = 30;
const COVER_DAYS = 7;
const EXPIRY_WARNING_DAYS = 5;

/** Midnight-to-midnight day difference, so "today" is 0 and not 0.4. */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T00:00:00Z").getTime() -
      new Date(from + "T00:00:00Z").getTime()) /
      86_400_000
  );
}

export async function loadInsight(
  ingredients: Ingredient[],
  batches: Batch[],
  batchIngredients: BatchIngredient[]
): Promise<Insight> {
  const supabase = createAdminClient();
  const today = shopToday();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [{ data: usage, error: usageError }, { data: lots, error: lotsError }] =
    await Promise.all([
      supabase
        .from("consumption_log")
        .select("ingredient_id, qty, type, date")
        .gte("date", since)
        // What the shop sells and prepares, not what it throws away. Buying
        // more to cover what keeps getting binned is how a waste problem
        // becomes permanent — waste has its own log and its own screen.
        .in("type", ["sale", "batch"]),
      supabase
        .from("ingredient_lots")
        .select("ingredient_id, qty, cost, expiry_date")
        .not("expiry_date", "is", null)
        .gt("qty", 0),
    ]);

  if (usageError) console.error(`[insight] usage: ${usageError.message}`);
  if (lotsError) console.error(`[insight] lots: ${lotsError.message}`);

  const used = new Map<string, number>();
  let earliest = today;
  for (const row of (usage ?? []) as {
    ingredient_id: string;
    qty: number;
    date: string;
  }[]) {
    used.set(row.ingredient_id, (used.get(row.ingredient_id) ?? 0) + Number(row.qty || 0));
    if (row.date < earliest) earliest = row.date;
  }

  // Averaged over the days there is actually history for, not a flat 30. In
  // the first week of trading, dividing a week of sales by thirty would say
  // the shop uses a quarter of what it does and order accordingly.
  const observedDays = Math.max(1, daysBetween(earliest, today) + 1);
  const thin = observedDays < 7;

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const usesIngredient = new Map<string, Batch[]>();
  for (const bi of batchIngredients) {
    const b = batchById.get(bi.batch_id);
    if (!b) continue;
    const list = usesIngredient.get(bi.ingredient_id) ?? [];
    list.push(b);
    usesIngredient.set(bi.ingredient_id, list);
  }

  const suggestions: Suggestion[] = [];
  for (const ing of ingredients) {
    const total = used.get(ing.id) ?? 0;
    const dailyAvg = total / observedDays;
    if (dailyAvg <= 0) continue; // nothing used, so nothing to say

    const stock = Number(ing.stock) || 0;
    const parLevel = dailyAvg * COVER_DAYS;
    if (stock >= parLevel) continue;

    suggestions.push({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      stock,
      dailyAvg,
      daysLeft: dailyAvg > 0 ? stock / dailyAvg : Infinity,
      parLevel,
      buy: Math.max(0, parLevel - stock),
      cost: Math.max(0, parLevel - stock) * (Number(ing.cost) || 0),
      coveredBy: (usesIngredient.get(ing.id) ?? [])
        .filter((b) => Number(b.batch_stock) > Number(b.reorder_level || 0))
        .map((b) => ({
          name: b.name,
          qty: Number(b.batch_stock) || 0,
          unit: b.yield_unit,
        })),
    });
  }
  // Soonest to run out first — the order you would actually shop in.
  suggestions.sort((a, b) => a.daysLeft - b.daysLeft);

  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const expiring: ExpiringLot[] = [];
  for (const lot of (lots ?? []) as {
    ingredient_id: string;
    qty: number;
    cost: number;
    expiry_date: string;
  }[]) {
    const daysLeft = daysBetween(today, lot.expiry_date);
    if (daysLeft > EXPIRY_WARNING_DAYS) continue;
    const ing = ingById.get(lot.ingredient_id);
    expiring.push({
      ingredientId: lot.ingredient_id,
      name: ing?.name ?? "Deleted ingredient",
      unit: ing?.unit ?? "",
      qty: Number(lot.qty) || 0,
      cost: (Number(lot.qty) || 0) * (Number(lot.cost) || 0),
      expiryDate: lot.expiry_date,
      daysLeft,
    });
  }
  expiring.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    suggestions,
    expiring,
    lookbackDays: observedDays,
    coverDays: COVER_DAYS,
    thin,
  };
}
