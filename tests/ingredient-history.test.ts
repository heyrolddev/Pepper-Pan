import test from "node:test";
import assert from "node:assert/strict";
import {
  describeType,
  ingredientMoves,
  movesSummary,
} from "../src/lib/ingredient-history.ts";

/**
 * The shop said this screen did not work, and it did not.
 *
 * It searched the activity log for the ingredient's NAME — so a sale, which
 * writes to `consumption_log` and names no ingredient anywhere, never
 * appeared; renaming an ingredient erased its whole past; and "Pork" showed
 * "Pork Belly"'s movements as if they were its own.
 */

const purchase = (over = {}) => ({
  id: "p1",
  date: "2026-09-20",
  qty: 5000,
  cost: 1150,
  supplier: "Aling Nena",
  ...over,
});
const used = (over = {}) => ({
  id: "c1",
  date: "2026-09-21",
  created_at: "2026-09-21T03:10:00.000Z",
  qty: 200,
  type: "sale",
  note: "Sold — ticket #142",
  ...over,
});
const binned = (over = {}) => ({
  id: "w1",
  date: "2026-09-22",
  created_at: "2026-09-22T09:00:00.000Z",
  qty: 150,
  reason: "Spoiled",
  total_cost: 34.5,
  ...over,
});

// ---------------------------------------------------------------------------
// The thing that was missing
// ---------------------------------------------------------------------------

test("a sale shows up, which is the whole complaint", () => {
  const [m] = ingredientMoves({ purchases: [], consumption: [used()], waste: [] });
  assert.equal(m.kind, "out");
  assert.equal(m.qty, 200);
  assert.equal(m.note, "Sold — ticket #142");
  assert.equal(m.source, "sale");
});

test("a delivery, a sale and a bin all land in one timeline", () => {
  // Three different tables. The old screen read none of them.
  const moves = ingredientMoves({
    purchases: [purchase()],
    consumption: [used()],
    waste: [binned()],
  });
  assert.equal(moves.length, 3);
  assert.deepEqual(moves.map((m) => m.source), ["waste", "sale", "purchase"]);
});

test("newest first, and same-day lines keep the order they happened in", () => {
  const moves = ingredientMoves({
    purchases: [],
    consumption: [
      used({ id: "a", created_at: "2026-09-21T03:00:00.000Z", note: "first" }),
      used({ id: "b", created_at: "2026-09-21T07:00:00.000Z", note: "second" }),
    ],
    waste: [],
  });
  assert.deepEqual(moves.map((m) => m.note), ["second", "first"]);
});

test("a row from before the note column still says something useful", () => {
  // Rows written before 0069 have no note. "sale" on a line of its own is
  // not a description of anything.
  const [m] = ingredientMoves({
    purchases: [],
    consumption: [used({ note: null, created_at: null })],
    waste: [],
  });
  assert.equal(m.note, "Sold");
  assert.equal(m.at, "2026-09-21T00:00:00.000Z", "it sorts within its own day, not to the start of time");
});

test("every consumption type reads as a sentence, never a bare word", () => {
  for (const t of ["sale", "batch", "internal", "waste", "count", null, "something-new"]) {
    const d = describeType(t as string | null);
    assert.ok(d.text.length > 3, `${t} -> ${d.text}`);
    assert.ok(d.text[0] === d.text[0].toUpperCase(), `${t} should read as a sentence`);
  }
});

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

test("a count that FOUND stock is an addition, not a use", () => {
  // Consuming minus ten is adding ten. Reading the direction off the table
  // rather than off the number would show a shelf going down when it went up.
  const [m] = ingredientMoves({
    purchases: [],
    consumption: [used({ qty: -300, type: "count", note: null })],
    waste: [],
  });
  assert.equal(m.kind, "in");
  assert.equal(m.qty, 300, "shown as a positive amount with the direction beside it");
  assert.equal(m.source, "count");
});

test("a delivery is always an addition and carries its price", () => {
  const [m] = ingredientMoves({ purchases: [purchase()], consumption: [], waste: [] });
  assert.equal(m.kind, "in");
  assert.equal(m.cost, 1150);
  assert.ok(/Aling Nena/.test(m.note));
});

test("a delivery with no supplier named still reads", () => {
  const [m] = ingredientMoves({
    purchases: [purchase({ supplier: null })],
    consumption: [],
    waste: [],
  });
  assert.equal(m.note, "Delivered");
});

test("waste says why it was thrown away", () => {
  const [m] = ingredientMoves({ purchases: [], consumption: [], waste: [binned()] });
  assert.equal(m.note, "Thrown away — Spoiled");
  assert.equal(m.cost, 34.5);
});

// ---------------------------------------------------------------------------
// The headline
// ---------------------------------------------------------------------------

test("the totals are counted from the lines shown, not queried apart", () => {
  // Two queries for one figure is how a total comes to disagree with the
  // lines under it — and the lines are the ones somebody will check.
  const moves = ingredientMoves({
    purchases: [purchase(), purchase({ id: "p2", qty: 1000, cost: 250 })],
    consumption: [used(), used({ id: "c2", qty: 300 })],
    waste: [binned()],
  });
  const s = movesSummary(moves);
  assert.equal(s.inQty, 6000);
  assert.equal(s.outQty, 200 + 300 + 150);
  assert.equal(s.net, 6000 - 650);
  assert.equal(s.spent, 1400, "only deliveries cost money to buy");
});

test("a found-stock correction counts as coming in", () => {
  const s = movesSummary(
    ingredientMoves({
      purchases: [],
      consumption: [used({ qty: -100, type: "count", note: null })],
      waste: [],
    })
  );
  assert.equal(s.inQty, 100);
  assert.equal(s.outQty, 0);
  assert.equal(s.spent, 0, "finding stock is not buying it");
});

test("nothing recorded is a clean zero, not a NaN", () => {
  const s = movesSummary([]);
  assert.deepEqual(s, { inQty: 0, outQty: 0, net: 0, spent: 0 });
});

test("a missing cost is null rather than zero", () => {
  // Zero is a price. "We did not record one" is not.
  const [m] = ingredientMoves({
    purchases: [purchase({ cost: null })],
    consumption: [],
    waste: [],
  });
  assert.equal(m.cost, null);
});
