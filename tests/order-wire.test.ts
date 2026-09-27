import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The two ends of the order wire, checked against each other.
 *
 * `checkout-form.tsx` sent `optionIds`. `placeOrder` reads `options`. The two
 * had disagreed since add-ons shipped, and nothing anywhere noticed:
 *
 *   TypeScript could not. The array is built by `.map()`, so it is not a
 *   fresh object literal at the assignment site and excess-property checking
 *   does not apply — and `options` is optional, so a payload missing it is
 *   perfectly legal.
 *
 *   The tests could not. Every add-on test exercised `resolveChoice` with
 *   picks handed to it directly, which is the half that always worked.
 *
 *   The screen could not. The cart showed the extra rice, the total on the
 *   cart page included it, and the order simply arrived without it.
 *
 * So a customer asking for extra rice online was not charged for it, the
 * kitchen was never told to cook it, and the rice never came off the shelf.
 * Silent in all three directions, which is the shape of bug this project
 * keeps having to design against.
 *
 * Read as text rather than imported: both files are client/server modules
 * that pull in React and `server-only`, and the thing being checked is the
 * NAME of a field, which text is exactly the right tool for. Same mechanical
 * approach as `backup-coverage.test.ts`, for the same reason — a hand-kept
 * agreement between two files does not fail loudly when it drifts.
 */

const read = (p: string) => readFileSync(p, "utf8");

const CHECKOUT_FORM = read("src/components/checkout-form.tsx");
const CHECKOUT_ACTION = read("src/app/checkout/actions.ts");
const COUNTER_TILL = read("src/components/counter-till.tsx");
const COUNTER_ACTION = read("src/app/admin/counter/actions.ts");

/**
 * The field names inside one `.map((e) => ({ … }))` body, and no further.
 *
 * Bounded at the closing `}))` rather than by a character count. The first
 * version of this read 1200 characters from the anchor and swept up
 * `deliveryAddress` from the enclosing payload — a test that fails on
 * something true is a test somebody deletes.
 */
function keysSent(source: string, anchor: string): string[] {
  const at = source.indexOf(anchor);
  assert.notEqual(at, -1, `could not find ${anchor}`);
  const rest = source.slice(at);
  const end = rest.indexOf("})),");
  assert.notEqual(end, -1, `could not find the end of ${anchor}`);
  return [...rest.slice(0, end).matchAll(/^\s+([a-zA-Z]+):/gm)].map((m) => m[1]);
}

test("the checkout sends the field the action reads", () => {
  assert.match(CHECKOUT_FORM, /options: i\.extras\.map/);
  assert.match(CHECKOUT_ACTION, /const picks = item\.options \?\? \[\]/);
});

test("the checkout does not send a field nothing reads", () => {
  // The exact bug: a plausible name that no server anywhere looks at.
  assert.doesNotMatch(CHECKOUT_FORM, /optionIds:/);
});

test("the counter sends the field its action reads", () => {
  assert.match(COUNTER_TILL, /options: l\.extras\.map/);
  assert.match(COUNTER_ACTION, /const picks = l\.options \?\? \[\]/);
});

test("both surfaces send the chosen size", () => {
  // A sized add-on is priced and cooked by its size. Dropped on the wire, the
  // server sees a sized option with no size and refuses the whole line —
  // which is at least loud, unlike the bug above.
  for (const [name, source] of [
    ["checkout", CHECKOUT_FORM],
    ["counter", COUNTER_TILL],
  ] as const) {
    assert.match(source, /variantMealId: e\.variantMealId/, `${name} drops the size`);
  }
});

test("both actions accept the size on their input type", () => {
  for (const [name, source] of [
    ["checkout", CHECKOUT_ACTION],
    ["counter", COUNTER_ACTION],
  ] as const) {
    assert.match(
      source,
      /options\?: \{ id: string; qty: number; variantMealId\?: string \}\[\]/,
      `${name} has no place to put the size`
    );
  }
});

test("neither surface sends a price or a label", () => {
  // A cart is a suggestion. Every peso and every word on the receipt is
  // re-read from the menu — see `resolveChoice`. A `price:` here would be a
  // number the customer's browser chose.
  for (const [name, source, anchor] of [
    ["checkout", CHECKOUT_FORM, "options: i.extras.map"],
    ["counter", COUNTER_TILL, "options: l.extras.map"],
  ] as const) {
    const sent = keysSent(source, anchor);
    assert.ok(sent.length > 0, `${name} sends nothing at all`);
    for (const key of sent) {
      assert.ok(
        ["id", "qty", "variantMealId"].includes(key),
        `${name} sends "${key}", which the server would have to trust`
      );
    }
  }
});

/**
 * The save action's two loops must walk the same list.
 *
 * `saveModifierGroup` filters the owner's rows into `options`, writes them
 * in one loop and pushes each new id into `keep` — so `keep[at]` only means
 * anything against THAT array. A second loop over `input.options` with the
 * same `at` was the shape this caught: drop one half-filled row and every
 * per-size price after it lands on the wrong option. Not a crash, not a type
 * error — the large iced tea silently charges what the Coke charges.
 *
 * Mechanical because there is nothing else to check it. The two loops are
 * forty lines apart in one file, they agree only by convention, and the
 * failure is a number on a menu that nobody typed.
 */
const MODIFIER_ACTION = read("src/app/admin/menu/modifier-actions.ts");

test("every loop that indexes `keep` walks the filtered options", () => {
  const loops = [
    ...MODIFIER_ACTION.matchAll(
      /for \(const \[at, \w+\] of ([\w.]+)\.entries\(\)\)/g
    ),
  ].map((m) => m[1]);

  assert.ok(loops.length >= 2, `expected both loops, found ${loops.length}`);
  for (const walked of loops) {
    assert.equal(
      walked,
      "options",
      `a loop using \`at\` walks ${walked}, which \`keep\` is not indexed by`
    );
  }
  // And no stray index loop over the unfiltered input, which is the same
  // bug written the other way round.
  assert.doesNotMatch(MODIFIER_ACTION, /input\.options\[at\]/);
});

/**
 * A sized option is saved, not silently dropped.
 *
 * The filter that removes half-filled rows used to test `o.mealId` alone —
 * and a sized option has no `mealId` by design, so the group saved, the
 * dialog closed reporting success, and the drink was simply not there.
 */
test("the option filter keeps a sized option", () => {
  assert.match(MODIFIER_ACTION, /\.filter\(\(o\) => o\.mealId \|\| o\.productId\)/);
});

/**
 * The check-this-order preview and the paper are the same lines.
 *
 * The till says, under the preview, "everything else is exactly what will
 * print". That promise was kept by a second copy of the same mapping — and
 * a second copy is a promise only until either side gains a field. The
 * codes and the calories would have gone on the paper and not in the check,
 * so the cashier would have confirmed one thing and handed over another.
 *
 * Mechanical because nothing else can see it: both produce `ReceiptLine[]`,
 * so the types agree perfectly while the contents drift.
 */
const TILL = read("src/components/counter-till.tsx");

test("the preview and the printed receipt are built by one function", () => {
  const calls = [...TILL.matchAll(/receiptLines\(\)/g)].length;
  assert.ok(calls >= 2, `expected the builder to serve both, saw ${calls} call(s)`);

  // And no second mapping quietly rebuilding a line beside it.
  const inlined = [...TILL.matchAll(/lines\.map\(\(l\) => \(\{\s*\n\s*name: l\.meal\.name/g)];
  assert.equal(
    inlined.length,
    0,
    "a receipt line is being built somewhere other than `receiptLines`"
  );
});

test("both receipts carry the owner's calorie switch", () => {
  // The paper obeying a switch the preview ignores is the same drift with a
  // different field: the cashier checks a receipt with no figures on it and
  // hands over one covered in them.
  const flags = [...TILL.matchAll(/^\s*showNutrition,\s*$/gm)].length;
  assert.ok(flags >= 2, `expected both receipts to pass it, saw ${flags}`);
});
