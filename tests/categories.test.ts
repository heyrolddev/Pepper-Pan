import test from "node:test";
import assert from "node:assert/strict";
import { cleanCategories } from "../src/lib/categories.ts";

/**
 * What a dish is actually saved with.
 *
 * The whole point of the categories table is that "Chicken", "chicken" and
 * "Chicken " do not become three filter pills on a customer's screen. Now
 * that a dish can carry several, the same mess can happen inside one dish —
 * two chips that look identical and behave as separate things.
 */

test("blanks and whitespace are dropped", () => {
  assert.deepEqual(cleanCategories(["Chicken", "", "   ", "Rice"]), ["Chicken", "Rice"]);
  assert.deepEqual(cleanCategories([]), []);
  assert.deepEqual(cleanCategories(undefined), []);
});

test("names are trimmed", () => {
  assert.deepEqual(cleanCategories(["  Chicken  ", "Rice "]), ["Chicken", "Rice"]);
});

test("the same name in a different case is one category, not two", () => {
  assert.deepEqual(cleanCategories(["Chicken", "chicken", "CHICKEN"]), ["Chicken"]);
});

test("the first spelling is the one kept", () => {
  // Not the last, and not lowercased: whatever the owner typed first is what
  // they meant the menu to read.
  assert.deepEqual(cleanCategories(["chicken", "Chicken"]), ["chicken"]);
  assert.deepEqual(cleanCategories(["Rice Meals", "rice meals"]), ["Rice Meals"]);
});

test("order survives, because the first one leads", () => {
  // A dish shows one category anywhere there is no room for three, and that
  // one is the first — so reordering silently would change what the dish
  // reads as on the menu.
  assert.deepEqual(
    cleanCategories(["Bestseller", "Chicken", "Rice"]),
    ["Bestseller", "Chicken", "Rice"]
  );
});

test("a dish can carry several, which is the point", () => {
  const many = ["Chicken", "Rice Meals", "Bestseller", "Spicy"];
  assert.deepEqual(cleanCategories(many), many);
});

test("trailing space does not create a second category", () => {
  // The exact bug the categories table was built to stop, now possible
  // inside a single dish.
  assert.deepEqual(cleanCategories(["Chicken", "Chicken "]), ["Chicken"]);
});
