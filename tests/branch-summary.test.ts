import test from "node:test";
import assert from "node:assert/strict";

import {
  perTradingDay,
  summariseBranch,
  type BranchSale,
} from "../src/lib/branch-summary.ts";

/**
 * Comparing two branches that do not trade the same days.
 *
 * Apalit is open daily; El Mercado is Friday to Sunday nights. Almost every
 * naive comparison between them is unfair in the booth's direction, and an
 * unfair number is how a working branch gets closed.
 */

const sale = (branchId: string, date: string, revenue: number, cancelled = false): BranchSale => ({
  branchId,
  date,
  revenue,
  cancelled,
});

const week = { from: "2026-10-05", to: "2026-10-11", prevFrom: "2026-09-28" };

test("takings, orders and the average ticket over a window", () => {
  const sales = [
    sale("main", "2026-10-05", 300),
    sale("main", "2026-10-06", 500),
    sale("main", "2026-10-30", 9999), // outside the window
  ];
  const s = summariseBranch(sales, "main", week.from, week.to, week.prevFrom);
  assert.equal(s.takings, 800);
  assert.equal(s.orders, 2);
  assert.equal(s.averageTicket, 400);
});

test("a cancelled or voided sale is not takings", () => {
  const sales = [
    sale("main", "2026-10-05", 300),
    sale("main", "2026-10-06", 500, true),
  ];
  const s = summariseBranch(sales, "main", week.from, week.to, week.prevFrom);
  assert.equal(s.takings, 300);
  assert.equal(s.orders, 1, "and it is not an order either");
});

test("one branch's rows never reach another's figures", () => {
  const sales = [sale("main", "2026-10-05", 300), sale("express", "2026-10-05", 999)];
  assert.equal(summariseBranch(sales, "main", week.from, week.to, week.prevFrom).takings, 300);
  assert.equal(summariseBranch(sales, "express", week.from, week.to, week.prevFrom).takings, 999);
});

test("the comparison window is the same length, ending the day before", () => {
  const sales = [
    sale("main", "2026-10-06", 500),
    sale("main", "2026-09-29", 250), // in the previous week
    sale("main", "2026-09-20", 700), // older than that
  ];
  const s = summariseBranch(sales, "main", week.from, week.to, week.prevFrom);
  assert.equal(s.prevTakings, 250);
  assert.equal(s.change, 1, "500 against 250 is a doubling");
});

test("a branch's first week has no trend, and does not invent one", () => {
  // +100% against nothing is a number produced by the arithmetic, not by
  // the shop — and it is the booth's opening week every time.
  const s = summariseBranch([sale("express", "2026-10-09", 400)], "express", week.from, week.to, week.prevFrom);
  assert.equal(s.prevTakings, 0);
  assert.equal(s.change, null);
});

test("a branch that trades three nights is measured on three nights", () => {
  // The whole point. El Mercado takes ₱1,800 over Friday, Saturday and
  // Sunday. Divided by seven it looks like ₱257 a day and limping; divided
  // by the nights it actually opened it is ₱600 a night.
  const sales = [
    sale("express", "2026-10-09", 600),
    sale("express", "2026-10-10", 700),
    sale("express", "2026-10-11", 500),
  ];
  const s = summariseBranch(sales, "express", week.from, week.to, week.prevFrom);
  assert.equal(s.takings, 1800);
  assert.equal(s.tradingDays, 3);
  assert.equal(perTradingDay(s), 600);
});

test("two sales on one night are one trading day", () => {
  const sales = [sale("express", "2026-10-09", 300), sale("express", "2026-10-09", 300)];
  const s = summariseBranch(sales, "express", week.from, week.to, week.prevFrom);
  assert.equal(s.tradingDays, 1);
  assert.equal(perTradingDay(s), 600);
});

test("a branch with no sales reports zero rather than NaN", () => {
  const s = summariseBranch([], "express", week.from, week.to, week.prevFrom);
  assert.equal(s.takings, 0);
  assert.equal(s.averageTicket, 0);
  assert.equal(perTradingDay(s), 0);
  assert.equal(s.change, null);
  assert.ok(Number.isFinite(perTradingDay(s)));
});
