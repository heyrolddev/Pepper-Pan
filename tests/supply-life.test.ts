import test from "node:test";
import assert from "node:assert/strict";
import {
  costPerDay,
  humanSpan,
  itemKey,
  itemName,
  lifespanDays,
  supplyLife,
  type SupplyRow,
} from "../src/lib/supply-life.ts";

/**
 * The thing being protected here is a reorder warning the shop will act on.
 *
 * An average that is three times too long does not look wrong on a screen —
 * it looks like a number — and the shop finds out it was wrong when the gas
 * dies mid-service. So the arithmetic that produces it is pinned line by
 * line, especially the division by `qty`, which is the one an eye slides
 * straight past.
 */

const row = (over: Partial<SupplyRow> = {}): SupplyRow => ({
  id: "r1",
  label: "Dishwashing liquid",
  sizeLabel: null,
  amount: 120,
  qty: 1,
  spentOn: "2026-01-01",
  ranOutOn: null,
  ...over,
});

// ---------------------------------------------------------------------------
// One purchase
// ---------------------------------------------------------------------------

test("a purchase still in use has no lifespan yet", () => {
  assert.equal(lifespanDays(row()), null);
});

test("bought the 1st, ran out the 31st is thirty days", () => {
  assert.equal(lifespanDays(row({ spentOn: "2026-01-01", ranOutOn: "2026-01-31" })), 30);
});

test("three tanks bought together are three lifespans, not one", () => {
  // THE bug this guards. 90 days of gas across three tanks is 30 days a
  // tank. Without the division the shop is told a tank lasts three months
  // and reorders two tanks too late.
  const three = row({ qty: 3, spentOn: "2026-01-01", ranOutOn: "2026-04-01" });
  assert.equal(lifespanDays(three), 30);
  const one = row({ qty: 1, spentOn: "2026-01-01", ranOutOn: "2026-04-01" });
  assert.equal(lifespanDays(one), 90);
});

test("bought and finished the same day counts as a day, not as zero", () => {
  // Zero would make an average of zero, and a reorder warning built on zero
  // fires every second and gets ignored.
  assert.equal(lifespanDays(row({ spentOn: "2026-01-01", ranOutOn: "2026-01-01" })), 1);
});

test("a qty of zero does not divide by zero", () => {
  assert.equal(lifespanDays(row({ qty: 0, spentOn: "2026-01-01", ranOutOn: "2026-01-11" })), 10);
});

// ---------------------------------------------------------------------------
// What counts as the same thing
// ---------------------------------------------------------------------------

test("case and stray spaces do not split one item into three", () => {
  assert.equal(itemKey("Tissue", null), itemKey("tissue ", null));
  assert.equal(itemKey("Tissue", null), itemKey("  TISSUE", null));
  assert.equal(itemKey("Cleaning  tools", null), itemKey("Cleaning tools", null));
});

test("but an 11kg tank and a 22kg tank are different things", () => {
  assert.notEqual(itemKey("LPG", "11kg"), itemKey("LPG", "22kg"));
});

test("the size shows in the name, so two rows are tellable apart", () => {
  assert.equal(itemName("LPG", "11kg"), "LPG (11kg)");
  assert.equal(itemName("  Tissue  ", null), "Tissue");
});

// ---------------------------------------------------------------------------
// The roll-up
// ---------------------------------------------------------------------------

test("nothing has run out yet, so there is no estimate to give", () => {
  const [item] = supplyLife([row({ spentOn: "2026-01-01" })], "2026-01-20");
  assert.equal(item.days, null);
  assert.equal(item.finished, 0);
  assert.equal(item.open, 1);
  assert.equal(item.openFor, 19);
  // And nothing is "due", because due against what?
  assert.equal(item.dueNow, false);
});

test("one finished purchase is already a real measurement", () => {
  // Unlike the gap-between-refills guess, which needs two dates before it
  // knows anything, an end date IS the duration.
  const [item] = supplyLife(
    [row({ spentOn: "2026-01-01", ranOutOn: "2026-01-25" })],
    "2026-02-01"
  );
  assert.equal(item.days, 24);
  assert.equal(item.finished, 1);
});

test("the median, so one fiesta week does not drag the estimate down", () => {
  const rows: SupplyRow[] = [
    row({ id: "a", spentOn: "2026-01-01", ranOutOn: "2026-01-31" }), // 30
    row({ id: "b", spentOn: "2026-02-01", ranOutOn: "2026-03-03" }), // 30
    row({ id: "c", spentOn: "2026-03-03", ranOutOn: "2026-03-05" }), // 2
  ];
  const [item] = supplyLife(rows, "2026-03-10");
  assert.equal(item.days, 30, "the mean would be 21 and would fire eight days early");
});

test("the open one is measured, and says when it is overdue", () => {
  const rows: SupplyRow[] = [
    row({ id: "a", spentOn: "2026-01-01", ranOutOn: "2026-01-21" }), // 20 days
    row({ id: "b", spentOn: "2026-01-21" }), // still going
  ];
  const before = supplyLife(rows, "2026-02-05")[0];
  assert.equal(before.days, 20);
  assert.equal(before.openFor, 15);
  assert.equal(before.dueNow, false);

  const after = supplyLife(rows, "2026-02-12")[0];
  assert.equal(after.openFor, 22);
  assert.equal(after.dueNow, true, "22 days into a 20-day bottle is worth saying");
});

test("the one that needs buying first comes first", () => {
  const rows: SupplyRow[] = [
    // Tissue: lasts 60, open 5 days — plenty left.
    row({ id: "t1", label: "Tissue", spentOn: "2026-01-01", ranOutOn: "2026-03-02" }),
    row({ id: "t2", label: "Tissue", spentOn: "2026-03-02" }),
    // Gas: lasts 20, open 19 days — nearly out.
    row({ id: "g1", label: "LPG", sizeLabel: "11kg", spentOn: "2026-01-01", ranOutOn: "2026-01-21" }),
    row({ id: "g2", label: "LPG", sizeLabel: "11kg", spentOn: "2026-02-15" }),
  ];
  const out = supplyLife(rows, "2026-03-06");
  assert.equal(out[0].name, "LPG (11kg)");
  assert.equal(out[1].name, "Tissue");
});

test("an item with no estimate sorts last rather than looking urgent", () => {
  const rows: SupplyRow[] = [
    row({ id: "n1", label: "Mop", spentOn: "2026-01-01" }),
    row({ id: "g1", label: "LPG", sizeLabel: "11kg", spentOn: "2026-01-01", ranOutOn: "2026-01-21" }),
    row({ id: "g2", label: "LPG", sizeLabel: "11kg", spentOn: "2026-01-21" }),
  ];
  const out = supplyLife(rows, "2026-02-14");
  assert.equal(out[0].name, "LPG (11kg)");
  assert.equal(out[out.length - 1].name, "Mop");
});

test("the total spent counts every purchase, open or finished", () => {
  const rows: SupplyRow[] = [
    row({ id: "a", amount: 120, spentOn: "2026-01-01", ranOutOn: "2026-01-31" }),
    row({ id: "b", amount: 135, spentOn: "2026-02-01" }),
  ];
  const [item] = supplyLife(rows, "2026-02-10");
  assert.equal(item.spent, 255);
  // The last price, not the first — the price moves.
  assert.equal(item.lastUnitCost, 135);
});

test("the unit cost divides a multi-buy", () => {
  const [item] = supplyLife([row({ amount: 3600, qty: 3 })], "2026-01-10");
  assert.equal(item.lastUnitCost, 1200);
});

test("units counts what the finished purchases actually covered", () => {
  const rows: SupplyRow[] = [
    row({ id: "a", qty: 3, spentOn: "2026-01-01", ranOutOn: "2026-04-01" }),
    row({ id: "b", qty: 2, spentOn: "2026-04-01" }),
  ];
  const [item] = supplyLife(rows, "2026-04-10");
  assert.equal(item.units, 3, "the two still in the stall have not lasted anything yet");
});

// ---------------------------------------------------------------------------
// Saying it out loud
// ---------------------------------------------------------------------------

test("the span is said in the unit a person would use", () => {
  assert.equal(humanSpan(1), "1 day");
  assert.equal(humanSpan(9), "9 days");
  assert.equal(humanSpan(21), "about 3 weeks");
  assert.equal(humanSpan(7.4), "7 days");
  assert.equal(humanSpan(14), "about 2 weeks");
  assert.equal(humanSpan(90), "about 3 months");
  assert.equal(humanSpan(30), "about 4 weeks");
});

test("a cost per day makes two tank sizes comparable", () => {
  const big = supplyLife(
    [row({ label: "LPG", sizeLabel: "22kg", amount: 1300, spentOn: "2026-01-01", ranOutOn: "2026-01-27" })],
    "2026-02-01"
  )[0];
  const small = supplyLife(
    [row({ label: "LPG", sizeLabel: "11kg", amount: 750, spentOn: "2026-01-01", ranOutOn: "2026-01-13" })],
    "2026-02-01"
  )[0];
  assert.equal(Math.round(costPerDay(big)! * 100) / 100, 50);
  assert.equal(Math.round(costPerDay(small)! * 100) / 100, 62.5);
  // The bigger tank is cheaper per day, which nothing on the screen says
  // until the division is done.
  assert.ok(costPerDay(big)! < costPerDay(small)!);
});

test("no estimate means no cost per day, rather than a made-up one", () => {
  const [item] = supplyLife([row()], "2026-01-10");
  assert.equal(costPerDay(item), null);
});
