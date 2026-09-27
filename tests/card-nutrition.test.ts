import test from "node:test";
import assert from "node:assert/strict";
import { cardNutrition, kcalLabel } from "../src/lib/card-nutrition.ts";
import type { DishNutrition } from "../src/lib/nutrition.ts";

const v = (kcal: number, missing = 0, macros?: Partial<{ p: number; c: number; f: number }>) => ({
  nutrition: {
    per: {
      kcal,
      protein: macros?.p ?? kcal / 40,
      carbs: macros?.c ?? kcal / 20,
      fat: macros?.f ?? kcal / 90,
    },
    missing,
    missingNames: missing > 0 ? ["Soy Sauce"] : [],
    manual: false,
  } as DishNutrition,
});

/**
 * The screen this came from: every card on the shop's menu says "2 FLAVORS",
 * every dish was filled in, and not one calorie count reached a customer.
 */

test("two flavours that differ become a range", () => {
  const n = cardNutrition([v(620), v(780)]);
  assert.equal(n?.kind, "range");
  assert.equal(kcalLabel(n), "620–780");
});

test("a card with one dish states the figure, as it always did", () => {
  const n = cardNutrition([v(640)]);
  assert.deepEqual(n?.kind, "one");
  assert.equal(kcalLabel(n), "640");
});

test("two flavours that agree collapse to one number", () => {
  // "640–640 kcal" is not a range, it is a bug with a dash in it.
  assert.equal(kcalLabel(cardNutrition([v(640), v(640)])), "640");
});

test("figures that round to the same printed number are one number", () => {
  // 639.6 and 640.2 are one number to a reader and a range only to a float.
  assert.equal(kcalLabel(cardNutrition([v(639.6), v(640.2)])), "640");
});

test("same energy, different macros, still one figure", () => {
  // A "620–620" range would be nonsense; the breakdown belongs in the dialog.
  const n = cardNutrition([
    v(620, 0, { p: 30, c: 80, f: 12 }),
    v(620, 0, { p: 45, c: 60, f: 16 }),
  ]);
  assert.equal(n?.kind, "one");
  assert.equal(kcalLabel(n), "620");
});

/**
 * The honesty rule, which is the whole reason this is safe to show.
 *
 * A range built from three of four variants is not a range — it is a claim
 * about the fourth, made by leaving it out, and nothing on the card tells
 * the customer it was excluded.
 */
test("one unfinished flavour blanks the whole card", () => {
  assert.equal(cardNutrition([v(620), v(780, 1)]), null);
  assert.equal(cardNutrition([v(620, 2), v(780)]), null);
  assert.equal(kcalLabel(cardNutrition([v(620), v(780, 1)])), null);
});

test("a variant with no figures at all blanks it too", () => {
  assert.equal(cardNutrition([v(620), { nutrition: null }]), null);
  assert.equal(cardNutrition([v(620), {}]), null);
});

test("a zero-calorie figure is not a complete one", () => {
  // `isComplete` requires kcal > 0: nothing on this menu is genuinely 0 kcal,
  // so a zero is a recipe that summed to nothing, not a diet drink.
  assert.equal(cardNutrition([v(0)]), null);
  assert.equal(cardNutrition([v(620), v(0)]), null);
});

test("a card with no variants says nothing rather than throwing", () => {
  assert.equal(cardNutrition([]), null);
  assert.equal(kcalLabel(null), null);
});

test("the low end is the low end however the variants are ordered", () => {
  assert.equal(kcalLabel(cardNutrition([v(780), v(620), v(700)])), "620–780");
  assert.equal(kcalLabel(cardNutrition([v(620), v(700), v(780)])), "620–780");
});

test("thousands are grouped, because a rice meal can pass 1,000", () => {
  assert.equal(kcalLabel(cardNutrition([v(1240)])), "1,240");
  assert.equal(kcalLabel(cardNutrition([v(980), v(1240)])), "980–1,240");
});

test("the range carries both ends' macros, not just the numbers", () => {
  const n = cardNutrition([
    v(620, 0, { p: 30, c: 80, f: 12 }),
    v(780, 0, { p: 45, c: 95, f: 20 }),
  ]);
  assert.equal(n?.kind, "range");
  if (n?.kind !== "range") return;
  assert.equal(n.low.protein, 30);
  assert.equal(n.high.protein, 45);
});
