import test from "node:test";
import assert from "node:assert/strict";
import { unitPeso } from "../src/lib/peso.ts";

/**
 * A unit cost should not look like a number with something stuck on it.
 *
 * "₱18.7510 / pack", two words from "₱18.75 a batch", read as a typo. It was
 * not: it was ₱18.751 at four decimals. The precision is real and needed —
 * a gram of salt is fractions of a centavo — it just should not be spent on
 * a figure that has no use for it.
 */
test("a unit cost keeps only the decimals it needs", () => {
  assert.equal(unitPeso(18.75), "₱18.75");
  assert.equal(unitPeso(18.751), "₱18.751");
  assert.equal(unitPeso(18.7510), "₱18.751");
  // Two is the floor: money below a peso still has to look like money.
  assert.equal(unitPeso(19), "₱19.00");
  assert.equal(unitPeso(0), "₱0.00");
});

test("a fraction of a centavo survives, because a recipe is built of them", () => {
  assert.equal(unitPeso(0.0012), "₱0.0012");
  assert.equal(unitPeso(0.45), "₱0.45");
  // Four is the ceiling — below that it is rounded, not truncated.
  assert.equal(unitPeso(0.00125), "₱0.0013");
  assert.equal(unitPeso(0.000049), "₱0.00");
});

test("float noise does not become a decimal place", () => {
  assert.equal(unitPeso(18.750000000000004), "₱18.75");
  assert.equal(unitPeso(0.1 + 0.2), "₱0.30");
});

test("the minus goes outside the symbol here too", () => {
  assert.equal(unitPeso(-18.751), "−₱18.751");
});

test("thousands are still grouped", () => {
  assert.equal(unitPeso(1234.5), "₱1,234.50");
});
