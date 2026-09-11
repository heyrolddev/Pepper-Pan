import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINE_QTY,
  cartQuantityProblem,
  quantityProblem,
} from "../src/lib/orders.ts";

/**
 * How many of one dish may go on one line.
 *
 * These exist because `placeOrder` — the only order-writing action the public
 * can reach — checked the price, the delivery fee, the stock, the phone
 * number, the opening hours and whether the account was blocked, and did not
 * check the quantity. `updateMyOrder`, two files away, did.
 */

test("THE BUG: a negative quantity is refused", () => {
  // Sent to placeOrder, this produced a negative subtotal and wrote a
  // negative sale into the takings, the profit figures and the analytics.
  assert.ok(quantityProblem(-10));
  assert.ok(quantityProblem(-1));
});

test("WHY IT GOT THROUGH: the stock check cannot catch it", () => {
  // Not a test of our code — a test of the reasoning, so the next person to
  // touch the stock check knows why the quantity is guarded before it.
  // "Do we have fewer than they asked for?" is false when they asked for
  // less than nothing, so a negative order never looked short of stock.
  const stockOnHand = 5;
  const asked = -10;
  assert.equal(stockOnHand < asked, false);
});

test("zero is refused on a new order", () => {
  assert.ok(quantityProblem(0));
});

test("zero is allowed when editing an order — it means 'take this off'", () => {
  assert.equal(quantityProblem(0, { allowZero: true }), null);
  // but negative still is not "removed"
  assert.ok(quantityProblem(-1, { allowZero: true }));
});

test("half a serving is refused", () => {
  assert.ok(quantityProblem(0.5));
  assert.ok(quantityProblem(2.5));
  assert.ok(quantityProblem(1.0000001));
});

test("one and ninety-nine are both fine; a hundred is not", () => {
  assert.equal(quantityProblem(1), null);
  assert.equal(quantityProblem(MAX_LINE_QTY), null);
  assert.ok(quantityProblem(MAX_LINE_QTY + 1));
  assert.ok(quantityProblem(999999));
});

test("anything that is not a real number is refused", () => {
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, "3", "3; drop table", {}, []]) {
    assert.ok(quantityProblem(bad as unknown), `${String(bad)} should be refused`);
  }
});

test("the refusal is a sentence a customer can act on, not a code", () => {
  const message = quantityProblem(-5);
  assert.ok(message && message.length > 20);
  assert.ok(!/undefined|NaN|null/.test(message));
});

test("a whole cart is checked, and the first problem is the one reported", () => {
  assert.equal(cartQuantityProblem([{ qty: 1 }, { qty: 2 }, { qty: 99 }]), null);
  assert.ok(cartQuantityProblem([{ qty: 1 }, { qty: -3 }]));
  // One good line does not excuse a bad one, wherever it sits.
  assert.ok(cartQuantityProblem([{ qty: -3 }, { qty: 1 }]));
  assert.ok(cartQuantityProblem([{ qty: 1 }, { qty: 1 }, { qty: 0.5 }]));
});

test("an empty cart has no quantity problem — that is a different error", () => {
  assert.equal(cartQuantityProblem([]), null);
});

test("the ceiling is a number, not a magic literal in three files", () => {
  assert.equal(typeof MAX_LINE_QTY, "number");
  assert.ok(Number.isInteger(MAX_LINE_QTY) && MAX_LINE_QTY > 0);
});
