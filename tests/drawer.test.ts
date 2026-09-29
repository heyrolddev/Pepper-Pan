import test from "node:test";
import assert from "node:assert/strict";
import {
  drawerFor,
  drawerStory,
  drawerVerdict,
  type DrawerMove,
} from "../src/lib/drawer.ts";

/**
 * This is the report that accuses somebody.
 *
 * It used to compare the counted drawer against the shift's CASH SALES and
 * call the difference over or short — so a float made every shift read over,
 * and a gas refill bought out of the drawer made an honest person read short
 * by exactly the price of the gas. In red. On a screen their employer reads.
 *
 * Every number here is pinned because of who it points at.
 */

const out = (amount: number, label: string, at = "2026-09-28T10:00:00Z"): DrawerMove => ({
  at,
  type: "out",
  amount,
  label,
});
const into = (amount: number, label: string, at = "2026-09-28T10:00:00Z"): DrawerMove => ({
  at,
  type: "in",
  amount,
  label,
});

const lastCount = { at: "2026-09-27T21:00:00Z", amount: 1000 };

// ---------------------------------------------------------------------------
// The bug itself
// ---------------------------------------------------------------------------

test("the float does not make an honest shift read over", () => {
  // ₱1,000 left in the drawer last night, ₱3,000 of cash sales, ₱4,000
  // counted. Square. The old sum compared 4,000 against 3,000 and called it
  // ₱1,000 OVER, every single day the shop opened.
  const d = drawerFor({ lastCount, cashSales: 3000, moves: [], counted: 4000 });
  assert.equal(d.expected, 4000);
  assert.equal(d.diff, 0);
  assert.equal(drawerVerdict(d), "square");
});

test("a gas refill bought from the drawer does not make somebody a thief", () => {
  // THE case. Ana sells ₱3,000 cash and buys an ₱1,300 LPG refill out of the
  // drawer — which the shop already recorded. She counts ₱2,700 and she is
  // exactly right. The old sum called her ₱300 short.
  const d = drawerFor({
    lastCount,
    cashSales: 3000,
    moves: [out(1300, "Gas refill")],
    counted: 2700,
  });
  assert.equal(d.paidOut, 1300);
  assert.equal(d.expected, 2700);
  assert.equal(d.diff, 0);
  assert.equal(drawerVerdict(d), "square");
});

test("money put in that was not a sale counts too", () => {
  // The owner topping up the barya, or an utang collected.
  const d = drawerFor({
    lastCount,
    cashSales: 500,
    moves: [into(2000, "Float top-up")],
    counted: 3500,
  });
  assert.equal(d.paidIn, 2000);
  assert.equal(d.expected, 3500);
  assert.equal(drawerVerdict(d), "square");
});

test("and a real shortage still shows as one", () => {
  // The whole point of keeping the report: when the sum is right, a genuine
  // gap is visible instead of buried under a float nobody accounted for.
  const d = drawerFor({
    lastCount,
    cashSales: 3000,
    moves: [out(1300, "Gas refill")],
    counted: 2200,
  });
  assert.equal(d.diff, -500);
  assert.equal(drawerVerdict(d), "short");
});

test("over is over", () => {
  const d = drawerFor({ lastCount, cashSales: 1000, moves: [], counted: 2150 });
  assert.equal(d.diff, 150);
  assert.equal(drawerVerdict(d), "over");
});

// ---------------------------------------------------------------------------
// Not knowing, and saying so
// ---------------------------------------------------------------------------

test("with nothing ever counted there is no verdict, not a verdict of zero", () => {
  // A variance computed from a guessed opening looks exactly like a measured
  // one — and it would be pointing at a person.
  const d = drawerFor({ lastCount: null, cashSales: 3000, moves: [], counted: 2700 });
  assert.equal(d.opening, null);
  assert.equal(d.expected, null);
  assert.equal(d.diff, null);
  assert.equal(d.openingFrom, "never-counted");
  assert.equal(drawerVerdict(d), "unknown");
});

test("a shift nobody has counted yet has no verdict either", () => {
  const d = drawerFor({ lastCount, cashSales: 3000, moves: [], counted: null });
  assert.equal(d.expected, 4000, "what SHOULD be there is still knowable");
  assert.equal(d.counted, null);
  assert.equal(d.diff, null);
  assert.equal(drawerVerdict(d), "unknown");
});

// ---------------------------------------------------------------------------
// Rounding, and being argued with
// ---------------------------------------------------------------------------

test("centavos are rounding, not a discrepancy", () => {
  // A drawer counted in coins never lands on the centavo. Flagging that
  // trains people to ignore the flag.
  const d = drawerFor({ lastCount, cashSales: 1000.33, moves: [], counted: 2000.7 });
  assert.equal(drawerVerdict(d), "square");
  assert.ok(Math.abs(d.diff!) < 1);
});

test("a peso out is worth mentioning", () => {
  const d = drawerFor({ lastCount, cashSales: 1000, moves: [], counted: 1998.5 });
  assert.equal(drawerVerdict(d), "short");
});

test("the movements come back newest first, so a variance can be argued with", () => {
  const d = drawerFor({
    lastCount,
    cashSales: 0,
    moves: [
      out(100, "Ice", "2026-09-28T09:00:00Z"),
      out(1300, "Gas refill", "2026-09-28T15:00:00Z"),
      out(50, "Tissue", "2026-09-28T12:00:00Z"),
    ],
    counted: null,
  });
  assert.deepEqual(d.movements.map((m) => m.label), ["Gas refill", "Tissue", "Ice"]);
  assert.equal(d.paidOut, 1450);
});

test("the sum is written out, because it is about to accuse somebody", () => {
  const d = drawerFor({
    lastCount,
    cashSales: 3000,
    moves: [out(1300, "Gas refill")],
    counted: 2700,
  });
  const story = drawerStory(d);
  // Every term of the sum has to be readable, so a staff member told they
  // are short can point at the gas.
  assert.ok(story.includes("1000.00"), story);
  assert.ok(story.includes("3000.00"), story);
  assert.ok(story.includes("1300.00"), story);
  assert.ok(story.includes("2700.00"), story);
});

test("with no count yet the story says so instead of showing a sum", () => {
  const d = drawerFor({ lastCount: null, cashSales: 3000, moves: [], counted: null });
  assert.ok(/counted the drawer yet/i.test(drawerStory(d)));
  assert.ok(!drawerStory(d).includes("="));
});

test("zero-value terms are left out of the sum rather than padding it", () => {
  const d = drawerFor({ lastCount, cashSales: 500, moves: [], counted: 1500 });
  assert.ok(!drawerStory(d).includes("put in"));
  assert.ok(!drawerStory(d).includes("paid out"));
});
