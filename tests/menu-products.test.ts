import test from "node:test";
import assert from "node:assert/strict";
import {
  axesOf,
  buildProducts,
  chipState,
  isSoldOut,
  normalizeOptions,
  openingSelection,
  pick,
  variantFor,
  type ProductGroup,
  type Variant,
} from "../src/lib/menu-products.ts";

/**
 * One menu card, several ways of having it.
 *
 * The whole design rests on one claim: because the options are READ from the
 * dishes rather than declared beside them, a customer cannot select a
 * combination that has nothing behind it. That claim is what these tests are
 * for. Everything else here — prices, ratings, ordering — is arithmetic; the
 * part that would quietly ship a basket you cannot check out with is the
 * picker, so most of this file is the picker.
 *
 * The shop's real menu is the fixture, because the two shapes it actually has
 * are the two that break things: a clean 2-value axis (the latte), and two
 * axes crossed four ways (the ji pai).
 */

const v = (over: Partial<Variant> & Pick<Variant, "id">): Variant => ({
  name: over.id,
  price: 100,
  description: null,
  image_url: null,
  options: {},
  makeable: null,
  available: true,
  sort: 0,
  categories: [],
  ...over,
});

/** 16oz ₱75 / 22oz ₱89, one axis. */
const LATTE: Variant[] = [
  v({ id: "l16", name: "16oz Iced Spanish Latte", price: 75, sort: 0, options: { Size: "16oz" } }),
  v({ id: "l22", name: "22oz Iced Spanish Latte", price: 89, sort: 1, options: { Size: "22oz" } }),
];

/** Two axes crossed four ways, which is where a picker earns its keep. */
const JIPAI: Variant[] = [
  v({ id: "j-o", price: 155, sort: 0, options: { Flavour: "Original", Cheese: "No cheese" } }),
  v({ id: "j-s", price: 155, sort: 1, options: { Flavour: "Spicy", Cheese: "No cheese" } }),
  v({ id: "j-oc", price: 169, sort: 2, options: { Flavour: "Original", Cheese: "With cheese" } }),
  v({ id: "j-sc", price: 169, sort: 3, options: { Flavour: "Spicy", Cheese: "With cheese" } }),
];

/* ---------------------------------------------------------------- */

test("jsonb is read, not trusted", () => {
  assert.deepEqual(normalizeOptions({ Size: "22oz" }), { Size: "22oz" });
  assert.deepEqual(normalizeOptions({ Size: " 22oz " }), { Size: "22oz" });
  // A number renders a chip saying "22" that never equals the string "22" the
  // selection holds — the dish becomes unreachable and nothing says why.
  assert.deepEqual(normalizeOptions({ Size: 22 }), {});
  // A blank is not "no choice", it is a chip with nothing written on it.
  assert.deepEqual(normalizeOptions({ Size: "  " }), {});
  for (const junk of [null, undefined, "Size", ["Size"], 7]) {
    assert.deepEqual(normalizeOptions(junk), {});
  }
});

test("the axes come from the dishes, in the order the owner arranged them", () => {
  assert.deepEqual(axesOf(LATTE), [{ name: "Size", values: ["16oz", "22oz"] }]);
  assert.deepEqual(axesOf(JIPAI), [
    { name: "Flavour", values: ["Original", "Spicy"] },
    { name: "Cheese", values: ["No cheese", "With cheese"] },
  ]);

  // Re-order the dishes and the chips re-order with them. That is the point:
  // one control, not a second ordering to keep in step.
  const flipped = LATTE.map((x) => ({ ...x, sort: x.id === "l22" ? 0 : 1 }));
  assert.deepEqual(axesOf(flipped), [{ name: "Size", values: ["22oz", "16oz"] }]);
});

test("an axis with one value is not a choice and is not offered", () => {
  // It would render as a single chip that is already on and does nothing when
  // tapped, which reads as a broken control rather than as information.
  const one = [v({ id: "a", options: { Size: "16oz", Flavour: "Original" } }),
               v({ id: "b", sort: 1, options: { Size: "22oz", Flavour: "Original" } })];
  assert.deepEqual(axesOf(one), [{ name: "Size", values: ["16oz", "22oz"] }]);
});

test("hiding one of a pair takes the whole row of buttons away", () => {
  /**
   * Reported as "the flavours stopped working" on a card that looked correct
   * in HQ. The customer's menu only ever loads dishes that are ON it, so a
   * hidden dish never reaches this function — and one option left is not a
   * choice, so the row vanishes rather than showing a single button that does
   * nothing. Correct, and invisible, which is why the editor now warns.
   */
  const bothShown = [
    v({ id: "a", sort: 0, options: { Flavors: "La (Spicy)" } }),
    v({ id: "b", sort: 1, options: { Flavors: "Xiao La" } }),
  ];
  assert.deepEqual(axesOf(bothShown), [
    { name: "Flavors", values: ["La (Spicy)", "Xiao La"] },
  ]);

  // The menu page filters hidden dishes out before this, so one arrives.
  assert.deepEqual(axesOf([bothShown[0]]), []);
});

test("a dish with no options offers nothing to choose", () => {
  assert.deepEqual(axesOf([v({ id: "solo" })]), []);
});

/* ---- the claim ------------------------------------------------- */

test("every pick lands on a dish that exists", () => {
  // Exhaustive over the ji pai: from every starting point, tap every chip,
  // and there must be a real dish at the other end. This is the property the
  // whole design exists to guarantee.
  const axes = axesOf(JIPAI);
  for (const start of JIPAI) {
    for (const axis of axes) {
      for (const value of axis.values) {
        const next = pick(JIPAI, { ...start.options }, axis.name, value);
        const hit = variantFor(JIPAI, next);
        assert.ok(hit, `${JSON.stringify(start.options)} + ${axis.name}=${value}`);
        assert.equal(hit!.options[axis.name], value, "the tapped value must stick");
      }
    }
  }
});

test("a pick keeps as much of the rest of the choice as it can", () => {
  // Changing the flavour of a with-cheese ji pai keeps the cheese.
  const from = { Flavour: "Original", Cheese: "With cheese" };
  assert.deepEqual(pick(JIPAI, from, "Flavour", "Spicy"), {
    Flavour: "Spicy",
    Cheese: "With cheese",
  });
});

test("a pick drops what cannot be kept, rather than holding an impossible state", () => {
  // A menu where cheese is only offered on the original: tapping Spicy has to
  // give up the cheese, because spicy-with-cheese is not a thing you can buy.
  const partial = [
    v({ id: "o", sort: 0, options: { Flavour: "Original", Cheese: "No cheese" } }),
    v({ id: "oc", sort: 1, options: { Flavour: "Original", Cheese: "With cheese" } }),
    v({ id: "s", sort: 2, options: { Flavour: "Spicy", Cheese: "No cheese" } }),
  ];
  const next = pick(partial, { Flavour: "Original", Cheese: "With cheese" }, "Flavour", "Spicy");
  assert.deepEqual(next, { Flavour: "Spicy", Cheese: "No cheese" });
  assert.ok(variantFor(partial, next));
});

test("one tap changes one thing, even when that lands on a sold-out dish", () => {
  /**
   * Caught in a browser, not by a type.
   *
   * This preferred stock over keeping the choice, so tapping "with cheese" on
   * an Original whose cheese version had run out silently served up the SPICY
   * one. One tap changed two things, and the second was a change nobody asked
   * for — the customer's flavour, swapped without a word.
   *
   * Landing on the sold-out original and saying so is the honest answer. They
   * can pick the spicy themselves, and then it is their decision.
   */
  const rows = [
    v({ id: "o", sort: 0, options: { Flavour: "Original", Cheese: "No cheese" } }),
    v({ id: "oc", sort: 1, available: false, options: { Flavour: "Original", Cheese: "With cheese" } }),
    v({ id: "sc", sort: 2, options: { Flavour: "Spicy", Cheese: "With cheese" } }),
  ];
  const next = pick(rows, { Flavour: "Original", Cheese: "No cheese" }, "Cheese", "With cheese");
  assert.deepEqual(next, { Flavour: "Original", Cheese: "With cheese" });
  assert.equal(isSoldOut(variantFor(rows, next)!), true);
});

test("stock breaks a tie, where nothing else separates two dishes", () => {
  // Both keep exactly as much of the selection, so there is no reason to
  // prefer the one that cannot be bought.
  const rows = [
    v({ id: "a", sort: 0, available: false, options: { Size: "22oz" } }),
    v({ id: "b", sort: 1, options: { Size: "22oz" } }),
  ];
  assert.equal(
    variantFor(rows, pick(rows, { Size: "16oz" }, "Size", "22oz"))?.id,
    "b"
  );
});

test("tapping something no dish has changes nothing", () => {
  const before = { Size: "16oz" };
  assert.deepEqual(pick(LATTE, before, "Size", "32oz"), before);
});

/* ---- what a chip looks like ------------------------------------ */

test("a chip says which of the two reasons it cannot be tapped", () => {
  // The shop can act on one and not the other: "sold out" means come back
  // tomorrow, "not available" means it was never offered that way.
  const partial = [
    v({ id: "o", sort: 0, options: { Flavour: "Original", Cheese: "No cheese" } }),
    v({ id: "oc", sort: 1, options: { Flavour: "Original", Cheese: "With cheese" } }),
    v({ id: "s", sort: 2, options: { Flavour: "Spicy", Cheese: "No cheese" } }),
  ];
  const onSpicy = { Flavour: "Spicy", Cheese: "No cheese" };
  assert.equal(chipState(partial, onSpicy, "Cheese", "With cheese"), "unavailable");

  const soldOut = partial.map((x) => (x.id === "oc" ? { ...x, available: false } : x));
  const onOriginal = { Flavour: "Original", Cheese: "No cheese" };
  assert.equal(chipState(soldOut, onOriginal, "Cheese", "With cheese"), "sold_out");
  assert.equal(chipState(soldOut, onOriginal, "Cheese", "No cheese"), "ok");
});

test("the selected chip does not grey itself out when its twin runs out", () => {
  // Judged against the OTHER axes only. Holding the tapped axis fixed would
  // grey every chip the moment one combination ran out, the selected one
  // included.
  const rows = JIPAI.map((x) => (x.id === "j-sc" ? { ...x, available: false } : x));
  const at = { Flavour: "Spicy", Cheese: "No cheese" };
  assert.equal(chipState(rows, at, "Flavour", "Spicy"), "ok");
  assert.equal(chipState(rows, at, "Cheese", "With cheese"), "sold_out");
});

/* ---- sold out, by either route --------------------------------- */

test("a dish is gone if the owner said so OR the shelf says so", () => {
  assert.equal(isSoldOut(v({ id: "a" })), false);
  assert.equal(isSoldOut(v({ id: "a", available: false })), true);
  assert.equal(isSoldOut(v({ id: "a", makeable: 0 })), true);
  // No recipe means no opinion, not "none left" — the commonest reason a
  // makeable figure is missing is that nobody has costed the dish yet.
  assert.equal(isSoldOut(v({ id: "a", makeable: null })), false);
  assert.equal(isSoldOut(v({ id: "a", makeable: undefined })), false);
});

test("the card opens on the cheapest one somebody can actually buy", () => {
  // The card said "from ₱75". Opening it on the ₱89 reads as a bait.
  assert.deepEqual(openingSelection(LATTE), { Size: "16oz" });

  // ...unless that one has run out, in which case opening onto it makes a
  // group with stock look shut.
  const out = LATTE.map((x) => (x.id === "l16" ? { ...x, available: false } : x));
  assert.deepEqual(openingSelection(out), { Size: "22oz" });

  // Everything gone: still open on something, so the dialog is not blank.
  const allOut = LATTE.map((x) => ({ ...x, available: false }));
  assert.deepEqual(openingSelection(allOut), { Size: "16oz" });
});

/* ---- building the menu ----------------------------------------- */

const group = (over: Partial<ProductGroup> = {}): ProductGroup => ({
  id: "g1",
  name: "Iced Spanish Latte",
  description: null,
  image_url: null,
  sort_order: 0,
  is_active: true,
  ...over,
});

const inGroup = (ids: Record<string, string>) => (x: Variant) => ids[x.id] ?? null;

test("a grouped pair becomes one card, priced from its cheapest", () => {
  const [p] = buildProducts(LATTE, [group()], inGroup({ l16: "g1", l22: "g1" }));
  assert.equal(p.name, "Iced Spanish Latte");
  assert.equal(p.priceFrom, 75);
  assert.equal(p.priceTo, 89);
  assert.equal(p.variants.length, 2);
  assert.deepEqual(p.axes, [{ name: "Size", values: ["16oz", "22oz"] }]);
});

test("renaming the card changes the name and nothing else", () => {
  /**
   * Reported as "changing the Card Name and it stops appearing on the menu".
   * The card's name is the only thing the group supplies — its dishes, its
   * prices, its categories and its options all come from the variants — so a
   * rename cannot drop it off the menu or change what is behind it. Pinned
   * here so a future change to `productOf` cannot quietly make it able to.
   */
  const ids = inGroup({ l16: "g1", l22: "g1" });
  const before = buildProducts(LATTE, [group({ name: "Iced Spanish Latte" })], ids)[0];
  const after = buildProducts(LATTE, [group({ name: "Spanish Latte Bowl" })], ids)[0];

  assert.equal(after.name, "Spanish Latte Bowl");
  assert.deepEqual(
    after.variants.map((v) => v.id),
    before.variants.map((v) => v.id)
  );
  assert.deepEqual(after.axes, before.axes);
  assert.deepEqual(after.categories, before.categories);
  assert.equal(after.priceFrom, before.priceFrom);
  assert.equal(after.soldOut, before.soldOut);
});

test("a renamed card moves where the menu is alphabetical", () => {
  // Not a fault, but the thing most easily mistaken for one: the menu is
  // ordered by name, so renaming a card moves it. Written down so the
  // behaviour is a decision rather than a surprise.
  const ids = inGroup({ l16: "g1", l22: "g1" });
  const other = [v({ id: "x", name: "Dumplings", price: 120 })];

  const asP = buildProducts([...LATTE, ...other], [group({ name: "Pork Rice" })], ids);
  assert.deepEqual(asP.map((p) => p.name), ["Dumplings", "Pork Rice"]);

  const asC = buildProducts([...LATTE, ...other], [group({ name: "Chicken Rice" })], ids);
  assert.deepEqual(asC.map((p) => p.name), ["Chicken Rice", "Dumplings"]);
});

test("an ungrouped dish is a card of one, not a special case", () => {
  // What lets every card on the menu be tappable from the day this ships. A
  // menu where some cards open and others do nothing reads as broken.
  const out = buildProducts([v({ id: "xlb", name: "XLB", price: 120 })], [], () => null);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "solo:xlb");
  assert.equal(out[0].name, "XLB");
  assert.deepEqual(out[0].axes, []);
  assert.equal(out[0].priceFrom, 120);
});

test("switching a group off puts its dishes back as their own cards", () => {
  // A presentation switch must not take anything off sale.
  const out = buildProducts(LATTE, [group({ is_active: false })], inGroup({ l16: "g1", l22: "g1" }));
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((p) => p.name).sort(), [
    "16oz Iced Spanish Latte",
    "22oz Iced Spanish Latte",
  ]);
});

test("a dish pointing at a group that is gone still reaches the menu", () => {
  // `on delete set null` should prevent this, but a half-applied migration or
  // a hand-edited row must not make a dish vanish from sale.
  const out = buildProducts(LATTE, [], inGroup({ l16: "ghost", l22: "ghost" }));
  assert.equal(out.length, 2);
});

test("the group's own words win, and fall back to the dish's when blank", () => {
  const rich = LATTE.map((x) =>
    x.id === "l16" ? { ...x, description: "Espresso, milk, caramel.", image_url: "16.jpg" } : x
  );
  const ids = inGroup({ l16: "g1", l22: "g1" });

  const [fallback] = buildProducts(rich, [group()], ids);
  assert.equal(fallback.description, "Espresso, milk, caramel.");
  assert.equal(fallback.image_url, "16.jpg");

  const [own] = buildProducts(rich, [group({ description: "  ", image_url: null })], ids);
  // Whitespace is not a description somebody wrote.
  assert.equal(own.description, "Espresso, milk, caramel.");

  const [set] = buildProducts(rich, [group({ description: "Our best seller." })], ids);
  assert.equal(set.description, "Our best seller.");
});

test("a card is sold out only when every way of having it has gone", () => {
  const ids = inGroup({ l16: "g1", l22: "g1" });
  const half = LATTE.map((x) => (x.id === "l16" ? { ...x, available: false } : x));
  assert.equal(buildProducts(half, [group()], ids)[0].soldOut, false);

  const all = LATTE.map((x) => ({ ...x, available: false }));
  assert.equal(buildProducts(all, [group()], ids)[0].soldOut, true);
});

test("the card's categories are the union of its dishes'", () => {
  const tagged = [
    { ...LATTE[0], categories: ["Drinks"] },
    { ...LATTE[1], categories: ["Drinks", "Iced"] },
  ];
  const [p] = buildProducts(tagged, [group()], inGroup({ l16: "g1", l22: "g1" }));
  assert.deepEqual(p.categories, ["Drinks", "Iced"]);
});

test("stars are weighted by how many people left them", () => {
  // Otherwise a variant with one five-star review outvotes one with forty
  // at 4.2, and the card advertises a rating the dish does not have.
  const rated = [
    { ...LATTE[0], avg_rating: 5, review_count: 1 },
    { ...LATTE[1], avg_rating: 4, review_count: 9 },
  ];
  const [p] = buildProducts(rated, [group()], inGroup({ l16: "g1", l22: "g1" }));
  assert.equal(p.reviewCount, 10);
  assert.equal(p.avgRating, 4.1);
});

test("no reviews reads as no stars, not as zero stars", () => {
  const [p] = buildProducts(LATTE, [group()], inGroup({ l16: "g1", l22: "g1" }));
  assert.equal(p.avgRating, null);
  assert.equal(p.reviewCount, 0);
});

test("cards are alphabetical unless the owner placed one", () => {
  const rows = [
    v({ id: "z", name: "Zongzi", price: 60 }),
    v({ id: "a", name: "Ancient Tea", price: 40 }),
  ];
  assert.deepEqual(
    buildProducts(rows, [], () => null).map((p) => p.name),
    ["Ancient Tea", "Zongzi"]
  );

  const placed = buildProducts(
    [...rows, ...LATTE],
    [group({ sort_order: -1 })],
    inGroup({ l16: "g1", l22: "g1" })
  );
  assert.equal(placed[0].name, "Iced Spanish Latte");
});

/* ------------------------------------------------------------------
 * The code and the calorie count on a card
 * ------------------------------------------------------------------ */

test("a card with one dish behind it carries that dish's code and figures", () => {
  const solo = [
    v({
      id: "s1",
      code: "C1",
      nutrition: {
        per: { kcal: 430, protein: 24, carbs: 33, fat: 21 },
        missing: 0,
        missingNames: [],
        manual: false,
      },
    }),
  ];
  const [p] = buildProducts(solo, [], () => null);
  assert.equal(p.code, "C1");
  assert.equal(p.nutrition?.per.kcal, 430);
});

test("a card holding a choice carries neither", () => {
  /**
   * Four ji pai behind one card have four codes and four calorie counts, and
   * a card is not the place to pick between them. Showing the first variant's
   * code sends somebody to the counter saying "C1" for a dish that is C3, and
   * a range of calories is noise. The chips inside the dish carry both.
   *
   * The screenshot pass could not prove this — the scratch page built the
   * Product by hand and skipped this function entirely — so it is pinned here.
   */
  const many = [
    v({ id: "a", code: "C1", nutrition: { per: { kcal: 430, protein: 24, carbs: 33, fat: 21 }, missing: 0, missingNames: [], manual: false } }),
    v({ id: "b", code: "C2", nutrition: { per: { kcal: 742, protein: 38, carbs: 61, fat: 37 }, missing: 0, missingNames: [], manual: false } }),
  ];
  const [p] = buildProducts(many, [group()], inGroup({ a: "g1", b: "g1" }));
  assert.equal(p.variants.length, 2, "the fixture did not actually group them");
  assert.equal(p.code, null);
  assert.equal(p.nutrition, null);
});

test("a dish with no code and no figures is null rather than undefined", () => {
  // The card checks `product.code &&` — an undefined would work by accident
  // and then stop working the day somebody writes `code !== null`.
  const [p] = buildProducts([v({ id: "plain" })], [], () => null);
  assert.equal(p.code, null);
  assert.equal(p.nutrition, null);
});
