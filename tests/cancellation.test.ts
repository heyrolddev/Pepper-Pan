import assert from "node:assert/strict";
import test from "node:test";
import {
  CANCEL_REASONS,
  REASON_LIMIT,
  cleanReason,
} from "../src/lib/cancellation.ts";

test("a cancellation must say why", () => {
  // The shop can no longer cancel silently: this is the only record of where
  // the money went.
  assert.equal(cleanReason("").error !== null, true);
  assert.equal(cleanReason("   ").error !== null, true);
  assert.equal(cleanReason(null).error !== null, true);
  assert.equal(cleanReason(undefined).error !== null, true);
});

test("a reason is tidied, not rejected, for whitespace and length", () => {
  assert.equal(cleanReason("  Never   collected  ").reason, "Never collected");
  // Capped rather than refused — a long explanation is still an explanation,
  // and refusing it at the counter would just get "asdf" instead.
  const long = cleanReason("x".repeat(500));
  assert.equal(long.error, null);
  assert.equal(long.reason!.length, REASON_LIMIT);
});

test("the reason list has no duplicates, since it is what gets counted later", () => {
  assert.equal(new Set(CANCEL_REASONS).size, CANCEL_REASONS.length);
});
