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
