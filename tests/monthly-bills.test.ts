import test from "node:test";
import assert from "node:assert/strict";

import {
  AVERAGE_MONTHS,
  billLines,
  missingFor,
  monthLabel,
  monthOf,
  monthTotals,
  monthlyTotal,
  shiftMonth,
  shortMonth,
  type Bill,
  type BillMonth,
} from "../src/lib/monthly-bills.ts";

const TODAY = "2026-09-14";

function bill(id: string, label: string, estimate = 0, active = true): Bill {
  return { id, label, kind: "utility", estimate, active };
}

let seq = 0;
function month(billId: string, m: string, amount: number): BillMonth {
  seq += 1;
  return { id: `e${seq}`, billId, month: m, amount, note: null };
}

// ---- month arithmetic ----------------------------------------------------

test("a date collapses to the first of its month", () => {
  assert.equal(monthOf("2026-09-14"), "2026-09-01");
  assert.equal(monthOf("2026-09-01"), "2026-09-01");
  assert.equal(monthOf("2026-12-31"), "2026-12-01");
});

test("shifting months crosses the year in both directions", () => {
  assert.equal(shiftMonth("2026-09-01", -1), "2026-08-01");
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(shiftMonth("2026-01-01", -13), "2024-12-01");
  assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
  assert.equal(shiftMonth("2026-09-01", 0), "2026-09-01");
});

test("going back past January does not land in the year zero", () => {
  // Truncating `-1 / 12` to 0 instead of flooring is what this catches.
  assert.equal(shiftMonth("2026-01-01", -12), "2025-01-01");
  assert.equal(shiftMonth("2026-02-01", -14), "2024-12-01");
});

test("months are named, not numbered", () => {
  assert.equal(monthLabel("2026-09-01"), "September 2026");
  assert.equal(monthLabel("2026-01-01"), "January 2026");
  assert.equal(shortMonth("2026-09-01"), "Sep 2026");
});

// ---- the figure break-even uses ------------------------------------------

test("a bill with no recorded month falls back to its estimate, and says so", () => {
  const [line] = billLines([bill("k", "Kuryente", 2000)], [], TODAY);
  assert.equal(line.monthly, 2000);
  assert.equal(line.basis, "estimate");
  assert.equal(line.monthsAveraged, 0);
  assert.deepEqual(line.history, []);
});

test("three recorded months average, and the basis stops being a guess", () => {
  const [line] = billLines(
    [bill("k", "Kuryente", 999)],
    [
      month("k", "2026-09-01", 2000),
      month("k", "2026-08-01", 1200),
      month("k", "2026-07-01", 3100),
    ],
    TODAY
  );
  // The owner's own example: 2000, 1200, 3100.
  assert.equal(line.monthly, (2000 + 1200 + 3100) / 3);
  assert.equal(line.basis, "average");
  assert.equal(line.monthsAveraged, 3);
  // And the estimate is ignored once there is evidence.
  assert.notEqual(line.monthly, 999);
});

test("only the newest three recorded months count", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [
      month("k", "2026-06-01", 10_000),
      month("k", "2026-09-01", 100),
      month("k", "2026-07-01", 300),
      month("k", "2026-08-01", 200),
    ],
    TODAY
  );
  assert.equal(AVERAGE_MONTHS, 3);
  assert.equal(line.monthly, 200);
  assert.equal(line.monthsAveraged, 3);
});

test("one recorded month averages over one, not over three", () => {
  // Dividing by AVERAGE_MONTHS regardless would report a ₱1,800 bill as
  // ₱600 — break-even a third of what it should be, on a screen that looks
  // entirely normal.
  const [line] = billLines([bill("k", "Kuryente", 500)], [month("k", "2026-09-01", 1800)], TODAY);
  assert.equal(line.monthly, 1800);
  assert.equal(line.monthsAveraged, 1);
});

test("history comes back newest first however it arrives", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-07-01", 3100), month("k", "2026-09-01", 2000), month("k", "2026-08-01", 1200)],
    TODAY
  );
  assert.deepEqual(
    line.history.map((h) => h.month),
    ["2026-09-01", "2026-08-01", "2026-07-01"]
  );
});

// ---- the trap this was written around ------------------------------------

test("a bill nobody has entered this month still uses the months it has", () => {
  // Tubig has not arrived yet. Averaging over the last three CALENDAR months
  // would put a zero in September and cut tubig by a third — break-even
  // falling because more was recorded, not less.
  const lines = billLines(
    [bill("k", "Kuryente"), bill("t", "Tubig")],
    [
      month("k", "2026-09-01", 2000),
      month("k", "2026-08-01", 2000),
      month("t", "2026-08-01", 600),
      month("t", "2026-07-01", 600),
    ],
    TODAY
  );
  const tubig = lines.find((l) => l.id === "t")!;
  assert.equal(tubig.monthly, 600);
  assert.equal(tubig.thisMonth, null);
  assert.equal(monthlyTotal(lines), 2600);
});

test("this month's own figure is reported separately from the average", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-09-01", 2000), month("k", "2026-08-01", 1200)],
    TODAY
  );
  assert.equal(line.thisMonth, 2000);
  assert.equal(line.monthly, 1600);
});

// ---- the trend -----------------------------------------------------------

test("the trend compares the two newest recorded months", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-09-01", 2000), month("k", "2026-08-01", 1200)],
    TODAY
  );
  assert.ok(Math.abs(line.change! - 800 / 1200) < 1e-9);
  assert.equal(line.changeFrom, "2026-08-01");
});

test("a single recorded month has nothing to compare against", () => {
  const [line] = billLines([bill("k", "Kuryente")], [month("k", "2026-09-01", 2000)], TODAY);
  assert.equal(line.change, null);
  assert.equal(line.changeFrom, null);
});

test("a rise from zero is not reported as an infinite rise", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-09-01", 2000), month("k", "2026-08-01", 0)],
    TODAY
  );
  assert.equal(line.change, null);
});

test("a fall is negative", () => {
  const [line] = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-09-01", 1200), month("k", "2026-08-01", 3100)],
    TODAY
  );
  assert.ok(line.change! < 0);
});

// ---- totals --------------------------------------------------------------

test("an inactive bill keeps its history but leaves the total alone", () => {
  const lines = billLines(
    [bill("k", "Kuryente", 0, true), bill("w", "Wifi", 0, false)],
    [month("k", "2026-09-01", 2000), month("w", "2026-09-01", 1500)],
    TODAY
  );
  assert.equal(monthlyTotal(lines), 2000);
  assert.equal(lines.find((l) => l.id === "w")!.history.length, 1);
});

test("the month-by-month total is a calendar column, gaps and all", () => {
  const totals = monthTotals(
    [
      month("k", "2026-09-01", 2000),
      month("t", "2026-09-01", 600),
      month("k", "2026-07-01", 3100),
    ],
    3,
    TODAY
  );
  assert.deepEqual(totals, [
    { month: "2026-09-01", amount: 2600 },
    // August really was not recorded, and a shorter bar is the honest answer
    // to "what did the shop pay in August".
    { month: "2026-08-01", amount: 0 },
    { month: "2026-07-01", amount: 3100 },
  ]);
});

test("the history runs back from whatever today is", () => {
  const totals = monthTotals([], 2, "2026-01-09");
  assert.deepEqual(
    totals.map((t) => t.month),
    ["2026-01-01", "2025-12-01"]
  );
});

test("what has not been entered for a month is answerable", () => {
  const lines = billLines(
    [bill("k", "Kuryente"), bill("t", "Tubig"), bill("w", "Wifi", 0, false)],
    [month("k", "2026-09-01", 2000)],
    TODAY
  );
  assert.deepEqual(
    missingFor(lines, "2026-09-01").map((l) => l.id),
    ["t"]
  );
  // The inactive one is not chased for a bill nobody pays any more.
  assert.equal(missingFor(lines, "2026-09-01").some((l) => l.id === "w"), false);
});

test("a nonsense amount cannot drag a total negative", () => {
  const lines = billLines(
    [bill("k", "Kuryente")],
    [month("k", "2026-09-01", Number.NaN), month("k", "2026-08-01", -500)],
    TODAY
  );
  assert.equal(monthlyTotal(lines), 0);
});
