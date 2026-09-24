import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { batchStockValue, shelfTotal, stockValue } from "../src/lib/costing.ts";

/**
 * What the shelves are worth, with the prepped batches counted.
 *
 * The bug this exists for: the total was the ingredients alone, so a morning
 * spent making sauces made the figure go DOWN. The peanuts left
 * `ingredients.stock` and the sauce they turned into was worth nothing to the
 * screen — the shop looked poorer for having done the work.
 */

const ing = (stock: number, cost: number) =>
  ({ stock, cost }) as unknown as Parameters<typeof stockValue>[0];

test("a batch is worth its stock times its cost per yield unit", () => {
  // `batch_stock` is held in YIELD units — producing one batch adds
  // `yield_qty` to it — so the two simply multiply, as for an ingredient.
  assert.equal(batchStockValue({ stock: 2400, perUnit: 0.85 }), 2040);
});

test("a batch nobody has made yet is worth nothing, not NaN", () => {
  assert.equal(batchStockValue({ stock: 0, perUnit: 1.2 }), 0);
  assert.equal(batchStockValue({ stock: 500, perUnit: 0 }), 0);
});

test("prepping does not make the shop poorer", () => {
  // The exact shape of the bug. Before: ₱1,000 of peanuts on the shelf. After
  // a morning's work: no peanuts, and 2,000 units of sauce that cost ₱1,000
  // to make. The total must not move.
  const before = shelfTotal([{ value: stockValue(ing(1000, 1)), priced: true }]);
  const after = shelfTotal([
    { value: stockValue(ing(0, 1)), priced: true },
    { value: batchStockValue({ stock: 2000, perUnit: 0.5 }), priced: true },
  ]);
  assert.equal(before.total, 1000);
  assert.equal(after.total, 1000, "making a batch moved the shelf total");
});

test("ingredients and batches add together", () => {
  const { total } = shelfTotal([
    { value: stockValue(ing(500, 0.23)), priced: true },   // 115
    { value: stockValue(ing(12, 45)), priced: true },      // 540
    { value: batchStockValue({ stock: 800, perUnit: 1.1 }), priced: true }, // 880
  ]);
  assert.equal(total, 1535);
});

test("anything with no price is counted and said out loud", () => {
  // An unpriced item contributes exactly zero, so the total reads low. A
  // figure that is quietly low is worse than one that says it is.
  const { total, unpriced } = shelfTotal([
    { value: 900, priced: true },
    { value: 0, priced: false },
    { value: 0, priced: false },
  ]);
  assert.equal(total, 900);
  assert.equal(unpriced, 2);
});

test("an empty store room is zero and not a complaint", () => {
  assert.deepEqual(shelfTotal([]), { total: 0, unpriced: 0 });
});

/* ---- the two places that must agree ---- */

test("the inventory screen totals batches as well as ingredients", () => {
  // The screen is what the owner reads at 5am. If this ever goes back to
  // summing `stock` alone, the figure silently drops by whatever is prepped.
  const src = readFileSync("src/components/inventory-view.tsx", "utf8");
  assert.match(src, /shelfTotal\(/);
  assert.match(src, /batchStockValue\(/);
});

test("the exported spreadsheet holds both too", () => {
  // An accountant totalling the CSV must reach the same number as the screen,
  // or one of them is wrong and nobody can tell which.
  const src = readFileSync("src/app/admin/backup/download/route.ts", "utf8");
  const at = src.indexOf('kind === "inventory.csv"');
  assert.notEqual(at, -1);
  const body = src.slice(at, at + 3000);
  assert.match(body, /batchStockValue\(/);
  assert.match(body, /stockValue\(/);
  // And it says which rows are which, so the file can still be filtered.
  assert.match(body, /"Kind"/);
});
