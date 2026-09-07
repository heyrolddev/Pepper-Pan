import assert from "node:assert/strict";
import test from "node:test";
import { orderLabel, ticketOf } from "../src/lib/tickets.ts";

test("a ticket is four digits, so the shop can say it out loud", () => {
  assert.equal(ticketOf(1), "#0001");
  assert.equal(ticketOf(42), "#0042");
  assert.equal(ticketOf(9999), "#9999");
});

test("it stops padding rather than truncating", () => {
  // The ten-thousandth order must not come out as #0000 and collide with the
  // first one — a handle that repeats is not a handle.
  assert.equal(ticketOf(10000), "#10000");
  assert.equal(ticketOf(123456), "#123456");
});

test("a missing ticket reads as a gap, not as a number", () => {
  // Old rows before the migration, and the review panel before the order
  // exists. A made-up number here is worse than an obvious blank.
  assert.equal(ticketOf(null), "----");
  assert.equal(ticketOf(undefined), "----");
  assert.equal(ticketOf(Number.NaN), "----");
});

test("a record names the order by ticket and by name when it has one", () => {
  assert.equal(orderLabel(42, "Maria"), "#0042 — Maria");
});

test("no name still leaves something searchable", () => {
  // This is the whole point of the ticket: the counter can decline to ask for
  // a name at a lunchtime queue and the owner can still find the sale.
  assert.equal(orderLabel(42, null), "#0042");
  assert.equal(orderLabel(42, "   "), "#0042");
});
