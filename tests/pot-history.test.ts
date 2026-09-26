import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY_PREVIEW,
  dayOf,
  daysWithMovement,
  lastDayWith,
  movementsOn,
  nextDayWith,
  shiftDay,
  tally,
  type Movement,
} from "../src/lib/pot-history.ts";

function m(id: string, date: string, type: "in" | "out", amount: number): Movement {
  return { id, date, type, amount };
}

const LEDGER: Movement[] = [
  m("a", "2026-09-26", "in", 145),
  m("b", "2026-09-26", "in", 200),
  m("c", "2026-09-26", "out", 50),
  m("d", "2026-09-26", "in", 80),
  m("e", "2026-09-24", "in", 300),
  m("f", "2026-09-20", "out", 1200),
];

test("a day is the first ten characters, whatever precision arrived", () => {
  assert.equal(dayOf("2026-09-26"), "2026-09-26");
  assert.equal(dayOf("2026-09-26T21:14:03.221Z"), "2026-09-26");
});

test("one day's movements, and nothing from its neighbours", () => {
  assert.deepEqual(
    movementsOn(LEDGER, "2026-09-26").map((x) => x.id),
    ["a", "b", "c", "d"]
  );
  assert.deepEqual(movementsOn(LEDGER, "2026-09-25"), []);
});

test("a day that timestamps rather than dates its rows still groups", () => {
  // `cash_ledger.date` is a date, but a derived sale line can carry a full
  // timestamp — and comparing those with === puts every sale on its own day.
  const mixed = [m("x", "2026-09-26T01:00:00Z", "in", 10), m("y", "2026-09-26", "in", 20)];
  assert.equal(movementsOn(mixed, "2026-09-26").length, 2);
});

test("a day adds up in both directions and nets out", () => {
  const t = tally(movementsOn(LEDGER, "2026-09-26"));
  assert.deepEqual(t, { in: 425, out: 50, net: 375, count: 4 });
});

test("a negative amount on an out line does not add money back", () => {
  // Nothing should write one, which is exactly why a sign flip here would
  // survive unnoticed: −₱50 out would read as ₱50 IN on the day's net.
  const t = tally([m("x", "2026-09-26", "out", -50)]);
  assert.deepEqual(t, { in: 0, out: 50, net: -50, count: 1 });
});

test("an empty day is zero, not NaN", () => {
  assert.deepEqual(tally([]), { in: 0, out: 0, net: 0, count: 0 });
});

test("the last day with movement is at or before the day asked for", () => {
  assert.equal(lastDayWith(LEDGER, "2026-09-26"), "2026-09-26");
  // The owner checks at 7am on a day nothing has happened yet.
  assert.equal(lastDayWith(LEDGER, "2026-09-25"), "2026-09-24");
  assert.equal(lastDayWith(LEDGER, "2026-09-23"), "2026-09-20");
  assert.equal(lastDayWith(LEDGER, "2026-01-01"), null);
});

test("the next day with movement is strictly after", () => {
  assert.equal(nextDayWith(LEDGER, "2026-09-20"), "2026-09-24");
  assert.equal(nextDayWith(LEDGER, "2026-09-24"), "2026-09-26");
  // Nothing after the newest day — the arrow has to be able to go dead.
  assert.equal(nextDayWith(LEDGER, "2026-09-26"), null);
});

test("the days with movement come back newest first, once each", () => {
  assert.deepEqual(daysWithMovement(LEDGER), ["2026-09-26", "2026-09-24", "2026-09-20"]);
});

test("stepping a day crosses a month and a year", () => {
  assert.equal(shiftDay("2026-09-26", -1), "2026-09-25");
  assert.equal(shiftDay("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
  // February in a leap year, which is the one a hand-rolled table gets wrong.
  assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDay("2026-02-28", 1), "2026-03-01");
});

test("stepping a day never drifts by a timezone", () => {
  // Manila is UTC+8. A step built on local getters lands on the day before
  // for anyone west of Greenwich and on the right one here, so it would
  // never fail in testing done from Manila.
  let day = "2026-01-01";
  for (let i = 0; i < 400; i += 1) day = shiftDay(day, 1);
  assert.equal(day, "2027-02-05");
});

test("a day shows three movements before it asks", () => {
  // The owner asked for three. The screen reads it off this.
  assert.equal(DAY_PREVIEW, 3);
  assert.ok(movementsOn(LEDGER, "2026-09-26").length > DAY_PREVIEW);
});
