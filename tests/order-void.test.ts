import test from "node:test";
import assert from "node:assert/strict";

import {
  VOID_REASONS,
  cleanVoidReason,
  closureLabel,
  isVoided,
  wasCalledOff,
} from "../src/lib/order-void.ts";
import { CANCEL_REASONS } from "../src/lib/cancellation.ts";

/**
 * A void and a cancellation are the same row and must never be the same
 * number.
 *
 * Both are `status = 'cancelled'` in the database — deliberately, because
 * that is what keeps a voided ticket out of all twenty-eight revenue queries
 * without one of them being edited. The cost of that choice is that nothing
 * can tell them apart by status alone, so every place that COUNTS
 * cancellations has to ask here. These tests are what stops the two drifting
 * back together.
 */

const order = (over: Partial<{ status: string; voided_at: string | null }> = {}) => ({
  status: "cancelled",
  voided_at: null as string | null,
  ...over,
});

test("a void is recognised by its stamp, not by its words", () => {
  assert.equal(isVoided(order({ voided_at: "2026-10-03T04:00:00Z" })), true);
  assert.equal(isVoided(order()), false);
  // The reason text is typed by a person and can say anything at all. If the
  // words were what decided it, a cancellation whose reason happens to read
  // "rung up wrong" would quietly leave the cancellation rate.
  assert.equal(isVoided({ status: "cancelled" }), false);
});

test("only a real order that fell through counts as a cancellation", () => {
  assert.equal(wasCalledOff(order()), true);
  assert.equal(wasCalledOff(order({ voided_at: "2026-10-03T04:00:00Z" })), false);
  assert.equal(wasCalledOff(order({ status: "completed" })), false);
  assert.equal(wasCalledOff(order({ status: "pending" })), false);
});

test("the screen says the right word for the same status", () => {
  assert.equal(closureLabel(order()), "Cancelled");
  assert.equal(closureLabel(order({ voided_at: "2026-10-03T04:00:00Z" })), "Voided");
});

test("the two reason lists never overlap", () => {
  // The whole feature is the claim that these are different events. One
  // phrase appearing in both lists would put the same reason on both sides
  // of the cancellation rate, which is the bug this feature exists to fix —
  // "Rung up wrong" and "Duplicate order" lived in CANCEL_REASONS until now.
  const shared = (VOID_REASONS as readonly string[]).filter((r) =>
    (CANCEL_REASONS as readonly string[]).includes(r)
  );
  assert.deepEqual(shared, [], `these belong to one list or the other: ${shared}`);
  assert.ok(
    !(CANCEL_REASONS as readonly string[]).includes("Rung up wrong"),
    "a mis-punched till is not a customer the shop lost"
  );
});

test("a void must say why", () => {
  assert.equal(cleanVoidReason("").reason, null);
  assert.ok(cleanVoidReason("").error);
  assert.equal(cleanVoidReason("   ").reason, null);
  assert.equal(cleanVoidReason(null).reason, null);
  assert.equal(cleanVoidReason(undefined).reason, null);
});

test("a reason is tidied the same way a cancellation's is", () => {
  assert.equal(cleanVoidReason("  Rung   up  wrong  ").reason, "Rung up wrong");
  assert.equal(cleanVoidReason("Rung up wrong").error, null);
  // Capped, so one pasted paragraph cannot become the row.
  assert.equal(cleanVoidReason("x".repeat(500)).reason?.length, 200);
});

test("a cancellation rate built from a mixed day counts only the real ones", () => {
  // The shape of the bug, in one assertion: a shop that took four orders,
  // lost one and double-punched one more.
  const day = [
    order({ status: "completed" }),
    order({ status: "completed" }),
    order(), // a customer changed their mind
    order({ voided_at: "2026-10-03T04:00:00Z" }), // punched twice
  ];
  const real = day.filter((o) => !isVoided(o));
  assert.equal(real.length, 3, "the void was never an order the shop took");
  assert.equal(real.filter(wasCalledOff).length, 1);
  assert.equal(
    Math.round((real.filter(wasCalledOff).length / real.length) * 100),
    33,
    "one in three, not one in four — the till's mistake is not the kitchen's"
  );
});
