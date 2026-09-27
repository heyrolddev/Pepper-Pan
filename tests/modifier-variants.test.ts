import test from "node:test";
import assert from "node:assert/strict";

import {
  cartKey,
  choiceProblem,
  defaultVariant,
  extrasOf,
  isSized,
  liveVariants,
  offerable,
  openingChoice,
  optionAxes,
  optionSoldOut,
  pickAxis,
  reconcile,
  resolveChoice,
  selectionOf,
  setVariant,
  sizeFor,
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

/* ------------------------------------------------------------------
 * The size has to survive a rebuild
 *
 * `reconcile` returned `{ id, qty }` and nothing else, and the dialog
 * recomputes `choice` from it on EVERY render. So the chosen size was
 * thrown away on every pass, and three things went wrong at once:
 *
 *   the chip stopped looking chosen;
 *   the price beside the row read "Free" over a ₱75 drink;
 *   and `extrasOf` fell back to `defaultVariant` — the CHEAPEST — so a
 *   customer who tapped 22oz at ₱89 was charged ₱75 and would have been
 *   handed a 16oz.
 *
 * Tapped one thing, paid for another, and every number on the screen agreed
 * with itself. Not one of the 768 tests caught it, because they all drove
 * `resolveChoice` and `extrasOf` directly and none of them went through the
 * rebuild the screen actually does.
 * ------------------------------------------------------------------ */

const LATTE = sized("latte", "Hot Spanish Latte", [
  variant("m-22", "22oz", 89, { sort: 0 }),
  variant("m-16", "16oz", 75, { sort: 1 }),
]);
const DRINKS: ModifierGroup = {
  id: "drinks",
  name: "Choose your drinks",
  helper: null,
  min: 0,
  max: 1,
  sort: 0,
  options: [LATTE],
};

test("the size the customer tapped survives reconcile", () => {
  const ticked = setVariant(DRINKS, toggleOption(DRINKS, {}, "latte"), "latte", "m-22");
  assert.equal(ticked.drinks[0].variantMealId, "m-22");

  const rebuilt = reconcile([DRINKS], ticked);
  assert.equal(
    rebuilt.drinks[0].variantMealId,
    "m-22",
    "reconcile threw away the size the customer picked"
  );
});

test("and so does the price they were shown", () => {
  const ticked = setVariant(DRINKS, toggleOption(DRINKS, {}, "latte"), "latte", "m-22");
  const [extra] = extrasOf([DRINKS], reconcile([DRINKS], ticked));
  // 89, not 75. The whole bug in one number.
  assert.equal(extra.price, 89);
  assert.equal(extra.mealId, "m-22");
  assert.match(extra.label, /22oz/);
});

test("reconcile run twice is the same as run once", () => {
  // The dialog wraps every handler in it AND recomputes `choice` from it, so
  // it runs at least twice per tap. A rule that only survives one pass is a
  // rule that fails in the app and passes in the tests.
  const once = reconcile([DRINKS], setVariant(DRINKS, toggleOption(DRINKS, {}, "latte"), "latte", "m-22"));
  const twice = reconcile([DRINKS], once);
  assert.deepStrictEqual(twice, once);
  assert.equal(twice.drinks[0].variantMealId, "m-22");
});

test("a freshly ticked drink comes out of reconcile with a size", () => {
  // Cheapest, per `defaultVariant` — it never adds money nobody asked for.
  const rebuilt = reconcile([DRINKS], toggleOption(DRINKS, {}, "latte"));
  assert.equal(rebuilt.drinks[0].variantMealId, "m-16");
  assert.equal(extrasOf([DRINKS], rebuilt)[0].price, 75);
});

test("a compulsory group filled by reconcile is filled WITH a size", () => {
  // Otherwise the Add button refuses a question the customer was never asked.
  const required: ModifierGroup = { ...DRINKS, min: 1, max: 1 };
  const rebuilt = reconcile([required], {});
  assert.equal(rebuilt.drinks.length, 1);
  assert.equal(rebuilt.drinks[0].variantMealId, "m-16");
  assert.equal(choiceProblem([required], rebuilt), null);
});

test("a plain add-on still carries no size key at all", () => {
  // A pick lives in localStorage and is compared by shape. An explicit
  // `variantMealId: undefined` serialises away and comes back missing, so a
  // restored cart would not equal the one that was saved.
  const rice: ModifierOption = {
    id: "rice", label: "Extra Rice", mealId: "m-rice",
    price: 20, available: true, maxQty: 20, sort: 0,
  };
  const g: ModifierGroup = { id: "extra", name: "Rice", helper: null, min: 0, max: 1, sort: 0, options: [rice] };
  const rebuilt = reconcile([g], toggleOption(g, {}, "rice"));
  assert.deepStrictEqual(rebuilt.extra[0], { id: "rice", qty: 1 });
  assert.ok(!("variantMealId" in rebuilt.extra[0]));
});

test("a size that no longer exists falls back rather than sticking", () => {
  // The owner removed the 22oz from the card. Keeping a pointer to a dish
  // that is gone would send an order for nothing.
  const shrunk: ModifierGroup = {
    ...DRINKS,
    options: [sized("latte", "Hot Spanish Latte", [variant("m-16", "16oz", 75)])],
  };
  const stale = { drinks: [{ id: "latte", qty: 1, variantMealId: "m-22" }] };
  assert.equal(reconcile([shrunk], stale).drinks[0].variantMealId, "m-16");
});

test("a size that sold out is KEPT, and the Add button refuses", () => {
  // Swapping it for one in stock hands somebody a regular when they asked
  // for a large and says nothing. Being told is the better outcome.
  const gone: ModifierGroup = {
    ...DRINKS,
    options: [
      sized("latte", "Hot Spanish Latte", [
        variant("m-22", "22oz", 89, { available: false }),
        variant("m-16", "16oz", 75),
      ]),
    ],
  };
  const chosen = { drinks: [{ id: "latte", qty: 1, variantMealId: "m-22" }] };
  const rebuilt = reconcile([gone], chosen);
  assert.equal(rebuilt.drinks[0].variantMealId, "m-22", "it was silently swapped");

  const said = choiceProblem([gone], rebuilt);
  assert.match(said ?? "", /22oz/);
  assert.match(said ?? "", /run out/);
});

test("nothing is said when every chosen size is in stock", () => {
  const fine = reconcile([DRINKS], setVariant(DRINKS, toggleOption(DRINKS, {}, "latte"), "latte", "m-22"));
  assert.equal(choiceProblem([DRINKS], fine), null);
});

/* ------------------------------------------------------------------
 * A drink that comes Hot or Iced, in three sizes
 *
 * Six variants. Offered as six chips — "Hot · 12oz", "Iced · 16oz" … — the
 * customer has to read every combination to find theirs, and a Hot that only
 * comes in 12oz sits next to an Iced that only comes in 16oz and 22oz with
 * nothing saying why. Two rows, temperature then size, is the same
 * information in the shape people already think in.
 *
 * The rules come from lib/menu-products, which has answered exactly this for
 * the menu cards since 0048. Adapted, not copied — the copy is the one that
 * drifts.
 * ------------------------------------------------------------------ */

const sizeV = (
  mealId: string,
  opts: Record<string, string>,
  price: number,
  extra: Partial<OptionVariant> = {}
): OptionVariant => ({
  mealId,
  label: Object.values(opts).join(" · "),
  options: opts,
  price,
  available: true,
  sort: 0,
  ...extra,
});

// Hot only comes small; Iced comes in all three. Exactly the shape a coffee
// shop actually has, and the one a flat chip list handles worst.
const SPANISH: ModifierOption = sized("sl", "Spanish Latte", [
  sizeV("sl-h12", { Temp: "Hot", Size: "12oz" }, 75, { sort: 0 }),
  sizeV("sl-i16", { Temp: "Iced", Size: "16oz" }, 85, { sort: 1 }),
  sizeV("sl-i22", { Temp: "Iced", Size: "22oz" }, 99, { sort: 2 }),
]);

test("two axes become two rows of chips, in the owner's order", () => {
  assert.deepEqual(optionAxes(SPANISH), [
    { name: "Temp", values: ["Hot", "Iced"] },
    { name: "Size", values: ["12oz", "16oz", "22oz"] },
  ]);
});

test("one axis is one row, exactly as before", () => {
  const plainSizes = sized("tea", "Iced Tea", [
    sizeV("t-r", { Size: "Regular" }, 0),
    sizeV("t-l", { Size: "Large" }, 15, { sort: 1 }),
  ]);
  assert.deepEqual(optionAxes(plainSizes), [
    { name: "Size", values: ["Regular", "Large"] },
  ]);
});

test("an axis with one value is not offered — it is not a choice", () => {
  // A single chip that is already on and does nothing when tapped reads as a
  // broken control, not as information.
  const only = sized("x", "Only", [
    sizeV("a", { Temp: "Iced", Size: "16oz" }, 85),
    sizeV("b", { Temp: "Iced", Size: "22oz" }, 99, { sort: 1 }),
  ]);
  assert.deepEqual(optionAxes(only), [{ name: "Size", values: ["16oz", "22oz"] }]);
});

test("tapping a chip keeps what it can and gives up what it cannot", () => {
  // On Iced 22oz, tapping Hot: Hot has no 22oz, so the size gives way and it
  // lands on the only Hot there is. The answer a person would give.
  const onIced = { Temp: "Iced", Size: "22oz" };
  assert.deepEqual(pickAxis(SPANISH, onIced, "Temp", "Hot"), {
    Temp: "Hot",
    Size: "12oz",
  });

  // And back: Hot 12oz → Iced. There is no Iced 12oz, so the size moves to
  // the cheapest Iced rather than to nothing.
  assert.deepEqual(pickAxis(SPANISH, { Temp: "Hot", Size: "12oz" }, "Temp", "Iced"), {
    Temp: "Iced",
    Size: "16oz",
  });
});

test("tapping a size keeps the temperature where it exists", () => {
  assert.deepEqual(pickAxis(SPANISH, { Temp: "Iced", Size: "16oz" }, "Size", "22oz"), {
    Temp: "Iced",
    Size: "22oz",
  });
});

test("a combination nobody sells never becomes the answer", () => {
  // Every result of a tap is a real dish's whole option set, never the old
  // selection with one value swapped in — that could name a dish that does
  // not exist, and then the picker needs an error message for a state it
  // invented itself.
  const all = [
    { Temp: "Hot", Size: "12oz" },
    { Temp: "Iced", Size: "16oz" },
    { Temp: "Iced", Size: "22oz" },
  ];
  for (const start of all) {
    for (const [axis, values] of [
      ["Temp", ["Hot", "Iced"]],
      ["Size", ["12oz", "16oz", "22oz"]],
    ] as const) {
      for (const value of values) {
        const landed = pickAxis(SPANISH, start, axis, value);
        assert.ok(
          sizeFor(SPANISH, landed),
          `${JSON.stringify(start)} + ${axis}=${value} landed on ${JSON.stringify(landed)}, which nobody sells`
        );
      }
    }
  }
});

test("the chosen combination resolves to the dish and its price", () => {
  const at = sizeFor(SPANISH, { Temp: "Iced", Size: "22oz" });
  assert.equal(at?.mealId, "sl-i22");
  assert.equal(at?.price, 99);
});

test("a combination that is not on the menu resolves to nothing", () => {
  assert.equal(sizeFor(SPANISH, { Temp: "Hot", Size: "22oz" }), null);
});

test("the chips know which one is currently chosen", () => {
  assert.deepEqual(selectionOf(SPANISH, "sl-i16"), { Temp: "Iced", Size: "16oz" });
  // A pick with no size yet, or one pointing at a dish that is gone.
  assert.deepEqual(selectionOf(SPANISH, undefined), {});
  assert.deepEqual(selectionOf(SPANISH, "not-a-dish"), {});
});

test("sizes loaded before axis values still work as one row", () => {
  // `options` is optional so an option cached from before this shipped still
  // parses. Absent reads as "no axes", which is what a flat row already is —
  // and the flat row is what the UI falls back to.
  const old = sized("t", "Iced Tea", [
    { mealId: "a", label: "Regular", price: 0, available: true, sort: 0 },
    { mealId: "b", label: "Large", price: 15, available: true, sort: 1 },
  ]);
  assert.deepEqual(optionAxes(old), []);
  assert.deepEqual(selectionOf(old, "a"), {});
});
