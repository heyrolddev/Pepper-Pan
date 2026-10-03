import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthlyReport,
  daysElapsed,
  daysInMonth,
  monthLabel,
  type MonthInput,
  type OrderRow,
} from "../src/lib/monthly-report.ts";

/**
 * A month report is read once and believed. Every figure in it has to be one
 * the owner could arrive at themselves — and the comparison is where that
 * breaks first, because nine days against thirty-one is made entirely of
 * true numbers and tells a lie about the shop.
 */

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  date: "2026-09-05",
  status: "completed",
  voidedAt: null,
  revenue: 200,
  cogs: 80,
  discount: 0,
  customerId: null,
  fulfillment: "pickup",
  ...over,
});

const input = (over: Partial<MonthInput> = {}): MonthInput => ({
  month: "2026-09",
  today: "2026-10-01",
  orders: [],
  prior: [],
  dishes: [],
  waste: 0,
  fixedCosts: 0,
  ...over,
});

// ---------------------------------------------------------------------------
// Knowing what a month is
// ---------------------------------------------------------------------------

test("a month knows its own length", () => {
  assert.equal(daysInMonth("2026-09"), 30);
  assert.equal(daysInMonth("2026-10"), 31);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29, "a leap year is a real February");
});

test("a month that has not finished knows how far it has got", () => {
  assert.equal(daysElapsed("2026-09", "2026-09-09"), 9);
  assert.equal(daysElapsed("2026-09", "2026-10-01"), 30, "over means all of it");
  assert.equal(daysElapsed("2026-10", "2026-09-30"), 0, "a month that has not started");
});

test("the month is named the way a person would say it", () => {
  assert.equal(monthLabel("2026-09"), "September 2026");
});

// ---------------------------------------------------------------------------
// THE trap
// ---------------------------------------------------------------------------

test("an unfinished month is compared over the same number of days", () => {
  // Nine days of September against all thirty of August is a shop that looks
  // like it is collapsing — and every number in that comparison is real,
  // which is exactly what makes it convincing.
  const r = buildMonthlyReport(
    input({
      today: "2026-09-09",
      orders: Array.from({ length: 9 }, (_, i) =>
        order({ date: `2026-09-0${i + 1}`, revenue: 100 })
      ),
      prior: Array.from({ length: 30 }, (_, i) =>
        order({ date: `2026-08-${String(i + 1).padStart(2, "0")}`, revenue: 100 })
      ),
    })
  );
  assert.equal(r.complete, false);
  assert.equal(r.comparedOver, 9);
  // 900 against the FIRST NINE days of August — also 900 — is flat, not −70%.
  assert.equal(r.money.revenueChange, 0);
});

test("a finished month is compared against the whole of the one before", () => {
  const r = buildMonthlyReport(
    input({
      today: "2026-10-02",
      orders: [order({ revenue: 1000 })],
      prior: [order({ date: "2026-08-05", revenue: 800 })],
    })
  );
  assert.equal(r.complete, true);
  assert.equal(r.comparedOver, 30);
  assert.ok(Math.abs(r.money.revenueChange! - 0.25) < 1e-9);
});

test("with no month before it there is no change, not a zero", () => {
  // Zero reads as "flat", which is a claim. The first month of trading has
  // nothing to be flat against.
  const r = buildMonthlyReport(input({ orders: [order()] }));
  assert.equal(r.money.revenueChange, null);
  assert.equal(r.comparedOver, null);
});

test("an unfinished month charges only the fixed costs that have happened", () => {
  // A whole month of rent against nine days of sales would report a disaster
  // every month until the 20th.
  const full = buildMonthlyReport(input({ today: "2026-10-01", fixedCosts: 30000 }));
  const part = buildMonthlyReport(input({ today: "2026-09-10", fixedCosts: 30000 }));
  assert.equal(full.money.fixedCosts, 30000);
  assert.equal(part.money.fixedCosts, 10000, "ten of thirty days");
});

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

test("the sum is the one the owner would do by hand", () => {
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 1000, cogs: 400, discount: 100 })],
      waste: 50,
      fixedCosts: 200,
    })
  );
  assert.equal(r.money.revenue, 1000);
  assert.equal(r.money.cogs, 400);
  assert.equal(r.money.grossProfit, 600);
  assert.equal(r.money.discounts, 100);
  assert.equal(r.money.netProfit, 600 - 200 - 50);
  assert.ok(Math.abs(r.money.margin! - 0.6) < 1e-9);
});

test("a cancelled order earned nothing and is not counted as if it did", () => {
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 500 }), order({ revenue: 500, status: "cancelled" })],
    })
  );
  assert.equal(r.money.revenue, 500);
  assert.equal(r.trading.orders, 1);
  assert.equal(r.trading.cancelRate, 0.5, "but it still counts against the cancel rate");
});

test("a month with no sales has no margin, rather than a margin of zero", () => {
  const r = buildMonthlyReport(input());
  assert.equal(r.money.margin, null);
  assert.equal(r.trading.avgOrder, 0);
});

// ---------------------------------------------------------------------------
// The days
// ---------------------------------------------------------------------------

test("every day of the month is in the chart, including the closed ones", () => {
  // Closing up the gaps would make a shop that traded three days look like it
  // traded three days in a row.
  const r = buildMonthlyReport(
    input({ orders: [order({ date: "2026-09-01" }), order({ date: "2026-09-20" })] })
  );
  assert.equal(r.trading.byDay.length, 30);
  assert.equal(r.trading.byDay[0].revenue, 200);
  assert.equal(r.trading.byDay[1].revenue, 0);
  assert.equal(r.trading.daysOpen, 2, "but only two days actually traded");
});

test("an unfinished month charts only the days that have happened", () => {
  const r = buildMonthlyReport(input({ today: "2026-09-09", orders: [order()] }));
  assert.equal(r.trading.byDay.length, 9);
});

test("the best and quietest days are named", () => {
  const r = buildMonthlyReport(
    input({
      orders: [
        order({ date: "2026-09-01", revenue: 100 }),
        order({ date: "2026-09-02", revenue: 900 }),
      ],
    })
  );
  assert.equal(r.trading.best!.date, "2026-09-02");
  assert.equal(r.trading.quietest!.date, "2026-09-01");
});

test("one trading day has a best and no quietest", () => {
  // "Your best day was Tuesday and your worst day was Tuesday" is not a
  // finding, it is a sentence that makes the report look automated.
  const r = buildMonthlyReport(input({ orders: [order()] }));
  assert.ok(r.trading.best);
  assert.equal(r.trading.quietest, null);
});

// ---------------------------------------------------------------------------
// Dishes and customers
// ---------------------------------------------------------------------------

test("a dish sold at a loss is found, and named in an action", () => {
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 1000, cogs: 400 })],
      dishes: [
        { mealId: "a", name: "Good Dish", qty: 10, revenue: 1000, cogs: 300, costed: true },
        { mealId: "b", name: "Bad Dish", qty: 8, revenue: 400, cogs: 500, costed: true },
      ],
    })
  );
  assert.equal(r.dishes.losers.length, 1);
  assert.equal(r.dishes.losers[0].name, "Bad Dish");
  const act = r.actions.find((a) => a.title.includes("Bad Dish"));
  assert.ok(act, "the loss-making dish has to turn into something to do");
  assert.ok(/selling more does not/.test(act!.detail));
  // The per-serving figure, which is the one that decides the new price.
  // 8 sold at a ₱100 loss is ₱13 each — the figure that decides the new price.
  assert.ok(/₱13/.test(act!.detail), act!.detail);
});

test("walk-ins are not counted as customers who never came back", () => {
  // A counter-heavy shop would otherwise read as unable to keep anybody.
  const r = buildMonthlyReport(
    input({
      orders: [
        order({ customerId: null }),
        order({ customerId: null }),
        order({ customerId: "a" }),
        order({ customerId: "a" }),
      ],
    })
  );
  assert.equal(r.customers.total, 1);
  assert.equal(r.customers.returning, 1);
  assert.equal(r.customers.walkIns, 2);
  assert.equal(r.customers.repeatRate, 1);
});

test("a dish with no recipe is kept out of the profit ranking, not put on top of it", () => {
  // It costs zero, so it would win the earnings table on the strength of a
  // blank — the most flattering possible way to be wrong, about the dish the
  // shop knows least about.
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 1000, cogs: 400 })],
      dishes: [
        { mealId: "a", name: "Costed Dish", qty: 5, revenue: 500, cogs: 200, costed: true },
        { mealId: "b", name: "No Recipe", qty: 20, revenue: 2000, cogs: 0, costed: false },
      ],
    })
  );
  assert.deepEqual(r.dishes.topEarners.map((d) => d.name), ["Costed Dish"]);
  assert.deepEqual(r.dishes.uncosted.map((d) => d.name), ["No Recipe"]);
  // It still sold the most, and that much is true without a recipe.
  assert.equal(r.dishes.topSellers[0].name, "No Recipe");
  // And it is not accused of losing money either — nothing here knows.
  assert.equal(r.dishes.losers.length, 0);
});

test("a dish nobody has costed turns into something to do", () => {
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 2000, cogs: 400 })],
      dishes: [{ mealId: "b", name: "No Recipe", qty: 20, revenue: 2000, cogs: 0, costed: false }],
    })
  );
  const act = r.actions.find((a) => /No Recipe|recipe/i.test(a.title + a.detail));
  assert.ok(act, "20 sold and nothing knows what they earned is worth saying");
});

test("with no account holders there is no repeat rate", () => {
  const r = buildMonthlyReport(input({ orders: [order({ customerId: null })] }));
  assert.equal(r.customers.repeatRate, null);
});

// ---------------------------------------------------------------------------
// What it says, and what it refuses to say
// ---------------------------------------------------------------------------

test("a month that did not cover its costs says so, with the gap in pesos", () => {
  const r = buildMonthlyReport(
    input({ orders: [order({ revenue: 1000, cogs: 400 })], fixedCosts: 900 })
  );
  const w = r.weaknesses.find((x) => /did not cover/.test(x.title));
  assert.ok(w);
  assert.ok(/300/.test(w!.detail), w!.detail);
  // And it is the most urgent thing on the list.
  assert.ok(/Find the gap/.test(r.actions[0].title));
});

test("every finding carries a number, never an adjective on its own", () => {
  const r = buildMonthlyReport(
    input({
      orders: Array.from({ length: 20 }, (_, i) =>
        order({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, revenue: 100, cogs: 80, customerId: `c${i}` })
      ),
      prior: [order({ date: "2026-08-01", revenue: 5000 })],
      dishes: [{ mealId: "b", name: "Loser", qty: 3, revenue: 100, cogs: 200, costed: true }],
      waste: 500,
      fixedCosts: 2000,
    })
  );
  for (const f of [...r.strengths, ...r.weaknesses, ...r.actions]) {
    assert.ok(f.detail.length > 15, `${f.title} says nothing: ${f.detail}`);
    assert.ok(
      /[₱\d]/.test(f.detail),
      `"${f.title}" has no number behind it — that is an opinion, not a finding`
    );
  }
});

test("a quiet month invents nothing to fill the page", () => {
  // A report padded with generic advice teaches the owner to skim it, and
  // then the month it says something urgent, they skim that too.
  const r = buildMonthlyReport(input({ today: "2026-10-01" }));
  assert.equal(r.strengths.length, 0);
  assert.equal(r.actions.length, 0);
  assert.equal(r.weaknesses.length, 1);
  assert.ok(/No sales recorded/.test(r.weaknesses[0].title));
});

test("a loss is written as a loss, not as a peso sign with a minus after it", () => {
  // `₱-800` reads as a typo and makes a reader stop. `−₱800` reads as money.
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 1000, cogs: 400 })],
      dishes: [{ mealId: "b", name: "Loser", qty: 10, revenue: 100, cogs: 900, costed: true }],
    })
  );
  const w = r.weaknesses.find((x) => /sold at a loss/.test(x.title))!;
  assert.ok(!/₱-/.test(w.detail), w.detail);
  assert.ok(/−₱800/.test(w.detail), w.detail);
});

test("the actions come back most valuable first", () => {
  const r = buildMonthlyReport(
    input({
      orders: [order({ revenue: 1000, cogs: 900 })],
      dishes: [{ mealId: "b", name: "Loser", qty: 5, revenue: 100, cogs: 300, costed: true }],
      fixedCosts: 5000,
    })
  );
  const weights = r.actions.map((a) => a.weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
});
