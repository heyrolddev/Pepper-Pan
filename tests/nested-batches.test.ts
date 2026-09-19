import test from "node:test";
import assert from "node:assert/strict";
import {
  costBatches,
  costMeals,
  type Batch,
  type BatchIngredient,
  type Ingredient,
  type Meal,
  type MealIngredient,
} from "../src/lib/costing.ts";

/**
 * A batch made of other batches.
 *
 * Liquid butter is a batch. Marinated ji pai is a batch made WITH the liquid
 * butter. Before migration 0046 the only way to say that was to re-list every
 * ingredient of the butter inside the ji pai — which costs the butter twice
 * in two places and leaves the ji pai silently wrong when the butter recipe
 * changes.
 *
 * Two things can go wrong once a recipe can point at a recipe, and both fail
 * quietly rather than loudly: the cost can be counted twice, and a loop can
 * hang the page. These are the tests for both.
 */

const ing = (id: string, cost: number): Ingredient => ({
  id,
  name: id,
  unit: "g",
  cost,
  stock: 100000,
  reorder: 0,
  purchase_price: 0,
  purchase_qty: 0,
  categories: null,
});

const batch = (id: string, yieldQty: number): Batch => ({
  id,
  name: id,
  yield_qty: yieldQty,
  yield_unit: "g",
  batch_stock: 0,
  reorder_level: 0,
  manual_cost_per_unit: null,
});

const inv = (batchId: string, refId: string, qty: number): BatchIngredient => ({
  batch_id: batchId,
  ref_type: "inv",
  ref_id: refId,
  qty,
});
const sub = (batchId: string, refId: string, qty: number): BatchIngredient => ({
  batch_id: batchId,
  ref_type: "batch",
  ref_id: refId,
  qty,
});

// Butter: 500g of butter at ₱1/g → ₱500 for 500g yield → ₱1.00/g.
// Ji pai: 1000g chicken at ₱0.20/g + 100g of the butter → ₱200 + ₱100 = ₱300
//         for a 1000g yield → ₱0.30/g.
const ingredients = [ing("butter", 1), ing("chicken", 0.2), ing("salt", 0.01)];
const batches = [batch("liquid-butter", 500), batch("ji-pai", 1000)];
const lines = [
  inv("liquid-butter", "butter", 500),
  inv("ji-pai", "chicken", 1000),
  sub("ji-pai", "liquid-butter", 100),
];

test("a batch made of another batch is priced from it, once", () => {
  const costs = costBatches(batches, lines, ingredients);
  assert.equal(costs.get("liquid-butter")!.perUnit, 1);
  const jiPai = costs.get("ji-pai")!;
  assert.equal(jiPai.total, 300);
  assert.ok(Math.abs(jiPai.perUnit - 0.3) < 1e-9);
});

test("the sub-batch shows as its own line, not as its ingredients", () => {
  // The whole point: the ji pai recipe says "100g liquid butter", not
  // "100g of butter, 2g of salt, …". One line, one name, one price.
  const jiPai = costBatches(batches, lines, ingredients).get("ji-pai")!;
  assert.equal(jiPai.lines.length, 2);
  const butterLine = jiPai.lines.find((l) => l.label === "liquid-butter")!;
  assert.equal(butterLine.kind, "batch");
  assert.equal(butterLine.unitCost, 1);
  assert.equal(butterLine.cost, 100);
});

test("order doesn't matter — a batch costs after what it draws on", () => {
  // The rows come back from the database in whatever order the index gives.
  // A single flat pass would price whichever came first and get the other
  // wrong; this resolves on demand instead.
  const backwards = [...batches].reverse();
  const shuffled = [lines[2], lines[1], lines[0]];
  const costs = costBatches(backwards, shuffled, ingredients);
  assert.ok(Math.abs(costs.get("ji-pai")!.perUnit - 0.3) < 1e-9);
});

test("two batches using the same sub-batch is not a loop", () => {
  // A diamond. `visiting` must mean "on the stack right now", not "seen
  // before" — otherwise the second user of the butter reads as circular.
  const three = [...batches, batch("sauce", 200)];
  const withDiamond = [...lines, sub("sauce", "liquid-butter", 50)];
  const costs = costBatches(three, withDiamond, ingredients);
  assert.equal(costs.get("sauce")!.total, 50);
  assert.deepEqual(costs.get("sauce")!.problems, []);
  // And the first user is still right.
  assert.ok(Math.abs(costs.get("ji-pai")!.perUnit - 0.3) < 1e-9);
});

test("three deep still adds up", () => {
  const deep = [...batches, batch("marinade", 100)];
  const deepLines = [...lines, sub("marinade", "ji-pai", 200)];
  const costs = costBatches(deep, deepLines, ingredients);
  // 200g of ji pai at ₱0.30/g = ₱60, over a 100g yield = ₱0.60/g.
  assert.ok(Math.abs(costs.get("marinade")!.perUnit - 0.6) < 1e-9);
});

/* ── The ways it can go wrong ───────────────────────────────────────────── */

test("a loop is reported, not hung on", () => {
  // Butter uses ji pai uses butter. However it got entered, the page must
  // still render. Before the cycle guard this recursed for ever.
  const looped = [...lines, sub("liquid-butter", "ji-pai", 10)];
  const costs = costBatches(batches, looped, ingredients);
  const all = [...costs.values()];
  assert.equal(all.length, 2);
  assert.ok(
    all.some((c) => c.problems.some((p) => /made of each other/.test(p))),
    "says the two are made of each other"
  );
});

test("a loop does not silently cost zero", () => {
  const looped = [...lines, sub("liquid-butter", "ji-pai", 10)];
  const costs = costBatches(batches, looped, ingredients);
  const circular = [...costs.values()]
    .flatMap((c) => c.lines)
    .find((l) => l.problem === "Circular recipe");
  // The line is there, named, and flagged — not quietly absent, which would
  // make the batch look cheaper than it is.
  assert.ok(circular, "the circular line is shown");
  assert.equal(circular!.cost, 0);
});

test("a line pointing at a deleted batch says so", () => {
  const dangling = [...lines, sub("ji-pai", "gone", 5)];
  const jiPai = costBatches(batches, dangling, ingredients).get("ji-pai")!;
  assert.ok(jiPai.problems.some((p) => /deleted batch/.test(p)));
  assert.equal(jiPai.lines.find((l) => l.label === "Deleted batch")!.cost, 0);
});

test("a sub-batch with no recipe of its own is flagged, not costed at zero", () => {
  const empty = [...batches, batch("mystery", 100)];
  const usingEmpty = [...lines, sub("ji-pai", "mystery", 10)];
  const jiPai = costBatches(empty, usingEmpty, ingredients).get("ji-pai")!;
  assert.ok(jiPai.problems.some((p) => /no price of its own/.test(p)));
});

test("a repack used inside a batch contributes its typed-in cost", () => {
  // A repack has no recipe by design — its cost per unit is typed in. Used
  // inside another batch it must still carry that number.
  const repack: Batch = { ...batch("repack", 100), manual_cost_per_unit: 2 };
  const costs = costBatches(
    [...batches, repack],
    [...lines, sub("ji-pai", "repack", 50)],
    ingredients
  );
  // ₱200 chicken + ₱100 butter + ₱100 repack = ₱400 over 1000g.
  assert.equal(costs.get("ji-pai")!.total, 400);
});

/* ── And that a dish on top of all this is still right ──────────────────── */

test("a dish using the nested batch is priced from the whole chain", () => {
  const meals: Meal[] = [
    {
      id: "jipai-rice",
      name: "Ji Pai Rice",
      price: 120,
      kind: "dish",
      categories: null,
      is_public: true,
      is_available: true,
      image_url: null,
    },
  ];
  const mealLines: MealIngredient[] = [
    { meal_id: "jipai-rice", ref_type: "batch", ref_id: "ji-pai", qty: 150 },
  ];
  const costs = costMeals(
    meals,
    mealLines,
    [],
    ingredients,
    costBatches(batches, lines, ingredients)
  );
  // 150g of ji pai at ₱0.30/g = ₱45, and the butter inside it is counted
  // once on the way through — not once in the batch and again in the dish.
  const dish = costs.get("jipai-rice")!;
  assert.ok(Math.abs(dish.cost - 45) < 1e-9);
  assert.equal(dish.costed, true);
});
