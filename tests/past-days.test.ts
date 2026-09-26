import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_COST_PCT,
  daysBetween,
  planPastDays,
  usualCostPct,
} from "../src/lib/past-days.ts";

/**
 * Days the shop traded before it had this till.
 *
 * The one that matters most is the cost. `orders.cogs` is `not null default
 * 0`, so a day saved as takings alone lands as ₱8,500 against ₱0 of cost — a
 * perfect 100% margin, quietly, on every profit figure the shop reads. That
 * is the system inventing money, and it is the reason a cost is required
 * rather than optional.
 */

const NOW = new Date("2026-09-26T12:00:00");
const round = (n: number) => Math.round(n * 100) / 100;
const day = (date: string, takings: number | null) => ({ date, takings });

test("a day's takings are costed, never left at a hundred percent margin", () => {
  const { rows } = planPastDays([day("2026-08-01", 8500)], 38, new Set(), NOW);
  assert.equal(rows[0].revenue, 8500);
  assert.equal(rows[0].cogs, 3230);
  assert.equal(rows[0].grossProfit, 5270);
  assert.notEqual(rows[0].cogs, 0, "this is the whole point of the file");
});

test("with no food cost set, nothing saves at all", () => {
  // Refused rather than defaulted. A default here is the system deciding what
  // the shop's margins are.
  const out = planPastDays([day("2026-08-01", 8500)], NaN, new Set(), NOW);
  assert.equal(out.rows.length, 0);
  assert.match(out.problems[0].why, /food cost/i);
});

test("a nonsense food cost is refused, not clamped", () => {
  for (const pct of [0, -5, 120, MAX_COST_PCT + 1]) {
    const out = planPastDays([day("2026-08-01", 8500)], pct, new Set(), NOW);
    assert.equal(out.rows.length, 0, `${pct}% was accepted`);
  }
});

test("a day that already has sales is refused, not added on top", () => {
  // Entering a day twice doubles it, and there is no way to see that
  // afterwards except by noticing the trend is wrong.
  const out = planPastDays(
    [day("2026-08-01", 8500)],
    38,
    new Set(["2026-08-01"]),
    NOW
  );
  assert.equal(out.rows.length, 0);
  assert.match(out.problems[0].why, /already has sales/i);
});

test("the same day typed twice on one screen is caught too", () => {
  const out = planPastDays(
    [day("2026-08-01", 8500), day("2026-08-01", 200)],
    38,
    new Set(),
    NOW
  );
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].revenue, 8500, "the first one wins");
  assert.match(out.problems[0].why, /twice/i);
});

test("a day in the future is refused", () => {
  const out = planPastDays([day("2027-01-01", 500)], 38, new Set(), NOW);
  assert.equal(out.rows.length, 0);
  assert.match(out.problems[0].why, /not happened/i);
});

test("today itself is allowed — the shop may be catching up at closing", () => {
  const out = planPastDays([day("2026-09-26", 500)], 38, new Set(), NOW);
  assert.equal(out.rows.length, 1);
});

test("a blank row is somebody tabbing past, not an error", () => {
  const out = planPastDays(
    [day("", null), day("2026-08-01", 8500)],
    38,
    new Set(),
    NOW
  );
  assert.equal(out.rows.length, 1);
  assert.deepEqual(out.problems, []);
});

test("a day with no takings is named, not skipped in silence", () => {
  // A screen that quietly imports nine rows out of ten teaches the owner to
  // distrust the total afterwards.
  const out = planPastDays(
    [day("2026-08-01", null), day("2026-08-02", 0)],
    38,
    new Set(),
    NOW
  );
  assert.equal(out.rows.length, 0);
  assert.equal(out.problems.length, 2);
  for (const p of out.problems) assert.match(p.why, /takings/i);
});

test("takings that are not a number never reach the total", () => {
  const out = planPastDays(
    [{ date: "2026-08-01", takings: NaN }, day("2026-08-02", 100)],
    38,
    new Set(),
    NOW
  );
  assert.equal(out.total, 100);
  assert.ok(Number.isFinite(out.total));
});

test("the days come back in date order whatever order they were typed", () => {
  const out = planPastDays(
    [day("2026-08-03", 100), day("2026-08-01", 200), day("2026-08-02", 300)],
    38,
    new Set(),
    NOW
  );
  assert.deepEqual(out.rows.map((r) => r.date), [
    "2026-08-01", "2026-08-02", "2026-08-03",
  ]);
});

test("the total is the sum of what will actually be saved", () => {
  // Not of what was typed. A total that counts refused rows is a promise the
  // save cannot keep.
  const out = planPastDays(
    [day("2026-08-01", 100), day("2027-01-01", 999999)],
    38,
    new Set(),
    NOW
  );
  assert.equal(out.total, 100);
});

test("money is rounded to the centavo, not left long", () => {
  const { rows } = planPastDays([day("2026-08-01", 333.33)], 33, new Set(), NOW);
  assert.equal(rows[0].cogs, 110);
  assert.equal(rows[0].revenue + 0, 333.33);
  assert.equal(round(rows[0].revenue - rows[0].cogs), rows[0].grossProfit);
});

/* ---------------- the starting figure ---------------- */

test("the shop's own food cost is offered, not a made-up one", () => {
  assert.equal(usualCostPct(10000, 3800), 38);
});

test("with nothing to work it out from, the field starts empty", () => {
  // A made-up default is the system putting words in the owner's mouth about
  // their own margins.
  assert.equal(usualCostPct(0, 0), null);
  assert.equal(usualCostPct(10000, 0), null);
  assert.equal(usualCostPct(NaN, 100), null);
});

test("an absurd running figure is not offered either", () => {
  // A month with one sale and a big delivery can read 400%.
  assert.equal(usualCostPct(100, 400), null);
});

/* ---------------- filling a stretch ---------------- */

test("a week can be laid out in one tap", () => {
  assert.deepEqual(daysBetween("2026-08-01", "2026-08-04"), [
    "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04",
  ]);
});

test("a range that spans a month boundary still walks day by day", () => {
  const out = daysBetween("2026-08-30", "2026-09-02");
  assert.deepEqual(out, ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
});

test("a backwards or nonsense range gives nothing rather than looping", () => {
  assert.deepEqual(daysBetween("2026-08-04", "2026-08-01"), []);
  assert.deepEqual(daysBetween("rubbish", "2026-08-01"), []);
});

test("an enormous range stops rather than filling the screen", () => {
  assert.equal(daysBetween("2020-01-01", "2026-01-01").length, 120);
});
