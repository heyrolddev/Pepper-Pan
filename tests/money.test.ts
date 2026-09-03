import test from "node:test";
import assert from "node:assert/strict";
import { FOOD_COST_TARGET, marginFor, peso, pesoRound } from "../src/lib/costing.ts";

/**
 * How money is shown, and what the shop is told about a dish.
 *
 * The verdicts here decide which dishes the owner is nudged to reprice, so a
 * wrong threshold quietly points the business at the wrong menu item.
 */

test("a peso amount keeps its centavos and groups thousands", () => {
  assert.equal(peso(1234.5), "₱1,234.50");
  assert.equal(peso(0), "₱0.00");
});

test("a negative sits outside the peso sign, where it can't be skimmed past", () => {
  // "₱-1.25" reads as a currency code followed by a number. The minus is the
  // whole point on a costing screen, so it goes first.
  assert.equal(peso(-1.25), "−₱1.25");
  assert.equal(pesoRound(-1234.6), "−₱1,235");
});

test("a headline figure drops the centavos", () => {
  assert.equal(pesoRound(1234.4), "₱1,234");
  assert.equal(pesoRound(1234.6), "₱1,235");
});

test("an uncosted dish says so rather than claiming a margin", () => {
  const m = marginFor(100, 0, false);
  assert.equal(m.verdict, "unknown");
  assert.equal(m.foodCostPct, null);
  assert.equal(m.marginPct, null);
});

test("a free dish cannot be scored", () => {
  assert.equal(marginFor(0, 10, true).verdict, "unknown");
});

test("a dish that costs more than it sells for is losing", () => {
  const m = marginFor(50, 60, true);
  assert.equal(m.verdict, "losing");
  assert.equal(m.gross, -10);
});

test("the verdicts sit where the thresholds say", () => {
  // great <= 25% < ok <= 40% < tight, with the target between them.
  assert.equal(marginFor(100, 20, true).verdict, "great");
  assert.equal(marginFor(100, 25, true).verdict, "great");
  assert.equal(marginFor(100, 26, true).verdict, "ok");
  assert.equal(marginFor(100, 40, true).verdict, "ok");
  assert.equal(marginFor(100, 41, true).verdict, "tight");
  assert.ok(FOOD_COST_TARGET > 25 && FOOD_COST_TARGET < 40);
});

test("gross and the two percentages agree with each other", () => {
  const m = marginFor(200, 60, true);
  assert.equal(m.gross, 140);
  assert.equal(m.foodCostPct, 30);
  assert.equal(m.marginPct, 70);
  assert.equal(Math.round((m.foodCostPct ?? 0) + (m.marginPct ?? 0)), 100);
});
