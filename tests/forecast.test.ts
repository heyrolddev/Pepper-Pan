import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_WEEKS,
  VERDICT_WEEKS,
  addWeeks,
  directionOf,
  fitDampedTrend,
  outlook,
  project,
  weekStartOf,
  weeklySeries,
  type DayTake,
} from "../src/lib/forecast.ts";

/**
 * The projection, checked against the things it must never do.
 *
 * A forecast is the one feature in this system that cannot be verified by
 * looking at it — a wrong line looks exactly like a right one. So the tests
 * are written as the promises the panel makes: that it damps, that it widens,
 * that it refuses, and that it does not call noise a trend.
 */

const days = (specs: [string, number][]): DayTake[] =>
  specs.map(([date, revenue]) => ({ date, revenue }));

/** n whole weeks of one figure a week, ending before `today`. */
function flatWeeks(n: number, perWeek: number, from = "2026-01-05"): DayTake[] {
  const out: DayTake[] = [];
  for (let i = 0; i < n; i++) out.push({ date: addWeeks(from, i), revenue: perWeek });
  return out;
}

// --- weeks -----------------------------------------------------------------

test("a week starts on Monday, whatever day the sale was", () => {
  // 2026-01-07 is a Wednesday; 2026-01-11 the Sunday that ends the same week.
  assert.equal(weekStartOf("2026-01-07"), "2026-01-05");
  assert.equal(weekStartOf("2026-01-11"), "2026-01-05");
  assert.equal(weekStartOf("2026-01-12"), "2026-01-12");
});

test("the week in progress is never counted", () => {
  // Including it puts a false crash at the end of every chart: three days of
  // a week always looks like a collapse beside seven days of the last one.
  const weeks = weeklySeries(
    days([
      ["2026-01-05", 5000],
      ["2026-01-12", 5000],
      ["2026-01-19", 1200],
    ]),
    "2026-01-21"
  );
  assert.deepEqual(
    weeks.map((w) => w.weekStart),
    ["2026-01-05", "2026-01-12"]
  );
});

test("a week with no trading is a real zero, not a gap", () => {
  const weeks = weeklySeries(
    days([
      ["2026-01-05", 5000],
      ["2026-01-19", 5000],
    ]),
    "2026-01-26"
  );
  assert.deepEqual(weeks.map((w) => w.revenue), [5000, 0, 5000]);
});

test("days in one week add up", () => {
  const weeks = weeklySeries(
    days([
      ["2026-01-05", 1000],
      ["2026-01-08", 2000],
      ["2026-01-11", 500],
    ]),
    "2026-01-12"
  );
  assert.deepEqual(weeks, [{ weekStart: "2026-01-05", revenue: 3500 }]);
});

// --- refusing --------------------------------------------------------------

test("too little history gets no forecast at all", () => {
  const fit = fitDampedTrend(new Array(MIN_WEEKS - 1).fill(5000));
  assert.equal(fit, null);
});

test("a short history still gets its weeks drawn", () => {
  // The chart of what happened is worth showing even when the projection
  // isn't — an empty panel teaches the owner nothing.
  // `today` is the Monday right after the last trading week, so no empty
  // week is appended — the zero-week rule is exercised in its own test.
  const o = outlook(flatWeeks(3, 5000), addWeeks("2026-01-05", 3), 6);
  assert.equal(o.weeks.length, 3);
  assert.equal(o.fit, null);
  assert.deepEqual(o.forecast, []);
});

// --- the damping, which is the whole point ---------------------------------

test("a rising trend flattens instead of running away", () => {
  // The promise made to the owner: a stall growing ₱2,000 a month is not
  // projected to grow ₱24,000 a month by next year.
  const rising = Array.from({ length: 20 }, (_, i) => 4000 + i * 200);
  const fit = fitDampedTrend(rising)!;
  const far = project(fit, 52);

  const firstMonth = far[3].mean - far[0].mean;
  const lastMonth = far[51].mean - far[48].mean;
  assert.ok(
    lastMonth < firstMonth,
    `growth must decelerate: ${lastMonth} should be under ${firstMonth}`
  );
});

test("the projection never exceeds its own asymptote", () => {
  // ℓ + φb/(1−φ) is where a damped trend is heading. Going past it would
  // mean the damping is not being applied.
  const rising = Array.from({ length: 20 }, (_, i) => 4000 + i * 200);
  const fit = fitDampedTrend(rising)!;
  const ceiling = fit.level + (fit.phi * fit.trend) / (1 - fit.phi);
  for (const p of project(fit, 104)) {
    assert.ok(p.mean <= ceiling + 1, `${p.mean} went past the asymptote ${ceiling}`);
  }
});

test("a flat business is projected flat", () => {
  const fit = fitDampedTrend(new Array(16).fill(6000))!;
  const p = project(fit, 26);
  assert.ok(Math.abs(p[25].mean - 6000) < 1, `${p[25].mean} should still be 6000`);
});

// --- the fan ---------------------------------------------------------------

test("the range widens the further out it looks", () => {
  const noisy = [4000, 5200, 4400, 6100, 4900, 5800, 5100, 6400, 5600, 6900];
  const fit = fitDampedTrend(noisy)!;
  const p = project(fit, 26);
  const near = p[0].hi80 - p[0].lo80;
  const far = p[25].hi80 - p[25].lo80;
  assert.ok(far > near, `the fan must open: ${far} should exceed ${near}`);
});

test("the likely range sits inside the wider one", () => {
  const noisy = [4000, 5200, 4400, 6100, 4900, 5800, 5100, 6400, 5600, 6900];
  const p = project(fitDampedTrend(noisy)!, 12);
  for (const x of p) {
    assert.ok(x.lo80 <= x.lo50 && x.hi50 <= x.hi80, "50% must nest inside 80%");
    assert.ok(x.lo50 <= x.mean && x.mean <= x.hi50, "the mean must sit inside both");
  }
});

test("no part of the fan goes below zero", () => {
  // A shop cannot take negative money, and a band under the axis reads as
  // though it owes its customers.
  const falling = [9000, 7500, 6000, 4500, 3000, 1800, 900, 400];
  const p = project(fitDampedTrend(falling)!, 52);
  for (const x of p) assert.ok(x.lo80 >= 0 && x.mean >= 0, `${x.lo80} went negative`);
});

// --- the verdict -----------------------------------------------------------

test("noise is not called a trend", () => {
  // Up, down, up, down around one figure. A ruler on the last two points
  // says "growing"; this must not.
  const wobble = [5000, 5600, 4700, 5500, 4800, 5400, 4900, 5500, 5000, 5300, 4800, 5400];
  const o = outlook(
    wobble.map((revenue, i) => ({ date: addWeeks("2026-01-05", i), revenue })),
    addWeeks("2026-01-05", wobble.length),
    6
  );
  assert.equal(o.direction, "steady");
});

test("a business genuinely climbing is called growing", () => {
  const climbing = Array.from({ length: 20 }, (_, i) => 4000 + i * 400);
  const o = outlook(
    climbing.map((revenue, i) => ({ date: addWeeks("2026-01-05", i), revenue })),
    addWeeks("2026-01-05", climbing.length),
    6
  );
  assert.equal(o.direction, "growing");
});

test("a business genuinely sliding is called slowing", () => {
  const sliding = Array.from({ length: 20 }, (_, i) => 12000 - i * 400);
  const o = outlook(
    sliding.map((revenue, i) => ({ date: addWeeks("2026-01-05", i), revenue })),
    addWeeks("2026-01-05", sliding.length),
    6
  );
  assert.equal(o.direction, "slowing");
});

test("the verdict is read at a quarter, not at the end of the chart", () => {
  // Twelve months out the band is wide enough to swallow almost anything, so
  // reading the verdict there would answer "too early to tell" forever.
  const climbing = Array.from({ length: 24 }, (_, i) => 4000 + i * 400);
  const rows = climbing.map((revenue, i) => ({ date: addWeeks("2026-01-05", i), revenue }));
  const today = addWeeks("2026-01-05", climbing.length);
  assert.equal(
    outlook(rows, today, 6).direction,
    outlook(rows, today, 12).direction,
    "the same business cannot be growing on one view and not on another"
  );
});

test("a rise inside the noise reads steady, a rise clear of it reads growing", () => {
  // The same slope, told apart only by how much the weeks scatter — which is
  // exactly the judgement a trend line alone cannot make.
  const steps = 16;
  const quiet = Array.from({ length: steps }, (_, i) => 5000 + i * 150);
  // An UNBALANCED wobble, which is the kind that actually hides a slope. A
  // tidy alternating ±n does not: it cancels out of a least-squares fit
  // almost exactly, so the trend comes through it unharmed.
  const bump = [0, 1, -1, 2, -2, 1, 0, -1, 2, -2, 0, 1, -1, -2, 2, 0];
  const loud = quiet.map((v, i) => v + bump[i] * 2600);
  const at = (vals: number[]) =>
    outlook(
      vals.map((revenue, i) => ({ date: addWeeks("2026-01-05", i), revenue })),
      addWeeks("2026-01-05", steps),
      6
    ).direction;
  assert.equal(at(quiet), "growing");
  assert.equal(at(loud), "steady");
});

test("with too little history, the verdict is not a claim", () => {
  const thin = Array.from({ length: MIN_WEEKS - 1 }, (_, i) => ({
    weekStart: addWeeks("2026-01-05", i),
    revenue: 1000 + i * 5000,
  }));
  assert.equal(directionOf(thin), "steady");
});

test("a real move that is too small to matter reads steady", () => {
  // Statistically detectable is not the same as worth saying. A perfectly
  // clean ₱20 a week on ₱18,000 is ₱260 a quarter — true, and useless.
  const tiny = Array.from({ length: 30 }, (_, i) => ({
    weekStart: addWeeks("2026-01-05", i),
    revenue: 18000 + i * 20,
  }));
  assert.equal(directionOf(tiny), "steady");
});

test("a long, unmistakable climb is never called too early to tell", () => {
  // The regression this test exists for: read off the fan instead of the
  // slope, forty weeks of obvious growth came back "steady", because a
  // one-week prediction interval contains scatter the question never asked
  // about.
  const climbing = Array.from({ length: 40 }, (_, i) => ({
    weekStart: addWeeks("2026-01-05", i),
    revenue: 16000 + i * 400 + (i % 3 === 0 ? 1800 : -900),
  }));
  assert.equal(directionOf(climbing), "growing");
});

// --- what the owner is actually shown --------------------------------------

test("the horizon asked for is the horizon returned", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    date: addWeeks("2026-01-05", i),
    revenue: 5000 + i * 100,
  }));
  const today = addWeeks("2026-01-05", 20);
  assert.equal(outlook(rows, today, 6).forecast.length, Math.round(6 * (52 / 12)));
  assert.equal(outlook(rows, today, 12).forecast.length, 52);
});

test("a six-month view still knows the quarterly verdict", () => {
  // The verdict is read at week 13, so a shorter horizon must not truncate
  // the run it is read from.
  assert.ok(Math.round(3 * (52 / 12)) <= VERDICT_WEEKS);
  const rows = Array.from({ length: 20 }, (_, i) => ({
    date: addWeeks("2026-01-05", i),
    revenue: 4000 + i * 400,
  }));
  const o = outlook(rows, addWeeks("2026-01-05", 20), 1);
  assert.equal(o.direction, "growing");
  assert.equal(o.forecast.length, Math.round(52 / 12));
});

test("the monthly figures are weeks scaled by 52/12, not a sloppy four", () => {
  const o = outlook(flatWeeks(12, 6000), addWeeks("2026-01-05", 12), 6);
  assert.ok(Math.abs(o.monthlyNow - 6000 * (52 / 12)) < 0.01);
  assert.ok(o.monthlyNow > 6000 * 4, "×4 would lose most of a month a year");
});
