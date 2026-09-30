import test from "node:test";
import assert from "node:assert/strict";

import {
  daysLeftInMonth,
  drawsInMonth,
  payLine,
  payMonth,
  type DrawRow,
} from "../src/lib/owner-pay.ts";

/**
 * The owner's own pay, and the two ways a screen can lie about it.
 *
 * A draw is money leaving the shop that is NOT a cost of running it — it is
 * the owner taking wages they already budgeted for. Get that wrong in either
 * direction and the shop's own figures mislead the person who depends on
 * them most:
 *
 *   count it as a cost   profit reads lower than it is, break-even rises,
 *                        and "the shop is losing money" becomes impossible
 *                        to tell apart from "I took money out"
 *   count it as nothing  the drawer is right and no screen can say how much
 *                        of this month's wages are already gone
 *
 * These cover the second half — the reading back — because the first half is
 * enforced in the database and checked in migration 0073.
 */

const row = (id: string, date: string, amount: number): DrawRow => ({
  id,
  date,
  amount,
  account: "cash",
  note: null,
});

test("no budget set is not a budget of zero", () => {
  // The difference matters: zero would make the first peso "over budget" and
  // paint the panel red at somebody who has simply not filled in a form.
  const m = payMonth([row("a", "2026-10-03", 2000)], null);
  assert.equal(m.state, "unset");
  assert.equal(m.over, 0, "nothing can be over a budget that does not exist");
  assert.equal(m.taken, 2000, "but what was taken is still known");
});

test("what is left is the headline, and it never goes negative", () => {
  const m = payMonth(
    [row("a", "2026-10-03", 2000), row("b", "2026-10-09", 1000)],
    15000
  );
  assert.equal(m.taken, 3000);
  assert.equal(m.left, 12000);
  assert.equal(m.over, 0);
  assert.equal(m.state, "within");
});

test("over budget is reported as over, not as a smaller remainder", () => {
  const m = payMonth([row("a", "2026-10-03", 18400)], 15000);
  assert.equal(m.left, 0, "left must bottom out at zero, never go negative");
  assert.equal(m.over, 3400);
  assert.equal(m.state, "over");
});

test("the meter never draws wider than its track", () => {
  // An over-budget month is described in words. A bar at 123% is a bug that
  // looks like a design decision.
  const m = payMonth([row("a", "2026-10-03", 30000)], 15000);
  assert.equal(m.pct, 100);
  assert.ok(m.ratio > 1, "but the uncapped ratio is still available to describe it");
});

test("exactly spent is its own state, not over", () => {
  const m = payMonth([row("a", "2026-10-03", 15000)], 15000);
  assert.equal(m.state, "spent");
  assert.equal(m.over, 0);
  assert.equal(m.left, 0);
});

test("nearly spent warns before the money is gone, not after", () => {
  // 85% is the line. Below it the panel is quiet; a warning that arrives only
  // once the budget is gone is an obituary, not a warning.
  assert.equal(payMonth([row("a", "2026-10-03", 12750)], 15000).state, "close");
  assert.equal(payMonth([row("a", "2026-10-03", 12000)], 15000).state, "within");
});

test("centavos do not accumulate into a wrong peso", () => {
  const m = payMonth(
    [row("a", "2026-10-01", 33.33), row("b", "2026-10-02", 33.33), row("c", "2026-10-03", 33.34)],
    100
  );
  assert.equal(m.taken, 100);
  assert.equal(m.left, 0);
  assert.equal(m.state, "spent", "a hundredth adrift would read as 'close' forever");
});

test("a draw entered as a negative is still money taken", () => {
  // Nothing should write one. Which is exactly why a sign slipping through
  // would go unnoticed: it would ADD to what is left.
  const m = payMonth([row("a", "2026-10-03", -2000)], 15000);
  assert.equal(m.taken, 2000);
  assert.equal(m.left, 13000);
});

test("only this month's draws count, by string and never by Date", () => {
  const rows = [
    row("a", "2026-09-30", 5000),
    row("b", "2026-10-01", 2000),
    row("c", "2026-10-31", 1000),
    row("d", "2026-11-01", 9000),
  ];
  const october = drawsInMonth(rows, "2026-10-15");
  assert.deepEqual(october.map((r) => r.id), ["b", "c"]);
  // Manila is UTC+8. A month boundary read through a Date would put the 1st
  // in the previous month for anyone west of Greenwich, and never here.
  assert.equal(payMonth(october, 15000).taken, 3000);
});

test("the sentence says the state, so colour is never carrying it alone", () => {
  const over = payLine(payMonth([row("a", "2026-10-03", 18400)], 15000), 12);
  assert.match(over, /3,400/);
  assert.match(over, /profit/i, "it must say what the extra IS, not just that it is extra");

  const unset = payLine(payMonth([], null), 12);
  assert.match(unset, /Set your monthly pay/i);

  const close = payLine(payMonth([row("a", "2026-10-03", 13000)], 15000), 5);
  assert.match(close, /2,000/);
  assert.match(close, /5 days/, "how long the remainder has to last is the point");
});

test("the last day of the month says so instead of '0 days to go'", () => {
  const m = payMonth([row("a", "2026-10-31", 13000)], 15000);
  assert.match(payLine(m, 0), /ends today/i);
});

test("days left is right across month lengths and a leap February", () => {
  assert.equal(daysLeftInMonth("2026-10-01"), 30);
  assert.equal(daysLeftInMonth("2026-10-31"), 0);
  assert.equal(daysLeftInMonth("2026-09-15"), 15);
  assert.equal(daysLeftInMonth("2026-02-01"), 27);
  assert.equal(daysLeftInMonth("2028-02-01"), 28, "leap year");
  assert.equal(daysLeftInMonth("2026-12-31"), 0);
});
