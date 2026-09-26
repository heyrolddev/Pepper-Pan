import test from "node:test";
import assert from "node:assert/strict";

import { LOW_STOCK, stockBadge } from "../src/lib/costing.ts";

/**
 * What a till tile says about stock.
 *
 * The badge used to appear only below five. The owner asked why they could
 * not see how many were left, and they were right to: at a counter the
 * question is "how many can I still sell", and it gets asked whether the
 * answer is 2 or 40.
 *
 * Worse than the missing number was what the blank meant. A tile with forty
 * left and a tile whose recipe nobody had ever written looked IDENTICAL —
 * both empty — so "loads" and "the system has no idea" were one appearance.
 * That is the failure this file exists to stop coming back.
 */

test("a tile with plenty says how many, quietly", () => {
  const b = stockBadge(40);
  assert.equal(b.text, "40 left");
  assert.equal(b.level, "plenty");
});

test("a tile running low says the same thing, loudly", () => {
  const b = stockBadge(3);
  assert.equal(b.text, "3 left");
  assert.equal(b.level, "low");
});

test("plenty and no recipe never look the same again", () => {
  // The whole point. Both used to render nothing.
  const lots = stockBadge(40);
  const unknown = stockBadge(null);
  assert.notEqual(lots.text, unknown.text);
  assert.notEqual(lots.level, unknown.level);
  assert.equal(unknown.text, "no recipe");
});

test("the loud/quiet line is exactly where the constant says", () => {
  assert.equal(stockBadge(LOW_STOCK).level, "low");
  assert.equal(stockBadge(LOW_STOCK + 1).level, "plenty");
});

test("nothing left is its own state, not a count of zero", () => {
  // "0 left" on a tile you can still tap reads as a rounding error. The till
  // shows a button that asks why instead.
  const b = stockBadge(0);
  assert.equal(b.level, "out");
  assert.equal(b.text, "no stock");
});

test("a negative shelf reads as out, not as minus two left", () => {
  // Stock can go below zero — the database records a shortfall rather than
  // refusing the sale, see 0053. "−2 left" is not a thing to tell a cashier.
  assert.equal(stockBadge(-2).level, "out");
});

test("a fraction is rounded DOWN, never up", () => {
  // Two and a half portions is two portions you can sell. Rounding up
  // promises one the kitchen cannot make.
  assert.equal(stockBadge(2.9).text, "2 left");
  assert.equal(stockBadge(0.9).level, "out");
});

test("a big number stays small enough for a tile", () => {
  // Four digits do not fit on a tile the size of a thumb, and the difference
  // between 1,200 and 1,400 sachets of sugar is not a counter decision.
  assert.equal(stockBadge(1200).text, "999+ left");
  assert.equal(stockBadge(1200).level, "plenty");
  assert.equal(stockBadge(999).text, "999 left");
});

test("a thousand separators, because 1000 left is read as ten", () => {
  assert.equal(stockBadge(900).text, "900 left");
});

test("an unknown shelf is never reported as a number", () => {
  for (const v of [null, undefined, NaN, Infinity]) {
    const b = stockBadge(v as number | null | undefined);
    assert.equal(b.level, "none", `${String(v)} produced ${b.level}`);
    assert.equal(b.text, "no recipe");
  }
});
