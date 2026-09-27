import test from "node:test";
import assert from "node:assert/strict";

import {
  cartKey,
  defaultVariant,
  extrasOf,
  isSized,
  liveVariants,
  offerable,
  openingChoice,
  optionSoldOut,
  resolveChoice,
  setVariant,
  toggleOption,
  variantPrice,
  variantSoldOut,
  type ModifierGroup,
  type ModifierOption,
  type OptionVariant,
} from "../src/lib/modifiers.ts";

const variant = (
  mealId: string,
  label: string,
  price: number,
  extra: Partial<OptionVariant> = {}
): OptionVariant => ({ mealId, label, price, available: true, sort: 0, ...extra });

const sized = (id: string, label: string, variants: OptionVariant[]): ModifierOption => ({
  id,
  label,
  mealId: null,
  variants,
  price: 0,
  available: true,
  maxQty: 1,
  sort: 0,
});

const plain = (id: string, label: string, price: number, mealId = `m-${id}`): ModifierOption => ({
  id,
  label,
  mealId,
  price,
  available: true,
  maxQty: 1,
  sort: 0,
});

const group = (options: ModifierOption[], over: Partial<ModifierGroup> = {}): ModifierGroup => ({
  id: "g-drink",
  name: "Choose your drink",
  helper: null,
  min: 1,
  max: 1,
  sort: 0,
  options,
  ...over,
});

const TEA = sized("o-tea", "Iced Tea", [
  variant("m-tea-r", "Regular", 0, { sort: 0 }),
  variant("m-tea-l", "Large", 15, { sort: 1 }),
]);

/* ---- the price rule ---- */

test("a per-size override beats everything", () => {
  assert.equal(variantPrice(15, 0, 45), 15);
});

test("the option's override covers every size when there is no per-size one", () => {
  assert.equal(variantPrice(null, 0, 45), 0);
});

test("with no override at all, the size's own dish price is charged", () => {
  assert.equal(variantPrice(null, null, 45), 45);
});

test("zero is a real answer at every step, not 'unset'", () => {
  // The combo case this whole table exists for: regular free, large ₱15.
  // A `||` chain instead of `??` would charge full price for the free one.
  assert.equal(variantPrice(0, null, 45), 0);
  assert.equal(variantPrice(null, 0, 45), 0);
});

test("nonsense falls through to zero rather than NaN on a receipt", () => {
  assert.equal(variantPrice(Number.NaN, null, null), 0);
  assert.equal(variantPrice(null, null, undefined), 0);
});

/* ---- sold out ---- */

test("one size running out does not take the drink off the menu", () => {
  const partly = sized("o-tea", "Iced Tea", [
    variant("m-tea-r", "Regular", 0, { makeable: 0 }),
    variant("m-tea-l", "Large", 15, { makeable: 4 }),
  ]);
  assert.equal(optionSoldOut(partly), false);
  assert.deepEqual(liveVariants(partly).map((v) => v.label), ["Large"]);
});

test("a sized option is sold out only when every size is", () => {
  const gone = sized("o-tea", "Iced Tea", [
    variant("m-tea-r", "Regular", 0, { makeable: 0 }),
    variant("m-tea-l", "Large", 15, { available: false }),
  ]);
  assert.equal(optionSoldOut(gone), true);
});

test("a size runs out by either route", () => {
  assert.equal(variantSoldOut(variant("m", "L", 0, { makeable: 0 })), true);
  assert.equal(variantSoldOut(variant("m", "L", 0, { available: false })), true);
  assert.equal(variantSoldOut(variant("m", "L", 0, { makeable: null })), false);
});

/* ---- what is offered at all ---- */

test("an option with sizes is offerable even with no dish of its own", () => {
  assert.equal(TEA.mealId, null);
  assert.equal(offerable(TEA), true);
  assert.equal(isSized(TEA), true);
});

test("an option with neither a dish nor sizes is dropped", () => {
  // A sale the shop cannot cost. Greyed would be a promise it cannot keep.
  assert.equal(offerable({ ...TEA, variants: [] }), false);
});

/* ---- which size is chosen for you ---- */

test("the cheapest size in stock is the default, not the first listed", () => {
  // A combo's drink is normally included at regular and charged at large, so
  // the cheapest is the one that never adds money nobody asked to spend.
  const backwards = sized("o-tea", "Iced Tea", [
    variant("m-tea-l", "Large", 15, { sort: 0 }),
    variant("m-tea-r", "Regular", 0, { sort: 1 }),
  ]);
  assert.equal(defaultVariant(backwards)?.mealId, "m-tea-r");
});

test("the default skips a size that has run out", () => {
  const partly = sized("o-tea", "Iced Tea", [
    variant("m-tea-r", "Regular", 0, { makeable: 0 }),
    variant("m-tea-l", "Large", 15),
  ]);
  assert.equal(defaultVariant(partly)?.mealId, "m-tea-l");
});

test("ticking a sized option answers its size at the same time", () => {
  // Otherwise the Add button is blocked on a question nobody was asked.
  const g = group([TEA], { min: 0 });
  const after = toggleOption(g, {}, "o-tea");
  assert.deepEqual(after["g-drink"], [
    { id: "o-tea", qty: 1, variantMealId: "m-tea-r" },
  ]);
});

test("a plain add-on carries no size key at all", () => {
  // Not `variantMealId: undefined` — a cart is serialised to localStorage,
  // and an undefined key does not survive the round trip, so a restored cart
  // would compare unequal to the one that was saved.
  const g = group([plain("o-rice", "Extra rice", 25)], { min: 0 });
  assert.deepEqual(toggleOption(g, {}, "o-rice")["g-drink"], [
    { id: "o-rice", qty: 1 },
  ]);
});

test("a required group opens with its size already answered", () => {
  const opened = openingChoice([group([TEA])]);
  assert.equal(opened["g-drink"][0].variantMealId, "m-tea-r");
});

/* ---- changing the size ---- */

test("changing size keeps the quantity", () => {
  const g = group([{ ...TEA, maxQty: 3 }], { min: 0 });
  const picked = { "g-drink": [{ id: "o-tea", qty: 3, variantMealId: "m-tea-r" }] };
  const after = setVariant(g, picked, "o-tea", "m-tea-l");
  assert.deepEqual(after["g-drink"], [
    { id: "o-tea", qty: 3, variantMealId: "m-tea-l" },
  ]);
});

test("a size cannot be set on something that is not ticked", () => {
  // On a pick-one group that would silently swap the customer's drink.
  const g = group([TEA, sized("o-coke", "Coke", [variant("m-coke", "Can", 30)])]);
  const picked = { "g-drink": [{ id: "o-coke", qty: 1, variantMealId: "m-coke" }] };
  assert.deepEqual(setVariant(g, picked, "o-tea", "m-tea-l"), picked);
});

test("a size that is not on the option is ignored", () => {
  const g = group([TEA], { min: 0 });
  const picked = { "g-drink": [{ id: "o-tea", qty: 1, variantMealId: "m-tea-r" }] };
  assert.deepEqual(setVariant(g, picked, "o-tea", "m-jipai"), picked);
});

/* ---- what reaches the cart and the receipt ---- */

test("the chosen size decides the price, the dish and the label", () => {
  const g = group([TEA]);
  const extras = extrasOf([g], {
    "g-drink": [{ id: "o-tea", qty: 1, variantMealId: "m-tea-l" }],
  });
  assert.equal(extras.length, 1);
  assert.equal(extras[0].price, 15);
  assert.equal(extras[0].mealId, "m-tea-l");
  // The kitchen ticket reads this string. "Iced Tea" alone tells the person
  // making it nothing.
  assert.equal(extras[0].label, "Iced Tea · Large");
});

test("two sizes of one drink are two cart lines, not two of one", () => {
  // The option id is the same for both, so keying on it alone collapses a
  // regular and a large into two of whichever was added first — two
  // different prices and two different things off the shelf, shown as one.
  const g = group([TEA]);
  const regular = extrasOf([g], {
    "g-drink": [{ id: "o-tea", qty: 1, variantMealId: "m-tea-r" }],
  });
  const large = extrasOf([g], {
    "g-drink": [{ id: "o-tea", qty: 1, variantMealId: "m-tea-l" }],
  });
  assert.notEqual(cartKey("m-combo", regular), cartKey("m-combo", large));
});

/* ---- what the server accepts ---- */

test("a size the option does not offer is refused, not silently swapped", () => {
  // A cart edited by hand could otherwise name any dish in the shop as the
  // "size" of a ₱15 drink — charged at ₱15, cooked as a ₱180 ji pai.
  const g = group([TEA]);
  const { extras, problem } = resolveChoice(
    [g],
    [{ id: "o-tea", qty: 1, variantMealId: "m-jipai" }],
    "Combo"
  );
  assert.deepEqual(extras, []);
  assert.match(problem ?? "", /Pick a size for Iced Tea/);
});

test("a sold-out size is refused rather than upgraded", () => {
  // Serving a large where a regular was chosen is a bigger bill than agreed.
  const partly = sized("o-tea", "Iced Tea", [
    variant("m-tea-r", "Regular", 0, { makeable: 0 }),
    variant("m-tea-l", "Large", 15),
  ]);
  const { extras, problem } = resolveChoice(
    [group([partly])],
    [{ id: "o-tea", qty: 1, variantMealId: "m-tea-r" }],
    "Combo"
  );
  assert.deepEqual(extras, []);
  assert.match(problem ?? "", /just sold out/);
});

test("a sized option sent with no size at all is refused", () => {
  const { problem } = resolveChoice([group([TEA])], [{ id: "o-tea", qty: 1 }], "Combo");
  assert.match(problem ?? "", /Pick a size for Iced Tea/);
});

test("a good pick goes through, priced from the size", () => {
  const { extras, problem } = resolveChoice(
    [group([TEA])],
    [{ id: "o-tea", qty: 1, variantMealId: "m-tea-l" }],
    "Combo"
  );
  assert.equal(problem, null);
  assert.equal(extras[0].price, 15);
  assert.equal(extras[0].mealId, "m-tea-l");
});

test("plain add-ons still work exactly as before", () => {
  const g = group([plain("o-rice", "Extra rice", 25)], { min: 0, max: 2 });
  const { extras, problem } = resolveChoice([g], [{ id: "o-rice", qty: 1 }], "Combo");
  assert.equal(problem, null);
  assert.equal(extras[0].label, "Extra rice");
  assert.equal(extras[0].price, 25);
  assert.equal(extras[0].mealId, "m-o-rice");
});
