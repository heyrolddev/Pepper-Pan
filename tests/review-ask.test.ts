import test from "node:test";
import assert from "node:assert/strict";
import { ASK_WITHIN_DAYS, orderToAskOn } from "../src/lib/review-ask.ts";

const NOW = new Date("2026-09-27T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const o = (id: string, status: string, days: number) => ({
  id,
  status,
  created_at: daysAgo(days),
});

test("the newest finished order carries it, and only that one", () => {
  // A regular with twenty completed orders should meet this once on the
  // page, not twenty times.
  const got = orderToAskOn(
    [o("old", "completed", 12), o("new", "completed", 2), o("mid", "completed", 5)],
    NOW
  );
  assert.equal(got, "new");
});

test("an order still being cooked is not a meal anybody can review", () => {
  for (const status of ["pending", "cooking", "ready", "cancelled"]) {
    assert.equal(orderToAskOn([o("x", status, 1)], NOW), null, status);
  }
});

test("a meal from last year is not something people write about", () => {
  // And being asked for it reads as a shop that has not noticed you
  // stopped coming.
  assert.equal(orderToAskOn([o("stale", "completed", 400)], NOW), null);
  assert.equal(orderToAskOn([o("edge", "completed", ASK_WITHIN_DAYS + 1)], NOW), null);
  assert.equal(orderToAskOn([o("just", "completed", ASK_WITHIN_DAYS - 1)], NOW), "just");
});

test("a recent finished order beats a newer unfinished one", () => {
  const got = orderToAskOn(
    [o("cooking-now", "cooking", 0), o("ate-yesterday", "completed", 1)],
    NOW
  );
  assert.equal(got, "ate-yesterday");
});

test("a customer with nothing finished is not asked", () => {
  assert.equal(orderToAskOn([], NOW), null);
  assert.equal(orderToAskOn([o("a", "pending", 0)], NOW), null);
});

test("a row with a broken date is skipped, not treated as today", () => {
  // Otherwise the ask lands on the one row whose data is wrong.
  const got = orderToAskOn(
    [
      { id: "broken", status: "completed", created_at: "not a date" },
      o("fine", "completed", 3),
    ],
    NOW
  );
  assert.equal(got, "fine");
  assert.equal(
    orderToAskOn([{ id: "broken", status: "completed", created_at: "nope" }], NOW),
    null
  );
});

test("a Date works as well as a string", () => {
  assert.equal(
    orderToAskOn([{ id: "d", status: "completed", created_at: new Date(daysAgo(1)) }], NOW),
    "d"
  );
});

test("a future-dated row is recent, not stale", () => {
  // Clock skew between a phone and the server should not silence the ask.
  assert.equal(
    orderToAskOn([{ id: "ahead", status: "completed", created_at: daysAgo(-1) }], NOW),
    "ahead"
  );
});

test("the same list always picks the same order, whatever its order", () => {
  const rows = [o("a", "completed", 9), o("b", "completed", 2), o("c", "completed", 4)];
  assert.equal(orderToAskOn(rows, NOW), "b");
  assert.equal(orderToAskOn([...rows].reverse(), NOW), "b");
});
