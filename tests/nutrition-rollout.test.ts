import test from "node:test";
import assert from "node:assert/strict";
import { rolloutOf, verdictText } from "../src/lib/nutrition-rollout.ts";
import type { DishNutrition } from "../src/lib/nutrition.ts";

const dish = (
  kcal: number,
  missing: string[] = [],
  manual = false
): DishNutrition => ({
  per: { kcal, protein: kcal / 40, carbs: kcal / 20, fat: kcal / 90 },
  missing: missing.length,
  missingNames: missing,
  manual,
});

const MEALS = [
  { id: "a", name: "Chicken Noodles" },
  { id: "b", name: "Chicken Rice" },
  { id: "c", name: "Ji Pai" },
  { id: "d", name: "Milktea" },
];

/**
 * The screen this came from: 44 ingredients filled, nothing on the menu.
 * Three different things can cause that and the owner could not see which.
 */

test("ready dishes with the switch off is the answer nobody was being given", () => {
  const n = new Map([
    ["a", dish(620)],
    ["b", dish(580)],
    ["c", dish(0, ["Frying Oil"])],
    ["d", dish(0, ["Tapioca Pearls", "Milk"])],
  ]);
  const r = rolloutOf(MEALS, n, false);

  assert.equal(r.verdict.kind, "switch-off");
  assert.deepEqual(
    r.ready.map((x) => x.name),
    ["Chicken Noodles", "Chicken Rice"]
  );
  const { headline, next } = verdictText(r.verdict);
  assert.match(headline, /2 of 4 dishes are ready/);
  assert.match(headline, /switched OFF/);
  // The instruction has to name the screen. "Turn it on" with no address is
  // how somebody ends up back on the Inventory tab pressing Fill again.
  assert.match(next, /Menu/);
});

test("the same figures with the switch on read as working", () => {
  const n = new Map([["a", dish(620)], ["b", dish(580)]]);
  const r = rolloutOf(MEALS.slice(0, 2), n, true);
  assert.deepEqual(r.verdict, { kind: "showing", ready: 2, total: 2 });
  assert.match(verdictText(r.verdict).headline, /Showing on 2 of 2/);
});

test("one blank ingredient blanks the whole dish, and is said so", () => {
  const n = new Map([["a", dish(0, ["Soy Sauce"])]]);
  const r = rolloutOf([MEALS[0]], n, true);
  assert.equal(r.verdict.kind, "nothing-ready");
  assert.deepEqual(r.ready, []);
  assert.match(verdictText(r.verdict).next, /a wrong number, not a low one/);
});

test("a dish with no recipe is not counted as blocked", () => {
  // It would sit at the top of "closest to done" with nothing to go and fill.
  const n = new Map([["a", dish(620)], ["b", dish(0, ["Rice"])]]);
  const r = rolloutOf(MEALS, n, true);
  assert.deepEqual(r.noRecipe.map((x) => x.name), ["Ji Pai", "Milktea"]);
  assert.deepEqual(r.blocked.map((x) => x.name), ["Chicken Rice"]);
  assert.deepEqual(r.ready.map((x) => x.name), ["Chicken Noodles"]);
});

test("a figure the owner typed by hand counts as complete", () => {
  const n = new Map([["a", dish(700, [], true)]]);
  const r = rolloutOf([MEALS[0]], n, true);
  assert.deepEqual(r.ready.map((x) => x.name), ["Chicken Noodles"]);
  assert.equal(r.ready[0].manual, true);
});

// ── the part that turns a status into a plan ──────────────────────────────

test("blockers are ranked by what filling them would actually unlock", () => {
  const n = new Map([
    // Three dishes each blocked ONLY by garlic: fill it and all three go live.
    ["a", dish(0, ["Garlic"])],
    ["b", dish(0, ["Garlic"])],
    ["c", dish(0, ["Garlic"])],
    // Milktea needs two things, so neither of them unlocks it alone.
    ["d", dish(0, ["Tapioca Pearls", "Milk"])],
  ]);
  const r = rolloutOf(MEALS, n, true);

  assert.deepEqual(r.blockers[0], { name: "Garlic", dishes: 3, unlocks: 3 });
  // Present, and correctly credited with unlocking nothing on its own.
  const pearls = r.blockers.find((b) => b.name === "Tapioca Pearls");
  assert.deepEqual(pearls, { name: "Tapioca Pearls", dishes: 1, unlocks: 0 });
});

test("an ingredient in many dishes but never alone ranks below one that frees a dish", () => {
  const n = new Map([
    ["a", dish(0, ["Salt", "Pepper"])],
    ["b", dish(0, ["Salt", "Sugar"])],
    ["c", dish(0, ["Salt", "Vinegar"])],
    ["d", dish(0, ["Milk"])],
  ]);
  const r = rolloutOf(MEALS, n, true);
  // Salt blocks three and frees none; Milk blocks one and frees it.
  assert.equal(r.blockers[0].name, "Milk");
  assert.equal(r.blockers[0].unlocks, 1);
  assert.equal(r.blockers[1].name, "Salt");
  assert.equal(r.blockers[1].dishes, 3);
  assert.equal(r.blockers[1].unlocks, 0);
});

test("one ingredient twice in a recipe is one thing to go and fill", () => {
  const n = new Map([["a", dish(0, ["Garlic", "Garlic"])]]);
  const r = rolloutOf([MEALS[0]], n, true);
  assert.deepEqual(r.blockers, [{ name: "Garlic", dishes: 1, unlocks: 1 }]);
});

test("an ingredient blocking nothing is not listed", () => {
  // Frying Oil is in a dish that is already complete, so it has figures.
  const n = new Map([["a", dish(620)], ["b", dish(0, ["Garlic"])]]);
  const r = rolloutOf(MEALS.slice(0, 2), n, true);
  assert.deepEqual(r.blockers.map((b) => b.name), ["Garlic"]);
});

test("closest to done is at the top of the blocked list", () => {
  const n = new Map([
    ["a", dish(0, ["A", "B", "C"])],
    ["b", dish(0, ["A"])],
    ["c", dish(0, ["A", "B"])],
  ]);
  const r = rolloutOf(MEALS.slice(0, 3), n, true);
  assert.deepEqual(r.blocked.map((x) => x.name), [
    "Chicken Rice",
    "Ji Pai",
    "Chicken Noodles",
  ]);
});

test("an empty menu says so rather than reading as a failure", () => {
  const r = rolloutOf([], new Map(), true);
  assert.deepEqual(r.verdict, { kind: "no-dishes" });
  assert.deepEqual(r.blockers, []);
});

test("a dish the rollup never saw is missing a recipe, not missing figures", () => {
  const r = rolloutOf(MEALS, new Map(), false);
  assert.equal(r.noRecipe.length, 4);
  assert.equal(r.blocked.length, 0);
  assert.equal(r.verdict.kind, "nothing-ready");
});

test("every verdict has both a headline and a next step", () => {
  const all = [
    { kind: "no-dishes" as const },
    { kind: "nothing-ready" as const, blocked: 3 },
    { kind: "switch-off" as const, ready: 2, total: 4 },
    { kind: "showing" as const, ready: 2, total: 4 },
  ];
  for (const v of all) {
    const { headline, next } = verdictText(v);
    assert.ok(headline.length > 0, `${v.kind} has no headline`);
    assert.ok(next.length > 0, `${v.kind} has no next step`);
  }
});
