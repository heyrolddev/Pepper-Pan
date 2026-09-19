import test from "node:test";
import assert from "node:assert/strict";
import { newestFirst, type Ordered } from "../src/lib/ledger-order.ts";

/**
 * The order the drawer's history reads in.
 *
 * These exist because this comparator shipped wrong. It sorted on the
 * accounting date alone, every line written on the same day therefore tied,
 * and a stable sort read them back in the order they were assembled: every
 * hand-typed row above every sale, regardless of which actually happened
 * last. The owner reported it as "naiistock yung chicken — kambal sa unahan",
 * and they were right.
 */

const row = (date: string, at?: string | null, id = ""): Ordered & { id: string } => ({
  date,
  at,
  id,
});

test("a later day comes first", () => {
  const rows = [row("2026-09-10", null, "old"), row("2026-09-17", null, "new")];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((r) => r.id),
    ["new", "old"]
  );
});

test("within one day, the later line comes first", () => {
  // The bug, exactly: a restock typed in the morning and a sale rung up in the
  // evening. Same date, so the old comparator called them equal and left the
  // restock on top for ever.
  const rows = [
    row("2026-09-17", "2026-09-17T07:05:00Z", "restock"),
    row("2026-09-17", "2026-09-17T18:40:00Z", "sale"),
  ];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((r) => r.id),
    ["sale", "restock"]
  );
});

test("the order it arrives in doesn't decide it", () => {
  // The old comparator's answer depended entirely on this, which is why the
  // bug looked like "typed rows are always first" rather than random.
  const morning = row("2026-09-17", "2026-09-17T07:05:00Z", "restock");
  const evening = row("2026-09-17", "2026-09-17T18:40:00Z", "sale");
  assert.deepEqual(
    [morning, evening].sort(newestFirst).map((r) => r.id),
    ["sale", "restock"]
  );
  assert.deepEqual(
    [evening, morning].sort(newestFirst).map((r) => r.id),
    ["sale", "restock"]
  );
});

test("the accounting day still wins over the time it was typed", () => {
  // A line filed to yesterday belongs under yesterday however late it was
  // entered — every balance on the money screen is computed from `date`.
  const rows = [
    row("2026-09-16", "2026-09-17T23:00:00Z", "filed-to-yesterday"),
    row("2026-09-17", "2026-09-17T06:00:00Z", "today"),
  ];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((r) => r.id),
    ["today", "filed-to-yesterday"]
  );
});

test("a line with no time sorts last within its day, never first", () => {
  // Every row written before migration 0045 has no time. Putting an unknown
  // above a known would recreate the original bug for exactly those rows.
  const rows = [
    row("2026-09-17", null, "no-time"),
    row("2026-09-17", "2026-09-17T06:00:00Z", "early"),
    row("2026-09-17", "2026-09-17T20:00:00Z", "late"),
  ];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((r) => r.id),
    ["late", "early", "no-time"]
  );
});

test("two lines with the same time keep their order rather than swapping", () => {
  const rows = [
    row("2026-09-17", "2026-09-17T12:00:00Z", "a"),
    row("2026-09-17", "2026-09-17T12:00:00Z", "b"),
  ];
  assert.deepEqual(
    [...rows].sort(newestFirst).map((r) => r.id),
    ["a", "b"]
  );
});
