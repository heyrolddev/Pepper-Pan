import { isComplete, round, type DishNutrition, type Nutrition } from "./nutrition.ts";

/**
 * What a menu CARD can honestly say about calories.
 *
 * ── The hole this fills ─────────────────────────────────────────────────
 *
 * A card holding two flavours carried `nutrition: null`, and the comment
 * next to that line said the figures live "on the chips inside the dish
 * instead". They did not. The dish dialog had no nutrition in it at all —
 * the promise was written and never built.
 *
 * So for a shop whose menu is almost entirely grouped cards, the whole
 * feature was invisible: every ingredient filled in, every dish complete in
 * the owner's Menu tab, and not one number anywhere a customer could see
 * it. The count said "1 of 55 dishes have a complete figure" and the one
 * dish that did happened to be the only card with a single variant on it.
 *
 * ── Why a range, when the original call was "a range is noise" ──────────
 *
 * That call was made for a card holding four ji pai at four calorie counts,
 * and it is right about that card in isolation. It is wrong about this
 * menu, because the alternative it produced was not "a cleaner card" but
 * "no calories anywhere at all". A customer choosing between Black Pepper
 * Chicken Noodles and a rice meal is helped by "620–780" and helped by
 * nothing at all by a blank.
 *
 * The honesty rule is what keeps it safe: EVERY variant must have a
 * complete figure, or the card says nothing. A range built from three of
 * four variants is not a range — it is a claim about the fourth, made by
 * leaving it out, and the customer has no way to see it was excluded.
 *
 * Identical variants collapse to one number. Two flavours of noodles that
 * both work out to 640 kcal should not be printed as "640–640".
 */

export type CardNutrition =
  /** One dish, or several that agree. */
  | { kind: "one"; per: Nutrition }
  /** Several, all known, and they differ. */
  | { kind: "range"; low: Nutrition; high: Nutrition }
  | null;

export function cardNutrition(
  variants: { nutrition?: DishNutrition | null }[]
): CardNutrition {
  if (variants.length === 0) return null;
  // All or nothing. One variant nobody has finished blanks the card, the
  // same way one blank ingredient blanks a dish — for the same reason, and
  // it must be the same reason or the two rules drift.
  if (!variants.every((v) => isComplete(v.nutrition))) return null;

  const rows = variants.map((v) => round(v.nutrition!.per));
  const byKcal = [...rows].sort((a, b) => a.kcal - b.kcal);
  const low = byKcal[0];
  const high = byKcal[byKcal.length - 1];

  // Compared on the rounded figures, because those are what gets printed:
  // 639.6 and 640.2 are one number to a reader and "a range" only to a
  // float.
  const same = rows.every(
    (r) =>
      r.kcal === low.kcal &&
      r.protein === low.protein &&
      r.carbs === low.carbs &&
      r.fat === low.fat
  );
  if (same) return { kind: "one", per: low };
  if (low.kcal === high.kcal) {
    // Same energy, different macros — a "620–620 kcal" range would be
    // nonsense, so the card gives the one figure it can state and the
    // dialog shows each flavour's own breakdown.
    return { kind: "one", per: low };
  }
  return { kind: "range", low, high };
}

/** "640 kcal" or "620–780 kcal", for the card. */
export function kcalLabel(n: CardNutrition): string | null {
  if (!n) return null;
  const at = (v: number) => v.toLocaleString("en-PH");
  return n.kind === "one"
    ? `${at(n.per.kcal)}`
    : `${at(n.low.kcal)}–${at(n.high.kcal)}`;
}
