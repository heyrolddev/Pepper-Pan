import test from "node:test";
import assert from "node:assert/strict";
import { addedKcal, orderNutrition, splitOf } from "../src/lib/order-nutrition.ts";
import type { Nutrition } from "../src/lib/nutrition.ts";

const noodles: Nutrition = { kcal: 742, protein: 38, carbs: 61, fat: 37 };
const rice: Nutrition = { kcal: 240, protein: 4.4, carbs: 53, fat: 0.4 };
const milktea: Nutrition = { kcal: 339, protein: 3, carbs: 68, fat: 6 };

const BY_MEAL = { "extra-rice": rice, "tiger-sugar": milktea };

test("a dish with nothing added is the dish", () => {
  const n = orderNutrition(noodles, [], BY_MEAL);
  assert.deepEqual(n?.total, { kcal: 742, protein: 38, carbs: 61, fat: 37 });
  assert.deepEqual(n?.extras, []);
  assert.equal(addedKcal(n!), 0);
});

test("the add-ons are counted, because they are what the reader just chose", () => {
  // 742 over a basket holding three things is not a simplification — it is
  // wrong in the one direction that misleads.
  const n = orderNutrition(
    noodles,
    [
      { label: "Extra Rice", qty: 1, mealId: "extra-rice" },
      { label: "Tiger Sugar Milktea", qty: 1, mealId: "tiger-sugar" },
    ],
    BY_MEAL
  );
  assert.equal(n?.total.kcal, 742 + 240 + 339);
  assert.equal(addedKcal(n!), 579);
  assert.deepEqual(
    n?.extras.map((e) => [e.label, e.per.kcal]),
    [
      ["Extra Rice", 240],
      ["Tiger Sugar Milktea", 339],
    ]
  );
});

test("two of something counts twice", () => {
  const n = orderNutrition(
    noodles,
    [{ label: "Extra Rice", qty: 3, mealId: "extra-rice" }],
    BY_MEAL
  );
  assert.equal(n?.extras[0].per.kcal, 720);
  assert.equal(n?.total.kcal, 742 + 720);
  assert.equal(n?.extras[0].qty, 3);
});

/**
 * The honesty rule, again, in the one place it would be easiest to skip.
 */
test("an add-on with no figure is named, never quietly dropped", () => {
  const n = orderNutrition(
    noodles,
    [
      { label: "Extra Rice", qty: 1, mealId: "extra-rice" },
      { label: "Mystery Sauce", qty: 1, mealId: "no-figures" },
    ],
    BY_MEAL
  );
  // Counted what it can, and says what it could not — a silent skip renders
  // an authoritative total that is low by exactly the missing thing.
  assert.equal(n?.total.kcal, 982);
  assert.deepEqual(n?.uncounted, ["Mystery Sauce"]);
});

test("an add-on that points at no dish at all is named too", () => {
  const n = orderNutrition(noodles, [{ label: "A note", qty: 1, mealId: null }], BY_MEAL);
  assert.deepEqual(n?.uncounted, ["A note"]);
  assert.equal(n?.total.kcal, 742);
});

test("no figure for the dish means no figure at all", () => {
  // A total made only of the add-ons would be a number for the drink,
  // printed under the meal.
  assert.equal(orderNutrition(null, [{ label: "Extra Rice", qty: 1, mealId: "extra-rice" }], BY_MEAL), null);
});

test("an add-on taken zero times is not an add-on", () => {
  const n = orderNutrition(
    noodles,
    [{ label: "Extra Rice", qty: 0, mealId: "extra-rice" }],
    BY_MEAL
  );
  assert.deepEqual(n?.extras, []);
  assert.deepEqual(n?.uncounted, []);
  assert.equal(n?.total.kcal, 742);
});

test("the sum is rounded once, at the end", () => {
  // Three add-ons each rounded to the nearest gram would drift the bar away
  // from the numbers printed beside it.
  const n = orderNutrition(
    { kcal: 100, protein: 1.4, carbs: 1.4, fat: 1.4 },
    [{ label: "x", qty: 3, mealId: "x" }],
    { x: { kcal: 10, protein: 0.2, carbs: 0.2, fat: 0.2 } }
  );
  // 1.4 + 0.6 = 2.0 exactly; rounding each part first would give 1 + 1 = 2
  // by luck here, so the figure that matters is the total's.
  assert.equal(n?.total.protein, 2);
  assert.equal(n?.total.kcal, 130);
});

test("the dish's own figure survives beside the total", () => {
  // The panel shows both: what the dish is, and what the basket is.
  const n = orderNutrition(
    noodles,
    [{ label: "Extra Rice", qty: 1, mealId: "extra-rice" }],
    BY_MEAL
  );
  assert.equal(n?.dish.kcal, 742);
  assert.equal(n?.total.kcal, 982);
});

// ── the bar ───────────────────────────────────────────────────────────────

test("the macro bar always fills exactly, whatever the rounding", () => {
  for (const n of [noodles, rice, milktea, { kcal: 1, protein: 0.33, carbs: 0.33, fat: 0.33 }]) {
    const s = splitOf(n);
    assert.equal(
      s.protein + s.carbs + s.fat,
      100,
      `${JSON.stringify(n)} left a gap in the bar`
    );
  }
});

test("a figure with no macros draws an empty bar rather than dividing by zero", () => {
  assert.deepEqual(splitOf({ kcal: 0, protein: 0, carbs: 0, fat: 0 }), {
    protein: 0,
    carbs: 0,
    fat: 0,
  });
});

test("fat is weighted at 9, not 4 — it is the whole point of the bar", () => {
  // Equal grams of each: fat carries more than twice the energy, and a bar
  // drawn from grams would say they are equal.
  const s = splitOf({ kcal: 170, protein: 10, carbs: 10, fat: 10 });
  assert.ok(s.fat > s.protein, "fat should dominate at equal grams");
  assert.equal(s.protein, s.carbs);
});
