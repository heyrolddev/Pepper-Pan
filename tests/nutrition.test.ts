import test from "node:test";
import assert from "node:assert/strict";

import {
  energyFromMacros,
  entryBasis,
  fromPerUnit,
  toPerUnit,
  isComplete,
  macroSplit,
  nutritionOf,
  round,
  type PerUnit,
  type RollupInput,
} from "../src/lib/nutrition.ts";

/**
 * What is in a dish.
 *
 * The rule these exist to hold is the incomplete one. Nobody fills in forty
 * ingredients in an afternoon, so for weeks a dish will have nutrition on
 * some of its lines and not others — and the sum of the ones that are filled
 * in is CONFIDENTLY TOO LOW. On a menu read by somebody counting calories
 * that is worse than showing nothing, and it looks exactly like a right
 * answer. So every figure carries what it is missing, and nothing
 * customer-facing renders until that is zero.
 *
 * Numbers below are a Giant Ji Pai: a marinated chicken pack out of a batch,
 * breading, and a slice of cheese.
 */

const per = (kcal: number, protein: number, carbs: number, fat: number): PerUnit => ({
  kcal, protein, carbs, fat,
});

function base(): RollupInput {
  return {
    mealLines: new Map(),
    mealParts: new Map(),
    batchLines: new Map(),
    batchYield: new Map(),
    perIngredient: new Map(),
    nameOf: new Map(),
  };
}

test("a dish adds up its ingredients, each times what the recipe takes", () => {
  const input = base();
  // per gram
  input.perIngredient.set("breading", per(3.6, 0.1, 0.76, 0.01));
  input.perIngredient.set("cheese", per(60, 3.4, 0.5, 5));
  input.mealLines.set("giant", [
    { ref_type: "inv", ref_id: "breading", qty: 60 },
    { ref_type: "inv", ref_id: "cheese", qty: 1 },
  ]);

  const out = nutritionOf(["giant"], input).get("giant")!;
  assert.equal(out.missing, 0);
  assert.equal(round(out.per).kcal, Math.round(3.6 * 60 + 60));
  assert.equal(round(out.per).protein, Math.round(0.1 * 60 + 3.4));
});

test("an ingredient with no nutrition is named, not skipped in silence", () => {
  const input = base();
  input.perIngredient.set("breading", per(3.6, 0.1, 0.76, 0.01));
  input.nameOf.set("taktak", "Taktak");
  input.mealLines.set("giant", [
    { ref_type: "inv", ref_id: "breading", qty: 60 },
    { ref_type: "inv", ref_id: "taktak", qty: 6 },
  ]);

  const out = nutritionOf(["giant"], input).get("giant")!;
  assert.equal(out.missing, 1);
  assert.deepEqual(out.missingNames, ["Taktak"]);
});

test("an incomplete figure is never fit to show a customer", () => {
  // The whole point. The sum exists and is too low; isComplete is the gate.
  const input = base();
  input.perIngredient.set("breading", per(3.6, 0.1, 0.76, 0.01));
  input.nameOf.set("taktak", "Taktak");
  input.mealLines.set("giant", [
    { ref_type: "inv", ref_id: "breading", qty: 60 },
    { ref_type: "inv", ref_id: "taktak", qty: 6 },
  ]);

  const out = nutritionOf(["giant"], input).get("giant")!;
  assert.ok(out.per.kcal > 0, "there is a number");
  assert.equal(isComplete(out), false, "and it must not be shown");
});

test("a batch contributes one yield unit at a time, not a whole batch", () => {
  const input = base();
  // One run of the marinade: 2000 g of chicken, yielding 13 packs.
  input.perIngredient.set("chicken", per(2.4, 0.27, 0, 0.14));
  input.batchLines.set("m-giant", [{ ref_type: "inv", ref_id: "chicken", qty: 2000 }]);
  input.batchYield.set("m-giant", 13);
  input.mealLines.set("giant", [{ ref_type: "batch", ref_id: "m-giant", qty: 1 }]);

  const out = nutritionOf(["giant"], input).get("giant")!;
  assert.equal(out.missing, 0);
  // One pack is one thirteenth of the run.
  assert.equal(round(out.per).kcal, Math.round((2.4 * 2000) / 13));
});

test("a batch with no yield recorded is unknown, not infinite", () => {
  const input = base();
  input.perIngredient.set("chicken", per(2.4, 0.27, 0, 0.14));
  input.batchLines.set("m-giant", [{ ref_type: "inv", ref_id: "chicken", qty: 2000 }]);
  input.batchYield.set("m-giant", 0);
  input.nameOf.set("m-giant", "M. Giant Ji Pai");
  input.mealLines.set("giant", [{ ref_type: "batch", ref_id: "m-giant", qty: 1 }]);

  const out = nutritionOf(["giant"], input).get("giant")!;
  assert.ok(Number.isFinite(out.per.kcal), "dividing by zero yield escaped");
  assert.deepEqual(out.missingNames, ["M. Giant Ji Pai"]);
});

test("a combo adds up the dishes inside it", () => {
  const input = base();
  input.perIngredient.set("rice", per(1.3, 0.027, 0.28, 0.003));
  input.perIngredient.set("cheese", per(60, 3.4, 0.5, 5));
  input.mealLines.set("rice-cup", [{ ref_type: "inv", ref_id: "rice", qty: 200 }]);
  input.mealLines.set("giant", [{ ref_type: "inv", ref_id: "cheese", qty: 1 }]);
  input.mealParts.set("combo", [
    { component_meal_id: "giant", qty: 1 },
    { component_meal_id: "rice-cup", qty: 2 },
  ]);
  input.mealLines.set("combo", []);

  const out = nutritionOf(["combo"], input).get("combo")!;
  assert.equal(out.missing, 0);
  assert.equal(round(out.per).kcal, Math.round(60 + 1.3 * 200 * 2));
});

test("a combo that contains itself gives a number and stops", () => {
  const input = base();
  input.mealLines.set("loop", []);
  input.mealParts.set("loop", [{ component_meal_id: "loop", qty: 1 }]);
  const out = nutritionOf(["loop"], input).get("loop")!;
  assert.ok(Number.isFinite(out.per.kcal));
  assert.ok(out.missing > 0, "a loop must not report as a complete figure");
});

test("a batch that contains itself does the same", () => {
  const input = base();
  input.batchYield.set("a", 10);
  input.batchLines.set("a", [{ ref_type: "batch", ref_id: "a", qty: 1 }]);
  input.mealLines.set("dish", [{ ref_type: "batch", ref_id: "a", qty: 1 }]);
  const out = nutritionOf(["dish"], input).get("dish")!;
  assert.ok(Number.isFinite(out.per.kcal));
  assert.ok(out.missing > 0);
});

test("a dish with no recipe is unknown, not zero calories", () => {
  // "0 kcal" is a claim. Nobody made it.
  const input = base();
  input.mealLines.set("bare", []);
  const out = nutritionOf(["bare"], input).get("bare")!;
  assert.equal(isComplete(out), false);
  assert.deepEqual(out.missingNames, ["No recipe yet"]);
});

test("the owner's own numbers win over the recipe, and count as complete", () => {
  const input = base();
  input.nameOf.set("taktak", "Taktak");
  input.mealLines.set("bottled", [{ ref_type: "inv", ref_id: "taktak", qty: 1 }]);
  input.override = new Map([["bottled", { kcal: 140, protein: 0, carbs: 35, fat: 0 }]]);

  const out = nutritionOf(["bottled"], input).get("bottled")!;
  assert.equal(out.per.kcal, 140);
  assert.equal(out.manual, true);
  assert.equal(isComplete(out), true, "a bought-in drink reads its own label");
});

test("macros with no energy typed get the energy worked out", () => {
  // 4 kcal a gram for protein and carbs, 9 for fat — how every food label in
  // the world is produced. Making somebody type a fourth number they would
  // only be computing from the other three is a way to get it wrong.
  assert.equal(energyFromMacros({ kcal: 0, protein: 10, carbs: 20, fat: 5 }), 165);

  const input = base();
  input.override = new Map([["x", { kcal: null, protein: 10, carbs: 20, fat: 5 }]]);
  input.mealLines.set("x", []);
  assert.equal(nutritionOf(["x"], input).get("x")!.per.kcal, 165);
});

test("the macro bar always fills exactly, never 99 or 101", () => {
  for (const n of [
    { kcal: 0, protein: 10, carbs: 20, fat: 5 },
    { kcal: 0, protein: 7, carbs: 7, fat: 7 },
    { kcal: 0, protein: 1, carbs: 0, fat: 0 },
    { kcal: 0, protein: 33, carbs: 33, fat: 11 },
  ]) {
    const s = macroSplit(n);
    assert.equal(s.protein + s.carbs + s.fat, 100, `${JSON.stringify(n)} -> ${JSON.stringify(s)}`);
  }
});

test("a dish with nothing in it produces an empty bar, not NaN", () => {
  assert.deepEqual(macroSplit({ kcal: 0, protein: 0, carbs: 0, fat: 0 }), {
    protein: 0, carbs: 0, fat: 0,
  });
});

test("junk in an ingredient's nutrition does not poison the total", () => {
  const input = base();
  input.perIngredient.set("odd", { kcal: NaN, protein: -5, carbs: null, fat: 2 });
  input.mealLines.set("d", [{ ref_type: "inv", ref_id: "odd", qty: 10 }]);
  const out = nutritionOf(["d"], input).get("d")!;
  assert.ok(Number.isFinite(out.per.kcal), "NaN reached the total");
  assert.ok(out.per.protein >= 0, "a negative gram count got through");
  assert.equal(out.per.fat, 20);
});

test("one missing ingredient used twice is reported once", () => {
  const input = base();
  input.nameOf.set("oil", "CC. OIL");
  input.mealLines.set("d", [
    { ref_type: "inv", ref_id: "oil", qty: 5 },
    { ref_type: "inv", ref_id: "oil", qty: 7 },
  ]);
  const out = nutritionOf(["d"], input).get("d")!;
  assert.deepEqual(out.missingNames, ["CC. OIL"]);
  assert.equal(out.missing, 1);
});

/* ---------------- typing it in ---------------- */

test("weight and volume are entered the way the packet prints them", () => {
  // "368 kcal per 100 g" off the bag, not 3.68 per gram.
  assert.equal(entryBasis("g"), 100);
  assert.equal(entryBasis("ml"), 100);
  assert.equal(entryBasis(" G "), 100);
});

test("counted things are entered per one", () => {
  assert.equal(entryBasis("pc"), 1);
  assert.equal(entryBasis("pack"), 1);
  assert.equal(entryBasis("slice"), 1);
});

test("an unrecognised unit is per one, not per hundred", () => {
  // A wrong guess towards 100 scales a real figure by a hundred and looks
  // plausible. Per one is at worst a mismatch the owner can see.
  assert.equal(entryBasis("kg"), 1);
  assert.equal(entryBasis(null), 1);
  assert.equal(entryBasis("bottle"), 1);
});

test("what is typed and what is stored are the same number again", () => {
  for (const unit of ["g", "pc", "kg", "ml"]) {
    for (const typed of [0, 12, 368, 0.5]) {
      const back = fromPerUnit(toPerUnit(typed, unit), unit);
      assert.ok(Math.abs((back ?? 0) - typed) < 1e-9, `${typed} per ${unit} came back as ${back}`);
    }
  }
});

test("a per-100 figure divides down before it multiplies a recipe", () => {
  // 368 kcal per 100 g of breading, 60 g in the dish, is 220.8 — not 22,080.
  const input = base();
  input.perIngredient.set("breading", {
    kcal: toPerUnit(368, "g"), protein: null, carbs: null, fat: null,
  });
  input.mealLines.set("d", [{ ref_type: "inv", ref_id: "breading", qty: 60 }]);
  assert.equal(round(nutritionOf(["d"], input).get("d")!.per).kcal, 221);
});

test("blank and nonsense stay blank rather than becoming zero", () => {
  // Zero is a claim — "this has no calories". Null is "nobody has said".
  assert.equal(toPerUnit(null, "g"), null);
  assert.equal(toPerUnit(NaN, "g"), null);
  assert.equal(toPerUnit(-5, "g"), null);
  assert.equal(fromPerUnit(null, "g"), null);
});
