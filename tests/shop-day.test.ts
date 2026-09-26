import test from "node:test";
import assert from "node:assert/strict";

import {
  middayOf,
  shopDay,
  shopMonthStart,
  shopToday,
} from "../src/lib/format-date.ts";

/**
 * The eight hours HQ spent calling yesterday "today".
 *
 * Manila is UTC+8 and the shop's day used to be read off `toISOString()`, so
 * from midnight to 8am every morning every "today" on every screen was the
 * day before. The owner met it on a Sunday: the band read "Sunday, 27
 * September" over Saturday's ₱2,061 and 8 orders, with Sunday not yet open.
 *
 * These are wall-clock instants written as UTC, which is the only way to
 * pin a timezone bug down — a test that builds its input with `new Date()`
 * and local getters agrees with whatever the bug is doing.
 */

/** 2026-09-27 00:30 Manila = 2026-09-26 16:30 UTC. */
const SUNDAY_HALF_PAST_MIDNIGHT = new Date("2026-09-26T16:30:00Z");
/** 2026-09-27 07:00 Manila = 2026-09-26 23:00 UTC — the hour it was seen. */
const SUNDAY_SEVEN_AM = new Date("2026-09-26T23:00:00Z");
/** 2026-09-26 18:00 Manila = 2026-09-26 10:00 UTC — mid-service Saturday. */
const SATURDAY_EVENING = new Date("2026-09-26T10:00:00Z");

test("a Manila morning before 8am is already the new day", () => {
  assert.equal(shopToday(SUNDAY_HALF_PAST_MIDNIGHT), "2026-09-27");
  assert.equal(shopToday(SUNDAY_SEVEN_AM), "2026-09-27");
});

test("reading it in UTC is what produced the bug", () => {
  // The old implementation, kept here as the thing being guarded against.
  assert.equal(SUNDAY_SEVEN_AM.toISOString().slice(0, 10), "2026-09-26");
  assert.notEqual(shopToday(SUNDAY_SEVEN_AM), SUNDAY_SEVEN_AM.toISOString().slice(0, 10));
});

test("an ordinary trading evening is unaffected", () => {
  // Manila 8am–midnight has always agreed with UTC, which is why this went
  // unnoticed for as long as it did — nobody looks at HQ at 2am.
  assert.equal(shopToday(SATURDAY_EVENING), "2026-09-26");
  assert.equal(SATURDAY_EVENING.toISOString().slice(0, 10), "2026-09-26");
});

test("the last moment of a Manila day is still that day", () => {
  // 2026-09-27 23:59 Manila = 2026-09-27 15:59 UTC.
  assert.equal(shopToday(new Date("2026-09-27T15:59:00Z")), "2026-09-27");
  // One minute later it is the 28th.
  assert.equal(shopToday(new Date("2026-09-27T16:00:00Z")), "2026-09-28");
});

test("yesterday is the day before the shop's day, not the instant", () => {
  assert.equal(shopDay(-1, SUNDAY_SEVEN_AM), "2026-09-26");
  assert.equal(shopDay(0, SUNDAY_SEVEN_AM), "2026-09-27");
  assert.equal(shopDay(1, SUNDAY_SEVEN_AM), "2026-09-28");
});

test("shifting days crosses a month and a year", () => {
  // 2026-10-01 02:00 Manila = 2026-09-30 18:00 UTC.
  const octoberFirst = new Date("2026-09-30T18:00:00Z");
  assert.equal(shopToday(octoberFirst), "2026-10-01");
  assert.equal(shopDay(-1, octoberFirst), "2026-09-30");
  // 2027-01-01 01:00 Manila = 2026-12-31 17:00 UTC.
  const newYear = new Date("2026-12-31T17:00:00Z");
  assert.equal(shopToday(newYear), "2027-01-01");
  assert.equal(shopDay(-1, newYear), "2026-12-31");
});

test("a fortnight back lands fourteen days back", () => {
  assert.equal(shopDay(-13, SUNDAY_SEVEN_AM), "2026-09-14");
});

test("the month starts on the first of the shop's month", () => {
  assert.equal(shopMonthStart(SUNDAY_SEVEN_AM), "2026-09-01");
  // 2026-10-01 02:00 Manila — the month rolls over here, not eight hours later.
  assert.equal(shopMonthStart(new Date("2026-09-30T18:00:00Z")), "2026-10-01");
});

test("a label built from a day lands on that day, not its neighbour", () => {
  // The bar chart formats its labels in Manila from a key it derives
  // separately. Midnight UTC would be 8am Manila — right here, and the day
  // before for anyone west of Greenwich looking at the same page.
  const noon = middayOf("2026-09-27");
  assert.equal(shopToday(noon), "2026-09-27");
  assert.equal(noon.toISOString().slice(0, 10), "2026-09-27");
});

/* ---- the report, as it was reported ---- */

test("Saturday's trade does not turn up as Sunday's", () => {
  // The exact shape of the Today page's filter, at the hour it was seen:
  // eight Saturday orders, nothing yet on Sunday, read at 7am Manila.
  const orders = [
    { date: "2026-09-26", revenue: 300 },
    { date: "2026-09-26", revenue: 1761 },
  ];
  const todayStr = shopToday(SUNDAY_SEVEN_AM);
  const yesterdayStr = shopDay(-1, SUNDAY_SEVEN_AM);

  const takings = (day: string) =>
    orders.filter((o) => o.date === day).reduce((s, o) => s + o.revenue, 0);

  assert.equal(takings(todayStr), 0, "Sunday has not opened yet");
  assert.equal(takings(yesterdayStr), 2061, "Saturday's ₱2,061 is Saturday's");
});

test("the day on the heading is the day in the figure", () => {
  // The band formats its date from `todayStr` rather than from its own clock.
  // Two clocks is how the heading came to say Sunday over Saturday's money,
  // and no value fix prevents that recurring — only having one clock does.
  for (const at of [SUNDAY_HALF_PAST_MIDNIGHT, SUNDAY_SEVEN_AM, SATURDAY_EVENING]) {
    const todayStr = shopToday(at);
    assert.equal(shopToday(middayOf(todayStr)), todayStr);
  }
});
