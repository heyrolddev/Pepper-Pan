import { NO_NUTRITION, round, type Nutrition } from "./nutrition.ts";

/**
 * What is actually going in the basket, calories and all.
 *
 * ── Why the dish's own figure is not the answer ─────────────────────────
 *
 * A Black Pepper Chicken Noodles is 742 kcal. With extra rice and a Tiger
 * Sugar Milktea it is well past a thousand, and the person reading the
 * number is precisely the person that difference matters to. Printing 742
 * over a basket holding three things is not a simplification — it is a
 * figure that is wrong in the one direction that misleads, by the amount
 * the customer just chose to add.
 *
 * Every add-on already points at a real dish (0049), and a chosen size is a
 * dish too (0061), so the figures are all there. This adds them up.
 *
 * ── And says when it cannot ─────────────────────────────────────────────
 *
 * An add-on whose dish has no complete figure is NAMED, not skipped. A
 * silent skip is the same bug as the half-filled recipe: the total still
 * renders, still looks authoritative, and is quietly too low by exactly the
 * thing nobody has filled in. The panel can then show the dish's own figure
 * and say which extras are not counted, which is honest and still useful —
 * or say nothing, which is the caller's call to make with the facts in
 * hand.
 */

export type ExtraLine = {
  label: string;
  qty: number;
  /** For all `qty` of it, not one. */
  per: Nutrition;
};

export type OrderNutrition = {
  /** The dish alone, for one of it. */
  dish: Nutrition;
  /** Each counted add-on, multiplied by how many were taken. */
  extras: ExtraLine[];
  /** Dish plus every counted add-on. */
  total: Nutrition;
  /** Add-ons with no complete figure behind them, by label. */
  uncounted: string[];
};

const add = (a: Nutrition, b: Nutrition): Nutrition => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
});

const times = (n: Nutrition, by: number): Nutrition => ({
  kcal: n.kcal * by,
  protein: n.protein * by,
  carbs: n.carbs * by,
  fat: n.fat * by,
});

export function orderNutrition(
  dish: Nutrition | null,
  extras: { label: string; qty: number; mealId: string | null }[],
  byMeal: Record<string, Nutrition>
): OrderNutrition | null {
  // No figure for the dish itself is no figure at all. A total made only of
  // its add-ons would be a number for the drink, printed under the meal.
  if (!dish) return null;

  const lines: ExtraLine[] = [];
  const uncounted: string[] = [];
  let total = dish;

  for (const e of extras) {
    const qty = Math.max(0, Math.floor(Number(e.qty) || 0));
    if (qty <= 0) continue;
    const per = e.mealId ? byMeal[e.mealId] : undefined;
    if (!per) {
      uncounted.push(e.label);
      continue;
    }
    const line = times(per, qty);
    lines.push({ label: e.label, qty, per: line });
    total = add(total, line);
  }

  return {
    dish: round(dish),
    extras: lines.map((l) => ({ ...l, per: round(l.per) })),
    total: round(total),
    uncounted,
  };
}

/** How much of the total the add-ons put there. Zero when there are none. */
export function addedKcal(n: OrderNutrition): number {
  return Math.max(0, n.total.kcal - n.dish.kcal);
}

/**
 * The share of energy each macro carries, as whole percentages that total
 * exactly 100.
 *
 * Its own function rather than `macroSplit` because this one is fed a
 * SUMMED figure: the rounding has to happen after the addition, or three
 * add-ons each rounded to the nearest gram drift the bar away from the
 * numbers printed beside it.
 */
export function splitOf(n: Nutrition): {
  protein: number;
  carbs: number;
  fat: number;
} {
  const p = n.protein * 4;
  const c = n.carbs * 4;
  const f = n.fat * 9;
  const all = p + c + f;
  if (all <= 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round((p / all) * 100);
  const carbs = Math.round((c / all) * 100);
  return { protein, carbs, fat: 100 - protein - carbs };
}

export const NOTHING: Nutrition = NO_NUTRITION;
