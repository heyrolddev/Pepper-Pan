import test from "node:test";
import assert from "node:assert/strict";

import {
  ATWATER,
} from "../src/lib/nutrition.ts";
import {
  REFERENCE,
  allFoods,
  matchFood,
  normalise,
  suggestFor,
} from "../src/lib/nutrition-reference.ts";

test("every entry has a unique key", () => {
  const keys = REFERENCE.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("no keyword is claimed by two different foods", () => {
  // Two foods answering to "pork" would make the match order decide a figure,
  // and the match order is not a decision anybody made.
  const owner = new Map<string, string>();
  for (const f of REFERENCE) {
    for (const k of f.aka) {
      const already = owner.get(k);
      assert.equal(already, undefined, `"${k}" is claimed by both ${already} and ${f.key}`);
      owner.set(k, f.key);
    }
  }
});

test("every figure is plausible against its own macros", () => {
  // Energy has to come from somewhere. Atwater is not exact — fibre, alcohol
  // and rounding all move it — but a figure more than 25% away from what its
  // own protein, carbs and fat imply is a typo, not a subtlety.
  for (const f of REFERENCE) {
    const { kcal, protein, carbs, fat } = f.macros;
    const implied = protein * ATWATER.protein + carbs * ATWATER.carbs + fat * ATWATER.fat;
    if (kcal === 0 && implied === 0) continue;
    if (f.atwaterExempt) continue;
    const gap = Math.abs(kcal - implied) / Math.max(kcal, implied, 1);
    assert.ok(gap < 0.25, `${f.key}: ${kcal} kcal but macros imply ${implied.toFixed(0)}`);
  }
});

test("no macro exceeds what 100 g can physically hold", () => {
  for (const f of REFERENCE) {
    const { protein, carbs, fat } = f.macros;
    if (f.basis === "each") continue;
    assert.ok(protein + carbs + fat <= 101, `${f.key} has ${protein + carbs + fat} g in 100 g`);
  }
});

/* ---- matching ---- */

test("names are matched however they are punctuated", () => {
  assert.equal(normalise("Pork Belly (liempo)"), "pork belly liempo");
  assert.equal(matchFood("Pork Belly (liempo)")?.key, "pork-belly");
  assert.equal(matchFood("PORK  BELLY")?.key, "pork-belly");
});

test("the longest keyword wins, not the first", () => {
  // The bug this rule exists for: pork belly is 518 kcal and lean pork is
  // 180. Matching "pork" first would treble a dish's calories in silence.
  assert.equal(matchFood("Pork belly")?.key, "pork-belly");
  assert.equal(matchFood("Ground pork")?.key, "pork-ground");
  assert.equal(matchFood("Chicken breast fillet")?.key, "chicken-breast");
  assert.equal(matchFood("Chicken")?.key, "chicken-whole");
});

test("raw rice and cooked rice are not the same food", () => {
  // 365 against 130. A recipe written in raw grams costed at the cooked
  // figure understates a rice meal by nearly two thirds.
  assert.equal(matchFood("Rice")?.key, "rice-raw");
  assert.equal(matchFood("Cooked rice")?.key, "rice-cooked");
  assert.equal(matchFood("Kanin")?.key, "rice-cooked");
});

test("Filipino names find the same food as English ones", () => {
  assert.equal(matchFood("Togue")?.key, "beansprouts");
  assert.equal(matchFood("Bawang")?.key, "garlic");
  assert.equal(matchFood("Toyo")?.key, "soy-sauce");
  assert.equal(matchFood("Itlog")?.key, "egg");
  assert.equal(matchFood("Mantika")?.key, "oil");
});

test("packaging is matched and is honestly zero", () => {
  const box = matchFood("Takeout box");
  assert.equal(box?.key, "packaging");
  assert.deepEqual(box?.macros, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("something not in the table says so rather than guessing", () => {
  assert.equal(matchFood("Dragonfruit syrup"), null);
  assert.equal(suggestFor("Dragonfruit syrup", "ml"), null);
});

/* ---- basis ---- */

test("a per-100g food on a gram ingredient fits", () => {
  const s = suggestFor("Pork belly", "g")!;
  assert.equal(s.fits, true);
  assert.equal(s.typed.kcal, 518);
});

test("a per-100g food on a piece-counted ingredient does not fit, and says so", () => {
  // Not wrong so much as unanswerable: nobody but the shop knows what one
  // piece weighs. Offered anyway — an owner who knows a portion is 80 g can
  // scale it — but the screen has to say it.
  const s = suggestFor("Pork belly", "pc")!;
  assert.equal(s.fits, false);
});

test("an egg is per egg, and fits a piece count", () => {
  const s = suggestFor("Egg", "pc")!;
  assert.equal(s.food.basis, "each");
  assert.equal(s.fits, true);
  assert.equal(s.typed.kcal, 72);
});

test("a liquid reference also fits an ingredient weighed in grams", () => {
  // Soy sauce bought by weight is still soy sauce; water is close enough to
  // 1 g per ml that refusing would be pedantry with no upside.
  assert.equal(suggestFor("Toyo", "g")!.fits, true);
  assert.equal(suggestFor("Toyo", "ml")!.fits, true);
});

test("the picker lists everything, sorted", () => {
  const all = allFoods();
  assert.equal(all.length, REFERENCE.length);
  // Compared with the same comparator the sort used. A default `.sort()` is
  // codepoint order, which disagrees with `localeCompare` the moment a label
  // starts with a capital — so the first version of this test failed on a
  // list that was correctly sorted.
  for (let i = 1; i < all.length; i += 1) {
    assert.ok(
      all[i - 1].label.localeCompare(all[i].label) <= 0,
      `${all[i - 1].label} came before ${all[i].label}`
    );
  }
});

test("an exempt entry has to say why", () => {
  // The escape hatch from the plausibility check, guarded so it cannot become
  // the place a typo goes to hide.
  for (const f of REFERENCE) {
    if (!f.atwaterExempt) continue;
    assert.ok(f.atwaterExempt.length > 20, `${f.key} claims an exemption without a reason`);
  }
  assert.equal(REFERENCE.filter((f) => f.atwaterExempt).length, 1);
});
