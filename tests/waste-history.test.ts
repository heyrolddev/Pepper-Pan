import test from "node:test";
import assert from "node:assert/strict";

import {
  byDay,
  normaliseRange,
  preset,
  rangeDays,
  totals,
  worstOffenders,
  type WasteRow,
} from "../src/lib/waste-history.ts";

/**
 * The bin, read back over a stretch of days.
 *
 * Waste was written in three places and read in two, and neither of the two
 * was a history: both selected `total_cost` and summed it. So the shop could
 * see that ₱1,400 went in the bin and had no way to ask what it was. The one
 * listing that existed hung off a single ingredient's dialog and filtered
 * `source_type = 'inv'` — which means a batch or a whole dish written off
 * appeared in no history anywhere, while still reaching break-even.
 *
 * These cover the two things the reading-back can get wrong: the split
 * between spoilage and staff meals, and dates.
 */

const row = (
  id: string,
  date: string,
  name: string,
  cost: number,
  category: "waste" | "internal" = "waste"
): WasteRow => ({
  id,
  date,
  name,
  qty: 1,
  unit: "kg",
  reason: "Spoiled",
  note: null,
  cost,
  category,
  kind: "inv",
  loggedBy: null,
});

test("spoilage and staff meals are never one number", () => {
  // Both cost money and only one is a problem. A blended total is either an
  // unfair indictment of the kitchen or a hiding place for real spoilage,
  // depending which way the mix runs.
  const t = totals(
    [
      row("a", "2026-10-01", "Pork", 400),
      row("b", "2026-10-01", "Staff lunch", 250, "internal"),
      row("c", "2026-10-02", "Beansprouts", 100),
    ],
    2
  );
  assert.equal(t.spoiled, 500);
  assert.equal(t.internal, 250);
  assert.equal(t.all, 750, "the combined figure exists, for cash gone, and is separate");
  assert.equal(t.count, 3);
});

test("spoilage per day lets a week be compared with a month", () => {
  const t = totals([row("a", "2026-10-01", "Pork", 700)], 7);
  assert.equal(t.spoiledPerDay, 100);
});

test("an empty range is zero, not NaN", () => {
  const t = totals([], 0);
  assert.equal(t.spoiled, 0);
  assert.equal(t.spoiledPerDay, 0, "dividing by zero days must not reach the screen");
});

test("the worst offenders are spoilage only, ranked by money", () => {
  // Staff meals are not a leak. Ranking them beside spoilage sends somebody
  // after the wrong one.
  const worst = worstOffenders([
    row("a", "2026-10-01", "Pork", 400),
    row("b", "2026-10-02", "Pork", 500),
    row("c", "2026-10-02", "Noodles", 600),
    row("d", "2026-10-03", "Staff lunch", 2000, "internal"),
  ]);
  assert.deepEqual(
    worst.map((w) => [w.name, w.cost, w.times]),
    [
      ["Pork", 900, 2],
      ["Noodles", 600, 1],
    ]
  );
  assert.ok(
    !worst.some((w) => w.name === "Staff lunch"),
    "a ₱2,000 staff meal must not top the spoilage list"
  );
});

test("days group newest first and carry their own split", () => {
  const groups = byDay([
    row("a", "2026-10-01", "Pork", 400),
    row("b", "2026-10-03", "Noodles", 100),
    row("c", "2026-10-01", "Staff lunch", 250, "internal"),
  ]);
  assert.deepEqual(groups.map((g) => g.date), ["2026-10-03", "2026-10-01"]);
  assert.equal(groups[1].spoiled, 400);
  assert.equal(groups[1].internal, 250);
  assert.equal(groups[1].rows.length, 2);
});

test("the presets are built from the shop's today, in string arithmetic", () => {
  // Manila is UTC+8. A range built from local getters is right when tested
  // from here and a day out for everyone else — the bug that never shows up
  // in the place it was written.
  assert.deepEqual(preset("today", "2026-10-15"), { from: "2026-10-15", to: "2026-10-15" });
  assert.deepEqual(preset("week", "2026-10-15"), { from: "2026-10-09", to: "2026-10-15" });
  assert.deepEqual(preset("month", "2026-10-15"), { from: "2026-10-01", to: "2026-10-15" });
});

test("last month is the whole of it, including its real last day", () => {
  assert.deepEqual(preset("last-month", "2026-10-15"), {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  // 31-day month, a 28-day February, and a leap one — each a different last day.
  assert.deepEqual(preset("last-month", "2026-09-04"), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(preset("last-month", "2026-03-01"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(preset("last-month", "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" });
});

test("last month in January reaches back across the year", () => {
  assert.deepEqual(preset("last-month", "2026-01-09"), {
    from: "2025-12-01",
    to: "2025-12-31",
  });
});

test("the last 7 days crosses a month and a year without losing a day", () => {
  assert.deepEqual(preset("week", "2026-01-03"), { from: "2025-12-28", to: "2026-01-03" });
  assert.equal(rangeDays(preset("week", "2026-01-03")), 7);
});

test("dates typed in the wrong order are swapped, not refused", () => {
  // An empty result on a range the shop believes it typed correctly reads as
  // "we wasted nothing", which is the one wrong answer this screen must
  // never give.
  assert.deepEqual(normaliseRange("2026-10-20", "2026-10-01"), {
    from: "2026-10-01",
    to: "2026-10-20",
  });
  assert.deepEqual(normaliseRange("2026-10-01", "2026-10-20"), {
    from: "2026-10-01",
    to: "2026-10-20",
  });
});

test("a one-day range is one day, not zero", () => {
  assert.equal(rangeDays({ from: "2026-10-15", to: "2026-10-15" }), 1);
  assert.equal(rangeDays({ from: "2026-10-01", to: "2026-10-31" }), 31);
  // Across a leap February, where a hand-rolled table gets it wrong.
  assert.equal(rangeDays({ from: "2028-02-01", to: "2028-03-01" }), 30);
});

test("a negative cost still counts as money gone", () => {
  // Nothing should write one, which is exactly why a sign slipping through
  // would go unnoticed: it would SUBTRACT from the month's waste.
  const t = totals([row("a", "2026-10-01", "Pork", -400)], 1);
  assert.equal(t.spoiled, 400);
});
