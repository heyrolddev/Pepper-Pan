import test from "node:test";
import assert from "node:assert/strict";
import {
  limitingFor,
  makeableServings,
  type Batch,
  type Ingredient,
  type MealComponent,
  type MealIngredient,
} from "../src/lib/costing.ts";

/**
 * Why a dish is out, not just that it is.
 *
 * A cashier reading NO STOCK has a customer in front of them. "No stock"
 * answers neither of the two questions they actually have — what are we out
 * of, and can somebody go and make more — so the badge gets ignored and the
 * shop sells something it cannot cook.
 */

const ing = (id: string, stock: number): Ingredient => ({
  id,
  name: id,
  unit: "g",
  cost: 1,
  stock,
  reorder: 0,
  purchase_price: 0,
  purchase_qty: 0,
  categories: null,
});

const bat = (id: string, stock: number): Batch => ({
  id,
  name: id,
  yield_qty: 1000,
  yield_unit: "g",
  batch_stock: stock,
  reorder_level: 0,
  manual_cost_per_unit: null,
});

const line = (mealId: string, kind: string, refId: string, qty: number): MealIngredient => ({
  meal_id: mealId,
  ref_type: kind,
  ref_id: refId,
  qty,
});

const ingredients = [ing("noodles", 1000), ing("chicken", 150)];
const batches = [bat("sauce", 400)];
const recipe = [
  line("dish", "inv", "noodles", 100), // allows 10
  line("dish", "inv", "chicken", 50), //  allows 3  ← the binding one
  line("dish", "batch", "sauce", 40), //  allows 10
];

test("the tightest line comes first", () => {
  const [first] = limitingFor("dish", recipe, [], ingredients, batches);
  assert.equal(first.label, "chicken");
  assert.equal(first.allows, 3);
});

test("it agrees with how many the dish says it can make", () => {
  // Two functions, one answer. If these ever disagree the badge and the
  // explanation behind it are telling the cashier different things.
  const lines = limitingFor("dish", recipe, [], ingredients, batches);
  const tightest = Math.min(...lines.map((l) => l.allows));
  assert.equal(tightest, makeableServings("dish", recipe, [], ingredients, batches));
});

test("every line is listed, not only the short one", () => {
  // The cashier may be about to sell four, and "chicken allows 3, sauce
  // allows 10" is the sentence that lets them say so.
  const lines = limitingFor("dish", recipe, [], ingredients, batches);
  assert.equal(lines.length, 3);
  assert.deepEqual(
    lines.map((l) => l.label),
    ["chicken", "noodles", "sauce"]
  );
});

test("a batch reads as a batch, so somebody knows to go and cook it", () => {
  const sauce = limitingFor("dish", recipe, [], ingredients, batches).find(
    (l) => l.label === "sauce"
  )!;
  assert.equal(sauce.kind, "batch");
  assert.equal(sauce.have, 400);
});

test("nothing on the shelf reads as zero servings, not as an empty list", () => {
  const empty = [ing("noodles", 0), ing("chicken", 0)];
  const lines = limitingFor("dish", recipe, [], empty, [bat("sauce", 0)]);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].allows, 0);
});

test("a line pointing at something deleted is not reported as a shortage", () => {
  // A broken recipe is a data problem the costing screens already name. A
  // cashier told "we're out of (nothing)" learns nothing and trusts the badge
  // less next time.
  const dangling = [...recipe, line("dish", "inv", "gone", 10)];
  const lines = limitingFor("dish", dangling, [], ingredients, batches);
  assert.equal(lines.length, 3);
});

test("a combo reports the part that is actually short", () => {
  const parts: MealComponent[] = [{ meal_id: "combo", component_meal_id: "dish", qty: 2 }];
  const lines = limitingFor("combo", recipe, parts, ingredients, batches);
  // Two dishes per combo, so 50g of chicken each becomes 100g — 150g on the
  // shelf allows one combo, not three.
  const chicken = lines.find((l) => l.label === "chicken")!;
  assert.equal(chicken.need, 100);
  assert.equal(chicken.allows, 1);
  assert.equal(lines[0].label, "chicken");
});

test("a combo containing itself stops instead of looping", () => {
  const parts: MealComponent[] = [{ meal_id: "combo", component_meal_id: "combo", qty: 1 }];
  assert.deepEqual(limitingFor("combo", [], parts, ingredients, batches), []);
});

test("a dish with no recipe has nothing holding it back", () => {
  assert.deepEqual(limitingFor("mystery", recipe, [], ingredients, batches), []);
});
