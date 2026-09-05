import test from "node:test";
import assert from "node:assert/strict";
import {
  categoriesUsed,
  cleanCategories,
  countByCategory,
  inCategory,
} from "../src/lib/categories.ts";

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

/* ------------------------------------------------------------------ *
 * Grouping dishes by category
 *
 * Three screens ask these questions — the customer's menu, the till, and the
 * chip counts in HQ — and each of them once answered with `categoryOf`, which
 * returns only a dish's FIRST category. That produced a chip reading
 * "Ji Wings 0" beside a Ji Wings dish, and a till where that dish could not
 * be found under Ji Wings mid-order.
 *
 * These test the shared functions rather than a copy, which is the point:
 * the bug survived two screens because the fix was written inline in the
 * third.
 * ------------------------------------------------------------------ */

/** The dish that started it: a Ji Wings dish whose first category is Mains. */
const jiWings = { categories: ["Mains", "Ji Wings"] };

test("a dish is in every category it carries, not just the first", () => {
  assert.equal(inCategory(jiWings, "Mains"), true);
  assert.equal(inCategory(jiWings, "Ji Wings"), true, "the reported bug");
  assert.equal(inCategory(jiWings, "Drinks"), false);
});

test("a category holding a dish never counts zero", () => {
  const counts = countByCategory([jiWings]);
  assert.equal(counts["Ji Wings"], 1, "counted 0 before this");
  assert.equal(counts["Mains"], 1);
});

test("counts deliberately sum to more than the number of dishes", () => {
  // A dish in two categories is in both. The chip asks "how many dishes are
  // in here", and that is the honest answer to it.
  const counts = countByCategory([jiWings, { categories: ["Drinks"] }]);
  const total = Object.values(counts).reduce((n, c) => n + c, 0);
  assert.equal(total, 3, "two dishes, three memberships");
});

test("an untagged dish counts nowhere and matches nothing but All", () => {
  assert.deepEqual(countByCategory([{ categories: [] }]), {});
  assert.equal(inCategory({ categories: null }, "Mains"), false);
});

test("pills come from the dishes, not from the categories table", () => {
  // A menu imported from elsewhere has categories on its dishes and no rows
  // in `menu_categories`; the filter bar used to hide itself entirely.
  assert.deepEqual(
    categoriesUsed([{ categories: ["Mains"] }, { categories: ["Drinks"] }]),
    ["Drinks", "Mains"]
  );
});

test("the shop's own order wins, and the rest follow alphabetically", () => {
  const meals = [
    { categories: ["Sides"] },
    { categories: ["Drinks"] },
    { categories: ["Mains"] },
  ];
  const known = [{ name: "Mains" }, { name: "Drinks" }];
  assert.deepEqual(categoriesUsed(meals, known), ["Mains", "Drinks", "Sides"]);
});

test("a category with a row but no dish does not become a pill", () => {
  // An empty pill is a promise the menu cannot keep.
  assert.deepEqual(
    categoriesUsed([{ categories: ["Mains"] }], [{ name: "Mains" }, { name: "Desserts" }]),
    ["Mains"]
  );
});

test("blank and whitespace categories are ignored everywhere", () => {
  assert.deepEqual(categoriesUsed([{ categories: ["  ", "", " Mains "] }]), ["Mains"]);
  assert.deepEqual(countByCategory([{ categories: ["  ", "Mains"] }]), { Mains: 1 });
  assert.equal(inCategory({ categories: [" Mains "] }, "Mains"), true);
});
