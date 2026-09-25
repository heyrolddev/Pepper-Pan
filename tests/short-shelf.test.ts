import test from "node:test";
import assert from "node:assert/strict";

import { shortShelf, isLow } from "../src/lib/costing.ts";

/**
 * What the shop has less than none of.
 *
 * 0016 decided, correctly, that a shortfall is recorded rather than refused:
 * by the time stock moves the food has already left the kitchen, so refusing
 * the write would leave a served customer and no record of serving them. What
 * it did not do was give anyone a way to SEE the result. `ingredients.stock`
 * at −340g read as a number, every total treated it as a number, and the one
 * figure that said "your count and your sales do not agree" was invisible.
 *
 * These are the real numbers from the Giant Ji Pai shelf, which is the shape
 * this keeps happening in: a batch measured in packs and an ingredient
 * measured in grams, going short by very different amounts.
 */

const shelf = [
  { id: "breading", label: "Breading", kind: "ingredient" as const, unit: "g", stock: -340 },
  { id: "packs", label: "M. Giant Ji Pai", kind: "batch" as const, unit: "pack", stock: -2 },
  { id: "cheese", label: "CHEESE SLICE", kind: "ingredient" as const, unit: "pc", stock: 40 },
  { id: "taktak", label: "Taktak", kind: "ingredient" as const, unit: "g", stock: 0 },
];

test("only what is actually below zero is listed", () => {
  const out = shortShelf(shelf);
  assert.deepEqual(out.map((s) => s.id), ["breading", "packs"]);
});

test("zero is not short — it is empty, which is a different problem", () => {
  // A shelf at exactly 0 is a shelf you have run out of. That is what the
  // reorder level is for. Only a NEGATIVE means the records disagree.
  const out = shortShelf([
    { id: "taktak", label: "Taktak", kind: "ingredient" as const, unit: "g", stock: 0 },
  ]);
  assert.equal(out.length, 0);
});

test("the shortfall is reported as a positive amount", () => {
  const out = shortShelf(shelf);
  // "short by 340 g" reads; "short by -340 g" is a double negative nobody
  // parses at 5am.
  assert.equal(out[0].by, 340);
  assert.equal(out[1].by, 2);
  assert.ok(out.every((s) => s.by > 0));
});

test("each one keeps its own unit, so packs are never read as grams", () => {
  const out = shortShelf(shelf);
  assert.equal(out.find((s) => s.id === "breading")?.unit, "g");
  assert.equal(out.find((s) => s.id === "packs")?.unit, "pack");
});

test("a batch is marked as a batch, because the fix is different", () => {
  // A bought-in ingredient going short means a delivery was not logged. A
  // prepped batch going short means someone cooked without pressing Produce.
  const out = shortShelf(shelf);
  assert.equal(out.find((s) => s.id === "packs")?.kind, "batch");
  assert.equal(out.find((s) => s.id === "breading")?.kind, "ingredient");
});

test("worst first", () => {
  const out = shortShelf([
    { id: "a", label: "A", kind: "ingredient" as const, unit: "g", stock: -5 },
    { id: "b", label: "B", kind: "ingredient" as const, unit: "g", stock: -900 },
    { id: "c", label: "C", kind: "ingredient" as const, unit: "g", stock: -60 },
  ]);
  assert.deepEqual(out.map((s) => s.id), ["b", "c", "a"]);
});

test("a tie is broken by name rather than by whatever order the rows arrived", () => {
  const out = shortShelf([
    { id: "z", label: "Zucchini", kind: "ingredient" as const, unit: "g", stock: -10 },
    { id: "a", label: "Anise", kind: "ingredient" as const, unit: "g", stock: -10 },
  ]);
  assert.deepEqual(out.map((s) => s.label), ["Anise", "Zucchini"]);
});

test("a full shelf produces nothing, so the panel stays off the screen", () => {
  const out = shortShelf([
    { id: "a", label: "A", kind: "ingredient" as const, unit: "g", stock: 500 },
    { id: "b", label: "B", kind: "batch" as const, unit: "pack", stock: 13 },
  ]);
  assert.equal(out.length, 0);
});

test("a negative with no reorder level is invisible to the low-stock check", () => {
  /**
   * The reason this panel cannot be folded into the existing "needs buying"
   * list. `isLow` requires a reorder level above zero before it fires at all,
   * and most ingredients at this stall have never had one set. So an
   * ingredient can sit at −340g and be flagged by NOTHING on the page.
   *
   * If this test ever fails because `isLow` started catching negatives, the
   * panel can be reconsidered — but not before.
   */
  const unset = { id: "x", name: "No level set", unit: "g", stock: -340, reorder: 0 };
  assert.equal(isLow(unset as never), false);
  assert.equal(shortShelf([{ ...unset, label: unset.name, kind: "ingredient" as const }]).length, 1);
});

test("junk in the stock column does not crash the panel", () => {
  const out = shortShelf([
    { id: "a", label: "A", kind: "ingredient" as const, unit: "g", stock: NaN },
    { id: "b", label: "B", kind: "ingredient" as const, unit: "g", stock: -3 },
  ]);
  // NaN is not below zero and must not be reported as "short by NaN g".
  assert.deepEqual(out.map((s) => s.id), ["b"]);
});
