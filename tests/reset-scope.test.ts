import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * What "Start fresh" is allowed to touch.
 *
 * This reads the source rather than running it, because the thing worth
 * guarding is not a return value — it is which tables a branch names, and the
 * only way to find that out by running it is to point it at a real database
 * and let it delete things.
 *
 * The property being locked down is the one the owner asked for in plain
 * words: clearing the stock counts must never cost them the recipe book. The
 * ingredients, the batches and every gram and piece in a recipe took weeks to
 * type and have nothing to do with how much is on the shelf today. A future
 * edit that slips `meal_ingredients` into the wrong branch would not fail any
 * other test, would not fail the build, and would not be noticed until
 * somebody pressed the button and lost a fortnight.
 */

const SOURCE = readFileSync("src/app/admin/reset/actions.ts", "utf8");

/** The body of one `if (...) {` block, brace-matched. */
function branch(opener: string): string {
  const at = SOURCE.indexOf(opener);
  assert.notEqual(at, -1, `no branch opening with: ${opener}`);
  let depth = 0;
  for (let i = at; i < SOURCE.length; i++) {
    if (SOURCE[i] === "{") depth++;
    else if (SOURCE[i] === "}") {
      depth--;
      if (depth === 0) return SOURCE.slice(at, i + 1);
    }
  }
  throw new Error("unbalanced braces");
}

/** `db.from("x")` — what the branch actually reaches for. */
function tablesTouched(code: string): Set<string> {
  return new Set(
    [...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1])
  );
}

const zeroing = branch("if (zeroInventory) {");
const wiping = branch("if (wipeInventory) {");

test("clearing the counts never touches a recipe", () => {
  // The shop's own knowledge of how its food is made. None of it is a count.
  for (const table of [
    "meal_ingredients",
    "batch_ingredients",
    "meal_packaging",
    "meals",
  ]) {
    assert.equal(
      tablesTouched(zeroing).has(table),
      false,
      `"just the numbers" must not touch ${table}`
    );
  }
});

test("clearing the counts keeps the ingredients and batches themselves", () => {
  // It may WRITE to them — that is how a count gets to zero — but it must not
  // delete the rows. The row is the ingredient.
  for (const table of ["ingredients", "batches"]) {
    assert.match(
      zeroing,
      new RegExp(`from\\("${table}"\\)\\s*\\n?\\s*\\.update\\(`),
      `${table} should be updated, not deleted`
    );
    assert.equal(
      new RegExp(`from\\("${table}"\\)\\s*\\.delete\\(`).test(zeroing),
      false,
      `${table} must not be deleted when only the counts are being cleared`
    );
  }
});

test("clearing the counts does clear the counts, and the history behind them", () => {
  // Zeroing the shelf while leaving a month of practice consumption behind
  // would leave the reorder suggestions buying pork for customers who never
  // existed — the two numbers have to move together.
  for (const table of [
    "ingredient_lots",
    "purchase_log",
    "consumption_log",
    "waste_log",
    "cycle_counts",
  ]) {
    assert.equal(
      tablesTouched(zeroing).has(table),
      true,
      `"just the numbers" should clear ${table}`
    );
  }
  assert.match(zeroing, /\.update\(\{ stock: 0 \}\)/);
  assert.match(zeroing, /\.update\(\{ batch_stock: 0 \}\)/);
});

test("the full wipe still exists, and still takes the recipes with it", () => {
  // The gentle default must not have quietly removed the option. A shop that
  // typed the wrong ingredients still needs a way to start over.
  for (const table of ["meal_ingredients", "ingredients", "batches"]) {
    assert.equal(tablesTouched(wiping).has(table), true, `full wipe should clear ${table}`);
  }
});

test("the destructive branch is the one that has to ask for itself", () => {
  // Anything that is not exactly "everything" falls to the gentle branch, so
  // a stale tab posting the older shape of the form cannot delete a recipe.
  assert.match(
    SOURCE,
    /const wipeInventory =\s*\n?\s*input\.scope\.inventory && input\.scope\.inventoryMode === "everything";/
  );
  assert.match(SOURCE, /const zeroInventory = input\.scope\.inventory && !wipeInventory;/);
});

/* ---- the money side ------------------------------------------------ */

const moneying = branch("if (input.scope.money) {");
const historying = branch("if (input.scope.history) {");

test("money records means every table that holds money", () => {
  /**
   * Three of these shipped in later migrations and nobody came back to add
   * them here, so "money records" quietly meant five of the eight things it
   * said — and an owner clearing the practice data kept practice utang to
   * suppliers and practice electricity bills under a screen that had told
   * them the money was gone.
   *
   * Listed by name rather than counted, so the next table that arrives has
   * to be argued about here instead of being forgotten in silence.
   */
  for (const table of [
    "cash_ledger",
    "fixed_costs",
    // The months recorded against those bills. The FK cascades, so leaving
    // this out would still clear the rows — and report a count that covered
    // none of them.
    "monthly_bills",
    "assets",
    "receivables",
    "oe_templates",
    "supplier_debts",
    "running_costs",
    "marketing_campaigns",
  ]) {
    assert.equal(
      tablesTouched(moneying).has(table),
      true,
      `clearing money should clear ${table}`
    );
  }
});

test("the suppliers themselves are not money", () => {
  // A supplier is a name and a phone number the owner typed — the same kind
  // of thing as an ingredient. What they were owed goes; who they are stays.
  assert.equal(
    new RegExp(`from\\("suppliers"\\)\\s*\\.delete\\(`).test(moneying),
    false,
    "the supplier directory must survive a money reset"
  );
});

test("the opening balances only go when they are asked for", () => {
  // The one thing this whole file touches in `settings`, which are otherwise
  // never in scope — so it sits behind its own choice rather than folded in.
  const guarded = branch('if (input.scope.moneyMode === "everything") {');
  assert.match(guarded, /from\("settings"\)/);
  for (const field of [
    "cash_balance_starting_amount",
    "gcash_balance_starting_amount",
    "bank_balance_starting_amount",
  ]) {
    assert.match(guarded, new RegExp(`${field}: 0`), `${field} should be zeroed`);
  }
  // And nowhere else in the money branch.
  const outside = moneying.replace(guarded, "");
  assert.equal(
    /from\("settings"\)/.test(outside),
    false,
    "settings must not be touched unless the balances were asked for"
  );
});

test("shifts cannot be cleared out from under the orders that point at them", () => {
  // `orders.shift_id` has no ON DELETE, so Postgres would refuse and hand the
  // owner a foreign-key error to decode. Refused in words instead.
  assert.match(historying, /from\("orders"\)/);
  assert.match(historying, /Tick orders as well/);
  for (const table of ["staff_shifts", "activity_log"]) {
    assert.equal(tablesTouched(historying).has(table), true, `history should clear ${table}`);
  }
});

/**
 * Clearing "the menu" has to clear the whole menu.
 *
 * It used to delete `meals` and stop. What was left behind was not neutral:
 * `modifier_options.option_meal_id` is ON DELETE SET NULL, so every add-on
 * group survived with its options pointing at nothing — add-ons that still
 * appeared on the menu, still charged for themselves, and put no food in the
 * order. Alongside them sat menu cards with no dishes in them and category
 * pills filtering an empty menu.
 */
const menu = branch("if (input.scope.menu) {");

test("clearing the menu takes the add-ons with it", () => {
  // Groups, not options: deleting the group cascades to its options, and to
  // both join tables. Deleting options alone would leave empty groups.
  assert.equal(
    tablesTouched(menu).has("modifier_groups"),
    true,
    "an add-on group left standing is an add-on that adds nothing"
  );
});

test("clearing the menu takes the cards and the categories", () => {
  for (const table of ["menu_products", "menu_categories"]) {
    assert.equal(
      tablesTouched(menu).has(table),
      true,
      `"the whole menu" has to include ${table}`
    );
  }
});

test("clearing the menu still refuses while orders reference it", () => {
  // The guard that turns a foreign-key error into a sentence. Widening what
  // this branch deletes must not quietly step around it.
  assert.match(menu, /scope\.orders/);
  assert.match(menu, /can't be cleared while orders still reference it/);
});

/**
 * Add-ons are the menu, not an order.
 *
 * `order_line_extras` must never be named here: it hangs off `order_lines`
 * and cascades with them. Naming it in the menu branch would delete what past
 * customers were charged for while their orders stayed on the books.
 */
test("clearing the menu never touches what past orders were charged", () => {
  assert.equal(tablesTouched(menu).has("order_line_extras"), false);
  assert.equal(tablesTouched(menu).has("order_lines"), false);
});
