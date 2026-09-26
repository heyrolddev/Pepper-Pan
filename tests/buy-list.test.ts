import test from "node:test";
import assert from "node:assert/strict";

import { COVER_DAYS, buyLineFor, orderBuyList } from "../src/lib/buy-list.ts";

/**
 * What goes on the buying list.
 *
 * The owner's report was "hindi lahat ng low stock ay nandito" — not
 * everything that is low is on here — and both halves of the old rule were
 * losing things:
 *
 *   `if (dailyAvg <= 0) continue` threw away every ingredient the shop had
 *   never recorded USING, before either test ran. That is most of a new store
 *   room, and everything going into a dish nobody has ordered yet.
 *
 *   The par level was worked out purely from usage, so the owner's own
 *   reorder level was never consulted. Set "tell me at 500 g" on the oil,
 *   watch it drop to 400 g, and the list stays quiet because seven days'
 *   usage happens to be less than 500 g.
 */

const item = (over: Partial<Parameters<typeof buyLineFor>[0]> = {}) => ({
  id: "oil",
  name: "CC. OIL",
  unit: "g",
  stock: 400,
  reorder: 0,
  cost: 0.2,
  ...over,
});

test("something running out at the rate it is used is on the list", () => {
  // 250 g a day, 7 days of cover wanted, only 400 g on the shelf.
  const line = buyLineFor(item({ stock: 400 }), 250);
  assert.ok(line);
  assert.equal(line!.reason, "running-out");
  assert.equal(Math.round(line!.buy), 250 * COVER_DAYS - 400);
});

test("something under the owner's own level is on the list too", () => {
  /**
   * The bug. Usage says a week's cover is 350 g and there are 400 g, so the
   * usage test is happy — but the owner asked to be told at 500 g and it is
   * under that. It used to be left off entirely.
   */
  const line = buyLineFor(item({ stock: 400, reorder: 500 }), 50);
  assert.ok(line, "an ingredient under its own reorder level was left off");
  assert.equal(line!.reason, "below-level");
});

test("something never recorded used is still on the list if it is low", () => {
  // The other half. `dailyAvg` of 0 used to skip the row before anything
  // else was asked.
  const line = buyLineFor(item({ stock: 100, reorder: 500 }), 0);
  assert.ok(line, "an unused ingredient under its level was skipped");
  assert.equal(line!.reason, "below-level");
  assert.equal(line!.daysLeft, null, "a rate nobody has measured is not zero");
});

test("something never used and with no level set stays off", () => {
  // Nothing to say about it. Not a bug — there is genuinely no signal.
  assert.equal(buyLineFor(item({ stock: 100, reorder: 0 }), 0), null);
});

test("a full shelf with plenty of cover stays off", () => {
  assert.equal(buyLineFor(item({ stock: 10000, reorder: 500 }), 50), null);
});

test("exactly AT the owner's level counts as low", () => {
  // "Tell me at 500" means tell me when it reaches 500, not after.
  assert.ok(buyLineFor(item({ stock: 500, reorder: 500 }), 0));
  assert.equal(buyLineFor(item({ stock: 501, reorder: 500 }), 0), null);
});

test("the amount to buy clears BOTH lines, not just the one that fired", () => {
  /**
   * Buying up to only the level that triggered leaves the row on the list
   * tomorrow, which teaches the owner the list is wrong.
   *
   * 250 g/day wants 1,750 g of cover; the owner's level is 3,000. Buy to
   * 3,000.
   */
  const line = buyLineFor(item({ stock: 400, reorder: 3000 }), 250);
  assert.equal(line!.parLevel, 3000);
  assert.equal(line!.buy, 2600);
});

test("and when usage wants more than the level, usage wins", () => {
  const line = buyLineFor(item({ stock: 400, reorder: 500 }), 250);
  assert.equal(line!.parLevel, 250 * COVER_DAYS);
});

test("the cost is what that amount actually costs", () => {
  const line = buyLineFor(item({ stock: 0, reorder: 1000, cost: 0.25 }), 0);
  assert.equal(line!.buy, 1000);
  assert.equal(line!.cost, 250);
});

test("junk in the numbers never produces a line that cannot be read", () => {
  for (const rate of [NaN, -5, Infinity]) {
    const line = buyLineFor(item({ stock: 100, reorder: 500 }), rate as number);
    assert.ok(line);
    assert.ok(Number.isFinite(line!.buy), `buy was ${line!.buy} at rate ${rate}`);
    assert.ok(line!.daysLeft === null || Number.isFinite(line!.daysLeft));
  }
});

/* ---------------- the shopping order ---------------- */

const line = (name: string, daysLeft: number | null) => ({ name, daysLeft });

test("soonest to run out comes first", () => {
  const out = orderBuyList([line("A", 5), line("B", 1.2), line("C", 3)]);
  assert.deepEqual(out.map((l) => l.name), ["B", "C", "A"]);
});

test("the ones with no history go last, not first", () => {
  /**
   * Sorting them as zero puts them at the top looking like emergencies;
   * sorting as Infinity is indistinguishable from a large number of days in
   * a list where every other row is a number of days.
   */
  const out = orderBuyList([line("Unused", null), line("Urgent", 0.5)]);
  assert.deepEqual(out.map((l) => l.name), ["Urgent", "Unused"]);
});

test("several with no history are at least in a stable order", () => {
  const out = orderBuyList([line("Zucchini", null), line("Anise", null)]);
  assert.deepEqual(out.map((l) => l.name), ["Anise", "Zucchini"]);
});

test("ordering never loses a line", () => {
  const rows = [line("A", 5), line("B", null), line("C", 1)];
  assert.equal(orderBuyList(rows).length, 3);
});
