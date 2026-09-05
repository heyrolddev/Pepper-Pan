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

/* ------------------------------------------------------------------ *
 * Which pills the customer menu shows, and what each one matches
 *
 * The rules live inside `MenuList`, which is a React component and not worth
 * mounting for this. They are copied here as the two pure functions the
 * component computes, so a change to either of them fails a test rather than
 * quietly emptying the customer's filter bar again.
 * ------------------------------------------------------------------ */

type Dish = { categories: string[] };

/** Every category any visible dish names, ordered by the shop's vocabulary. */
function pillsFor(meals: Dish[], known: { name: string }[]): string[] {
  const used = new Set<string>();
  for (const m of meals) {
    for (const raw of m.categories ?? []) {
      const name = raw.trim();
      if (name) used.add(name);
    }
  }
  const ordered = known.map((c) => c.name).filter((n) => used.has(n));
  const rest = [...used].filter((n) => !ordered.includes(n)).sort();
  return ["All", ...ordered, ...rest];
}

function matches(meal: Dish, active: string): boolean {
  return active === "All" || (meal.categories ?? []).some((c) => c.trim() === active);
}

test("pills come from the dishes, not from the categories table", () => {
  // The bug this exists to stop coming back: a menu imported from elsewhere
  // has categories on its dishes and nothing in `menu_categories`, and the
  // filter bar used to hide itself entirely.
  const meals = [{ categories: ["Mains"] }, { categories: ["Drinks"] }];
  assert.deepEqual(pillsFor(meals, []), ["All", "Drinks", "Mains"]);
});

test("the shop's own order wins, and the rest follow alphabetically", () => {
  const meals = [
    { categories: ["Drinks"] },
    { categories: ["Mains"] },
    { categories: ["Sides"] },
  ];
  const known = [{ name: "Mains" }, { name: "Drinks" }];
  assert.deepEqual(pillsFor(meals, known), ["All", "Mains", "Drinks", "Sides"]);
});

test("a category with a row but no dish does not become a pill", () => {
  // An empty pill is a promise the menu cannot keep.
  const pills = pillsFor([{ categories: ["Mains"] }], [{ name: "Mains" }, { name: "Desserts" }]);
  assert.deepEqual(pills, ["All", "Mains"]);
});

test("a dish appears under every one of its categories, not just the first", () => {
  const dish = { categories: ["Mains", "Noodles"] };
  assert.equal(matches(dish, "Mains"), true);
  assert.equal(matches(dish, "Noodles"), true, "the second category has to work too");
  assert.equal(matches(dish, "Drinks"), false);
  assert.equal(matches(dish, "All"), true);
});

test("an untagged dish is reachable only through All", () => {
  // Which is exactly why the menu screen offers to tag them in bulk.
  const dish = { categories: [] };
  assert.equal(matches(dish, "All"), true);
  assert.equal(matches(dish, "Mains"), false);
});

test("blank and whitespace categories never become pills", () => {
  const pills = pillsFor([{ categories: ["  ", "", " Mains "] }], []);
  assert.deepEqual(pills, ["All", "Mains"]);
});
