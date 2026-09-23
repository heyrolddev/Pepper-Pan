import test from "node:test";
import assert from "node:assert/strict";
import {
  monthlyRunningRate,
  tankLife,
  type RunningCost,
} from "../src/lib/spending.ts";

/**
 * Gas, and the other money that leaves without becoming a dish.
 *
 * The owner's question was the right one: gas doesn't run out on a schedule,
 * it runs out according to how many orders went through — and the price moves
 * between refills. So the figure can't be a fixed cost and the reminder can't
 * be a calendar. Both have to be worked out from the refills themselves.
 */

const gas = (spentOn: string, size: string, amount: number): RunningCost => ({
  id: spentOn + size,
  label: "Gas refill",
  kind: "gas",
  amount,
  sizeLabel: size,
  spentOn,
  ledgerId: null,
  supplierName: null,
  note: null,
});

test("how long a tank lasts comes from the gaps between refills", () => {
  // Three 22kg tanks, 24 days apart. Nobody typed "24" anywhere.
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980),
    gas("2026-08-18", "22kg", 2100),
  ];
  const [t] = tankLife(rows, "2026-08-20");
  assert.equal(t.size, "22kg");
  assert.equal(t.days, 24);
  assert.equal(t.sinceLast, 2);
  assert.equal(t.dueNow, false);
});

test("the price moving between refills changes nothing about the life", () => {
  // ₱2,040 then ₱1,980 then ₱2,100 — the owner said the price is not fixed.
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980),
    gas("2026-08-18", "22kg", 2100),
  ];
  const [t] = tankLife(rows, "2026-08-20");
  assert.equal(t.days, 24);
  // The LAST price is the useful one to quote back, not an average of three.
  assert.equal(t.lastPaid, 2100);
});

test("a tank past its usual life says so", () => {
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980),
  ];
  const [t] = tankLife(rows, "2026-08-20");
  assert.equal(t.days, 24);
  assert.equal(t.sinceLast, 26);
  assert.equal(t.dueNow, true);
});

test("two sizes are two different questions, kept apart", () => {
  // The owner runs a 22kg and an 11kg. Averaging them describes neither.
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980),
    gas("2026-07-10", "11kg", 1100),
    gas("2026-08-01", "11kg", 1150),
  ];
  const lives = tankLife(rows, "2026-08-05");
  assert.equal(lives.length, 2);
  assert.equal(lives.find((l) => l.size === "22kg")!.days, 24);
  assert.equal(lives.find((l) => l.size === "11kg")!.days, 22);
});

test("the one closest to running out is listed first", () => {
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980), // 24-day life, 26 days ago → overdue
    gas("2026-07-10", "11kg", 1100),
    gas("2026-08-18", "11kg", 1150), // 39-day life, 2 days ago → plenty left
  ];
  assert.equal(tankLife(rows, "2026-08-20")[0].size, "22kg");
});

test("one refill is a date, not an estimate", () => {
  // A single purchase says when the tank went in and nothing at all about how
  // long it lasts. "Not enough yet" beats a number invented from one point.
  const [t] = tankLife([gas("2026-08-18", "22kg", 2040)], "2026-08-20");
  assert.equal(t.days, null);
  assert.equal(t.dueNow, false);
  assert.equal(t.refills, 1);
});

test("a spare bought the same day doesn't halve the estimate", () => {
  // Two tanks on one day is stocking up, not a tank that lasted zero days.
  const rows = [
    gas("2026-07-01", "22kg", 2040),
    gas("2026-07-25", "22kg", 1980),
    gas("2026-07-25", "22kg", 1980),
  ];
  const [t] = tankLife(rows, "2026-07-26");
  assert.equal(t.days, 24);
});

test("one freak week doesn't drag the estimate down for months", () => {
  // Median, not mean. A fiesta week where a tank lasted 4 days would pull a
  // mean from 24 down to 19, and a warning that fires early gets ignored —
  // which is the same as not having one.
  const rows = [
    gas("2026-05-01", "22kg", 2040),
    gas("2026-05-25", "22kg", 2040), // 24
    gas("2026-06-18", "22kg", 2040), // 24
    gas("2026-06-22", "22kg", 2040), // 4  ← the fiesta
    gas("2026-07-16", "22kg", 2040), // 24
  ];
  const [t] = tankLife(rows, "2026-07-20");
  assert.equal(t.days, 24);
});

test("gas with no size recorded is left out rather than guessed at", () => {
  const rows: RunningCost[] = [
    { ...gas("2026-07-01", "22kg", 2040), sizeLabel: null },
    { ...gas("2026-07-25", "22kg", 1980), sizeLabel: "" },
  ];
  assert.equal(tankLife(rows, "2026-08-01").length, 0);
});

/* ── What it all adds up to per month ───────────────────────────────────── */

test("running costs become a monthly rate, the way spoilage does", () => {
  const rows = [
    gas("2026-08-01", "22kg", 2040),
    gas("2026-08-16", "11kg", 1100),
    { ...gas("2026-08-20", "22kg", 340), kind: "supplies" as const, sizeLabel: null },
  ];
  // ₱3,480 over 30 days is ₱3,480 a month.
  assert.equal(monthlyRunningRate(rows, 30), 3480);
  // The same spend measured over 15 days is twice the monthly rate.
  assert.equal(monthlyRunningRate(rows, 15), 6960);
});

test("no window and no spend produce no rate rather than a divide by zero", () => {
  assert.equal(monthlyRunningRate([], 30), 0);
  assert.equal(monthlyRunningRate([gas("2026-08-01", "22kg", 2040)], 0), 0);
});
