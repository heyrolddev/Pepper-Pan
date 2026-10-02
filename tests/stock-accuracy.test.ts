import test from "node:test";
import assert from "node:assert/strict";

import {
  accuracy,
  accuracyLine,
  accuracyState,
  byDay,
  parseCount,
  worstShelves,
  type CountRow,
} from "../src/lib/stock-accuracy.ts";

/**
 * The shrinkage record nobody could see.
 *
 * `cycle_counts` has been written on every recount since 0001 — what the
 * system thought was there, what was actually there, the difference, and the
 * difference in pesos. Searched across the whole repository it had one
 * insert, two deletes in Reset, and a line each in backup and restore.
 * Nothing read it.
 *
 * And the money reached nothing either: `netProfit` subtracts fixed costs,
 * waste and running costs, and `consumption_log` appears in no money module
 * at all. So a shelf that comes up two kilos short corrects itself quietly
 * and the pesos leave the story — profit reads higher than it is.
 *
 * These cover the reading-back. The two rules that matter most are that
 * short and over are never netted off, and that the direction is decided by
 * the QUANTITY rather than by the money.
 */

const row = (
  id: string,
  date: string,
  name: string,
  variance: number,
  valueImpact: number
): CountRow => ({
  id,
  date,
  name,
  systemQty: 10,
  countedQty: 10 + variance,
  variance,
  valueImpact,
  note: null,
});

test("short and over are never netted off against each other", () => {
  // A shop with ₱900 short and ₱900 over does not have a tidy shelf. It has
  // two faults cancelling on a screen, and they lead somewhere completely
  // different: one is loss, the other is a recipe taking off too much.
  const t = accuracy(
    [row("a", "2026-10-01", "Pork", -2, 900), row("b", "2026-10-01", "Noodles", 3, 900)],
    1
  );
  assert.equal(t.short, 900);
  assert.equal(t.over, 900);
  assert.equal(t.net, 0, "net exists and is reported — it just never replaces the two");
  assert.equal(t.shortCount, 1);
  assert.equal(t.overCount, 1);
});

test("the quantity decides the direction, not the sign of the money", () => {
  // valueImpact is written as variance × cost, so a short shelf arrives with
  // a negative figure. Reading the direction off the money would file every
  // short count as "over" the day somebody stores it as an absolute.
  const t = accuracy([row("a", "2026-10-01", "Pork", -2, -428.24)], 1);
  assert.equal(t.short, 428.24);
  assert.equal(t.over, 0);
  assert.equal(t.shortCount, 1);
});

test("a shelf short with no cost entered is still a shelf short", () => {
  // Counting it as "exact" because the money is zero would hide the very
  // shelves a new shop has not costed yet.
  const t = accuracy([row("a", "2026-10-01", "Pork", -2, 0)], 1);
  assert.equal(t.shortCount, 1);
  assert.equal(t.exactCount, 0);
  assert.equal(t.short, 0, "the shelf moved; the money is unknown, not invented");
});

test("an exact count is counted as exact", () => {
  const t = accuracy([row("a", "2026-10-01", "Pork", 0, 0)], 1);
  assert.equal(t.exactCount, 1);
  assert.equal(t.shortCount, 0);
  assert.equal(t.overCount, 0);
});

test("short per day lets a week be compared with a month", () => {
  const t = accuracy([row("a", "2026-10-01", "Pork", -1, 700)], 7);
  assert.equal(t.shortPerDay, 100);
  assert.equal(accuracy([], 0).shortPerDay, 0, "no counts must not divide by zero");
});

test("the worst shelves are the short ones, ranked by money", () => {
  const worst = worstShelves([
    row("a", "2026-10-01", "Pork", -1, 400),
    row("b", "2026-10-02", "Pork", -1, 800),
    row("c", "2026-10-02", "Noodles", -1, 600),
    row("d", "2026-10-03", "Cabbage", 5, 5000),
  ]);
  assert.deepEqual(
    worst.map((w) => [w.name, w.short, w.times]),
    [
      ["Pork", 1200, 2],
      ["Noodles", 600, 1],
    ]
  );
  assert.ok(
    !worst.some((w) => w.name === "Cabbage"),
    "a shelf that came up OVER is a different fault and must not head the loss list"
  );
});

test("days group newest first, each carrying both directions", () => {
  const groups = byDay([
    row("a", "2026-10-01", "Pork", -1, 400),
    row("b", "2026-10-03", "Noodles", -1, 100),
    row("c", "2026-10-01", "Cabbage", 2, 250),
  ]);
  assert.deepEqual(groups.map((g) => g.date), ["2026-10-03", "2026-10-01"]);
  assert.equal(groups[1].short, 400);
  assert.equal(groups[1].over, 250);
});

/* ---------------- the payload ---------------- */

test("a payload written since 0001 and never once read is parsed defensively", () => {
  const ok = parseCount({
    id: "x",
    date: "2026-10-01T00:00:00Z",
    payload: {
      ingredientId: "i1",
      name: "Pork",
      systemQty: 10,
      countedQty: 8,
      variance: -2,
      valueImpact: -428.24,
      note: " fridge left open ",
    },
  });
  assert.ok(ok);
  assert.equal(ok!.date, "2026-10-01", "the timestamp is trimmed to the day");
  assert.equal(ok!.variance, -2);
  assert.equal(ok!.note, "fridge left open");
});

test("a row that cannot be read is skipped, not thrown", () => {
  // A screen that dies on one bad row shows nothing — and showing nothing is
  // exactly what this feature replaces.
  assert.equal(parseCount({ id: "x", date: "2026-10-01", payload: null }), null);
  assert.equal(parseCount({ id: "x", date: "2026-10-01", payload: {} }), null);
  assert.equal(
    parseCount({ id: "x", date: "2026-10-01", payload: { name: "Pork" } }),
    null,
    "no variance means nothing can be said about the shelf"
  );
  assert.equal(
    parseCount({ id: "x", date: "2026-10-01", payload: { variance: -2 } }),
    null,
    "a variance with no shelf name is unreadable to a person"
  );
});

test("a missing valueImpact reads as zero rather than NaN", () => {
  const r = parseCount({
    id: "x",
    date: "2026-10-01",
    payload: { name: "Pork", variance: -2 },
  });
  assert.equal(r!.valueImpact, 0);
  assert.equal(accuracy([r!], 1).short, 0);
});

/* ---------------- the judgement ---------------- */

test("shrinkage is judged against what the shop sold, not in isolation", () => {
  // ₱900 is nothing on ₱90,000 of trade and serious on ₱9,000. A figure with
  // no denominator cannot say which.
  const t = accuracy([row("a", "2026-10-01", "Pork", -1, 900)], 30);
  assert.equal(accuracyState(t, 180_000), "fine");
  assert.equal(accuracyState(t, 60_000), "watch");
  assert.equal(accuracyState(t, 20_000), "serious");
});

test("the sentence names the state, so colour never carries it alone", () => {
  const t = accuracy([row("a", "2026-10-01", "Pork", -1, 900)], 30);
  assert.match(accuracyLine(t, 20_000), /somebody is taking it|recipe is badly wrong/i);
  assert.match(accuracyLine(t, 180_000), /ordinary handling/i);
});

test("counting over is explained, not congratulated", () => {
  const t = accuracy([row("a", "2026-10-01", "Cabbage", 5, 500)], 7);
  const line = accuracyLine(t, 50_000);
  assert.match(line, /not a windfall/i);
  assert.match(line, /recipe|logged twice/i);
});

test("no counts at all says so, and says why that is not good news", () => {
  const t = accuracy([], 7);
  assert.equal(accuracyState(t, 50_000), "none");
  assert.match(accuracyLine(t, 50_000), /never counted cannot be found short/i);
});

test("with no sales to compare against, the figure is given plainly", () => {
  const t = accuracy([row("a", "2026-10-01", "Pork", -1, 900)], 7);
  const line = accuracyLine(t, 0);
  assert.match(line, /900/);
  assert.ok(!/%/.test(line), "a percentage of zero sales is not a number worth printing");
});
