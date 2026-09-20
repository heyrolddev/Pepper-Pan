import test from "node:test";
import assert from "node:assert/strict";
import {
  cartKey,
  choiceProblem,
  describeExtras,
  extrasOf,
  extrasTotal,
  groupsFor,
  isFull,
  offerable,
  openingChoice,
  optionPrice,
  optionSoldOut,
  reconcile,
  resolveChoice,
  ruleLabel,
  toggleOption,
  unitPrice,
  type ModifierGroup,
  type ModifierOption,
} from "../src/lib/modifiers.ts";

/**
 * Add-ons.
 *
 * Two claims hold this feature up, and they are what this file is for:
 *
 *   1. Nothing reaches the basket that the shop cannot cost. An option is a
 *      dish; an option whose dish is gone is not offered, and a sold-out one
 *      is never silently carried through.
 *   2. Two of the same dish with different add-ons are two lines. The cart
 *      merged on meal id, which would have turned "with extra rice" and
 *      "without" into quantity 2 of whichever was added first — a customer
 *      charged for the wrong thing and a kitchen cooking it.
 *
 * The fixture is the order that started this: a rice meal, extra rice, and a
 * drink you have to choose.
 */

const opt = (o: Partial<ModifierOption> & { id: string }): ModifierOption => ({
  label: o.id,
  mealId: `meal-${o.id}`,
  price: 0,
  available: true,
  makeable: null,
  sort: 0,
  ...o,
});

const group = (g: Partial<ModifierGroup> & { id: string }): ModifierGroup => ({
  name: g.id,
  helper: null,
  min: 0,
  max: 1,
  sort: 0,
  options: [],
  ...g,
});

/** "Extra rice?" — optional, one tick, ₱15. */
const rice = group({
  id: "g-rice",
  name: "Extra rice",
  sort: 0,
  options: [opt({ id: "o-rice", label: "Extra rice", price: 15, sort: 0 })],
});

/** "Choose your drink" — required, one of three, free with the combo. */
const drinks = group({
  id: "g-drinks",
  name: "Choose your drink",
  min: 1,
  max: 1,
  sort: 1,
  options: [
    opt({ id: "o-coke", label: "Coke", sort: 0 }),
    opt({ id: "o-tea", label: "Iced tea", sort: 1 }),
    opt({ id: "o-water", label: "Bottled water", sort: 2 }),
  ],
});

/* ------------------------------------------------------------------ */

test("a price override of zero is a price, not an absence", () => {
  // The free drink in a combo. Defaulting a missing override to 0 instead of
  // null would have made every option free the day somebody left it blank.
  assert.equal(optionPrice(0, 25), 0);
  assert.equal(optionPrice(null, 25), 25);
  assert.equal(optionPrice(undefined, 25), 25);
  // A dish deleted out from under the option leaves nothing to charge for.
  assert.equal(optionPrice(null, null), 0);
});

test("an option with no dish behind it is not offered at all", () => {
  const orphan = opt({ id: "o-gone", mealId: null, price: 15 });
  assert.equal(offerable(orphan), false);

  const byMeal = new Map([
    ["m1", [group({ id: "g", options: [orphan] })]],
  ]);
  // The group had one option and it is gone, so the heading goes with it —
  // a heading with nothing under it reads as a page that failed to load.
  assert.deepEqual(groupsFor("m1", null, byMeal, new Map()), []);
});

test("a dish shows its own groups and its card's, once each", () => {
  const byMeal = new Map([["m1", [rice, drinks]]]);
  const byProduct = new Map([["p1", [drinks]]]);

  const got = groupsFor("m1", "p1", byMeal, byProduct);
  assert.deepEqual(got.map((g) => g.id), ["g-rice", "g-drinks"]);
});

test("sold-out options are shown, deleted ones are not", () => {
  // The difference the customer can act on: come back tomorrow, versus this
  // was never really here.
  const out = opt({ id: "o-out", available: false });
  const empty = opt({ id: "o-empty", makeable: 0 });
  const fine = opt({ id: "o-fine", makeable: 3 });

  assert.equal(optionSoldOut(out), true);
  assert.equal(optionSoldOut(empty), true);
  assert.equal(optionSoldOut(fine), false);

  const byMeal = new Map([
    ["m1", [group({ id: "g", options: [out, empty, fine] })]],
  ]);
  assert.equal(groupsFor("m1", null, byMeal, new Map())[0].options.length, 3);
});

/* ---- choosing ---------------------------------------------------- */

test("a compulsory question opens answered, an optional one opens blank", () => {
  const choice = openingChoice([rice, drinks]);
  assert.deepEqual(choice["g-drinks"], ["o-coke"]);
  // Pre-ticking the extra rice would be ₱15 the customer never asked to spend.
  assert.equal(choice["g-rice"], undefined);
});

test("a compulsory question opens on something that is actually in stock", () => {
  const noCoke = { ...drinks, options: [{ ...drinks.options[0], makeable: 0 }, ...drinks.options.slice(1)] };
  assert.deepEqual(openingChoice([noCoke])["g-drinks"], ["o-tea"]);
});

test("pick-one replaces; an optional one can be un-ticked, a required one cannot", () => {
  let choice = toggleOption(drinks, {}, "o-coke");
  choice = toggleOption(drinks, choice, "o-tea");
  assert.deepEqual(choice["g-drinks"], ["o-tea"]);

  // Tapping the answer to a compulsory question again leaves it answered —
  // clearing it would drop the customer back into the state Add refuses,
  // with nothing on screen to say what changed.
  choice = toggleOption(drinks, choice, "o-tea");
  assert.deepEqual(choice["g-drinks"], ["o-tea"]);

  const optional = toggleOption(rice, toggleOption(rice, {}, "o-rice"), "o-rice");
  assert.deepEqual(optional["g-rice"], []);
});

test("a checklist stops at its limit instead of dropping an earlier choice", () => {
  const addons = group({
    id: "g-add",
    max: 2,
    options: [opt({ id: "a" }), opt({ id: "b" }), opt({ id: "c" })],
  });

  let choice = toggleOption(addons, {}, "a");
  choice = toggleOption(addons, choice, "b");
  assert.equal(isFull(addons, choice), true);

  // Silently evicting "a" would charge for something the customer had already
  // seen themselves choose, with no tap of theirs to explain it.
  const full = toggleOption(addons, choice, "c");
  assert.deepEqual(full["g-add"], ["a", "b"]);

  const freed = toggleOption(addons, choice, "a");
  assert.deepEqual(toggleOption(addons, freed, "c")["g-add"], ["b", "c"]);
});

test("the Add button says which question is unanswered", () => {
  assert.equal(choiceProblem([rice, drinks], {}), "Choose your drink first.");
  assert.equal(choiceProblem([rice, drinks], { "g-drinks": ["o-coke"] }), null);
  assert.equal(choiceProblem([rice], {}), null);
});

test("a compulsory group that has entirely run out does not lock the dish", () => {
  // No drinks today means no drink, not an unbuyable rice meal.
  const dry = {
    ...drinks,
    options: drinks.options.map((o) => ({ ...o, available: false })),
  };
  assert.equal(choiceProblem([dry], {}), null);
});

test("a sold-out option is never carried into the basket", () => {
  // It can be in the choice map: the customer picked it, then the last one
  // went while the dialog was open. Costing a sale of it is worse than
  // dropping it, and the dialog re-reads the total from what comes back.
  const gone = { ...drinks, options: [{ ...drinks.options[0], makeable: 0 }, ...drinks.options.slice(1)] };
  const extras = extrasOf([gone], { "g-drinks": ["o-coke"] });
  assert.deepEqual(extras, []);
});

test("extras come out in the order they were shown, not the order they were tapped", () => {
  const extras = extrasOf([rice, drinks], {
    "g-drinks": ["o-tea"],
    "g-rice": ["o-rice"],
  });
  assert.deepEqual(extras.map((e) => e.label), ["Extra rice", "Iced tea"]);
  assert.equal(describeExtras(extras), "Extra rice, Iced tea");
});

/* ---- money and basket identity ----------------------------------- */

test("the add-ons are added to the price of one, not of the line", () => {
  const extras = extrasOf([rice, drinks], {
    "g-rice": ["o-rice"],
    "g-drinks": ["o-coke"],
  });
  assert.equal(extrasTotal(extras), 15);
  assert.equal(unitPrice(120, extras), 135);
});

test("the same dish with different add-ons is two basket lines", () => {
  const withRice = extrasOf([rice], { "g-rice": ["o-rice"] });
  assert.notEqual(cartKey("m1", withRice), cartKey("m1", []));
  assert.equal(cartKey("m1", []), "m1");
});

test("ticking the same two add-ons in either order is one basket line", () => {
  const a = extrasOf([rice, drinks], { "g-rice": ["o-rice"], "g-drinks": ["o-coke"] });
  const b = [...a].reverse();
  assert.equal(cartKey("m1", a), cartKey("m1", b));
});

/* ---- surviving a change of variant -------------------------------- */

test("switching variant forgets a choice the new dish does not offer", () => {
  // The 22oz comes with a drink; the 16oz does not. Keeping "o-coke" in the
  // choice map would leave `choiceProblem` satisfied by an answer nothing on
  // screen shows, and `extrasOf` charging for nothing — a combo with no drink.
  const held = { "g-drinks": ["o-coke"], "g-rice": ["o-rice"] };
  assert.deepEqual(reconcile([rice], held), { "g-rice": ["o-rice"] });
});

test("a compulsory group the new dish adds gets answered rather than blocking", () => {
  const got = reconcile([drinks], {});
  assert.deepEqual(got["g-drinks"], ["o-coke"]);
});

test("reconciling twice changes nothing the second time", () => {
  const once = reconcile([rice, drinks], { "g-rice": ["o-rice"] });
  assert.deepEqual(reconcile([rice, drinks], once), once);
});

test("a choice over the limit is trimmed rather than charged in full", () => {
  const addons = group({
    id: "g-add",
    max: 2,
    options: [opt({ id: "a" }), opt({ id: "b" }), opt({ id: "c" })],
  });
  assert.deepEqual(reconcile([addons], { "g-add": ["a", "b", "c"] })["g-add"], [
    "a",
    "b",
  ]);
});

/* ---- what the server does with what the browser sent --------------- */

test("the server prices the add-ons itself, from the ids alone", () => {
  const got = resolveChoice([rice, drinks], ["o-rice", "o-coke"], "Pork Solo Rice");
  assert.equal(got.problem, null);
  assert.deepEqual(got.extras.map((e) => [e.label, e.price]), [
    ["Extra rice", 15],
    ["Coke", 0],
  ]);
});

test("an id for something this dish doesn't offer is refused, not dropped", () => {
  // Dropping it silently means the customer agreed to one total and is
  // charged another, with nothing on the receipt to explain the difference.
  const got = resolveChoice([rice], ["o-coke"], "Pork Solo Rice");
  assert.match(got.problem ?? "", /isn't offered any more/);
  assert.deepEqual(got.extras, []);
});

test("an add-on that sold out between the tap and the tap on Checkout is named", () => {
  const dry = { ...rice, options: [{ ...rice.options[0], makeable: 0 }] };
  const got = resolveChoice([dry], ["o-rice"], "Pork Solo Rice");
  assert.match(got.problem ?? "", /Extra rice just sold out/);
});

test("a compulsory question the browser skipped is refused", () => {
  // The dialog answers it for them, so reaching here means a stale tab or a
  // request nobody typed — and either way a combo with no drink in it.
  const got = resolveChoice([drinks], [], "Solo Ji Pai");
  assert.equal(got.problem, "Choose your drink first.");
});

test("more ticks than the group allows is refused", () => {
  const addons = group({
    id: "g-add",
    name: "Add-ons",
    max: 2,
    options: [opt({ id: "a" }), opt({ id: "b" }), opt({ id: "c" })],
  });
  const got = resolveChoice([addons], ["a", "b", "c"], "Pork Solo Rice");
  assert.match(got.problem ?? "", /only pick 2/);
});

/* ---- what the customer is being asked to do ------------------------ */

test("the rule badge says the number it means, in all five shapes", () => {
  const r = (min: number, max: number) => ruleLabel({ min, max });
  assert.equal(r(0, 1), "Optional");
  assert.equal(r(1, 1), "Required");
  assert.equal(r(2, 2), "Pick 2");
  assert.equal(r(0, 3), "Up to 3");
  // The one the shop's own data hit. "Pick 1" reads as "pick exactly one", so
  // a customer entitled to two drinks never taps the second.
  assert.equal(r(1, 2), "Pick 1–2");
});
