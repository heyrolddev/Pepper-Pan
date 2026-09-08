import test from "node:test";
import assert from "node:assert/strict";
import {
  categoriesUsed,
  cleanCategories,
  countByCategory,
  inCategory,
  menuRank,
  orderForMenu,
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

/* ============================================================
 * The order the menu opens in
 *
 * The bug these guard against had a screenshot: the customer menu, "All"
 * selected, and the first four cards were 1.5 Coke, 1.5 Sprite, a milktea
 * and an iced americano. A shop that sells Taiwan-style black pepper noodles
 * opened on two litres of soft drink.
 *
 * Nobody chose that. It was `order by name` from the database showing
 * through, and names beginning with digits sort before names beginning with
 * letters. The fix is that the grid reads the same ordered category list the
 * filter pills are drawn from.
 * ============================================================ */

/** The shop's order, food first — what migration 0040 sets. */
const SHOP_ORDER = [
  "Mains",
  "Ji Pai",
  "Solo",
  "Burger",
  "Premium Sides",
  "Coffee",
  "Milktea",
  "Raspberry",
  "Soft drinks",
  "Drinks",
];

const dish = (name: string, ...categories: string[]) => ({ name, categories });

/** The menu from the screenshot, near enough. */
const MENU = [
  dish("1.5 Coke", "Drinks", "Soft drinks"),
  dish("1.5 Sprite", "Drinks", "Soft drinks"),
  dish("16oz Brown Sugar Milktea", "Drinks", "Milktea"),
  dish("16oz Iced Americano", "Drinks", "Coffee"),
  dish("Black Pepper Noodles", "Mains"),
  dish("Ji Pai Chicken", "Ji Pai"),
  dish("Solo Rice Meal", "Solo"),
  dish("Pepper Burger", "Burger"),
];

const namesOf = (rows: { name: string }[]) => rows.map((r) => r.name);

test("the screenshot: sorting by name alone puts the soft drinks first", () => {
  // Not a test of our code — a test of the thing we replaced, so the reason
  // this file exists stays legible.
  const byName = [...MENU].sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(namesOf(byName).slice(0, 3), [
    "1.5 Coke",
    "1.5 Sprite",
    "16oz Brown Sugar Milktea",
  ]);
});

test("the food leads and the soft drinks come last", () => {
  const ordered = namesOf(orderForMenu(MENU, SHOP_ORDER));
  assert.deepEqual(ordered, [
    "Black Pepper Noodles",
    "Ji Pai Chicken",
    "Solo Rice Meal",
    "Pepper Burger",
    "16oz Iced Americano",
    "16oz Brown Sugar Milktea",
    "1.5 Coke",
    "1.5 Sprite",
  ]);
});

test("a drink files under what it actually is, not under the umbrella", () => {
  // The reason "Drinks" is placed last. Nearly every drink carries it as a
  // second tag, so a "Drinks" ranked early would collapse coffee, milktea and
  // soft drinks into one block and lose the order the shop asked for.
  const order = new Map(SHOP_ORDER.map((n, i) => [n, i]));
  assert.equal(
    menuRank(dish("16oz Brown Sugar Milktea", "Drinks", "Milktea"), order),
    SHOP_ORDER.indexOf("Milktea")
  );
  assert.equal(
    menuRank(dish("1.5 Coke", "Drinks", "Soft drinks"), order),
    SHOP_ORDER.indexOf("Soft drinks")
  );
});

test("a drink tagged only Drinks still lands at the end", () => {
  const withPlain = [...MENU, dish("Bottled Water", "Drinks")];
  assert.equal(namesOf(orderForMenu(withPlain, SHOP_ORDER)).at(-1), "Bottled Water");
});

test("tag order on the dish makes no difference", () => {
  // The owner cannot see which of a dish's categories is first, so it must
  // not be what decides where the dish appears.
  const a = orderForMenu([dish("X", "Drinks", "Milktea")], SHOP_ORDER);
  const b = orderForMenu([dish("X", "Milktea", "Drinks")], SHOP_ORDER);
  const order = new Map(SHOP_ORDER.map((n, i) => [n, i]));
  assert.equal(menuRank(a[0], order), menuRank(b[0], order));
});

test("a dish in no known category sorts last, not first", () => {
  const rows = [dish("Mystery Item", "Nobody Set This Up"), dish("Ji Pai Chicken", "Ji Pai")];
  assert.deepEqual(namesOf(orderForMenu(rows, SHOP_ORDER)), [
    "Ji Pai Chicken",
    "Mystery Item",
  ]);
});

test("a dish with no categories at all sorts last too", () => {
  const rows = [{ name: "Untagged", categories: null }, dish("Ji Pai Chicken", "Ji Pai")];
  assert.deepEqual(namesOf(orderForMenu(rows, SHOP_ORDER)), [
    "Ji Pai Chicken",
    "Untagged",
  ]);
});

test("within one category, drink sizes read in the order a person says them", () => {
  const cups = [
    dish("22oz Milktea", "Milktea"),
    dish("8oz Milktea", "Milktea"),
    dish("16oz Milktea", "Milktea"),
  ];
  assert.deepEqual(namesOf(orderForMenu(cups, SHOP_ORDER)), [
    "8oz Milktea",
    "16oz Milktea",
    "22oz Milktea",
  ]);
});

test("no known categories at all is name order, not a crash", () => {
  assert.deepEqual(namesOf(orderForMenu(MENU, [])).slice(0, 2), ["1.5 Coke", "1.5 Sprite"]);
});

test("the caller's array is left alone", () => {
  const before = namesOf(MENU);
  orderForMenu(MENU, SHOP_ORDER);
  assert.deepEqual(namesOf(MENU), before);
});

test("the pills and the grid read the same list", () => {
  // `categoriesUsed` draws the filter row; `orderForMenu` takes its output.
  // If these two ever computed their order separately they would drift, and
  // the pills would claim an order the dishes below them did not follow.
  const known = SHOP_ORDER.map((name) => ({ name }));
  const pills = categoriesUsed(MENU, known);
  assert.deepEqual(pills.slice(0, 4), ["Mains", "Ji Pai", "Solo", "Burger"]);
  assert.equal(namesOf(orderForMenu(MENU, pills))[0], "Black Pepper Noodles");
});
