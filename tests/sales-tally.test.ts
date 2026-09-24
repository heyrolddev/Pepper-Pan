import test from "node:test";
import assert from "node:assert/strict";

import { tallySales, type SoldLine } from "../src/lib/sales-tally.ts";

/**
 * What sold — with the add-ons in it.
 *
 * The bug this locks down is not that a number was slightly off. The same
 * tally feeds the best sellers AND the slow movers, so a dish sold only as an
 * add-on read zero and came back at the top of the list the owner is invited
 * to cut. Getting this wrong recommends deleting a best seller.
 */

const line = (
  name: string,
  qty: number,
  price: number,
  extras: SoldLine["order_line_extras"] = []
): SoldLine => ({
  qty,
  price_at_sale: price,
  meals: { name },
  order_line_extras: extras,
});

const extra = (label: string, qty: number, price: number, dish?: string) => ({
  label,
  qty,
  price_at_sale: price,
  meals: dish ? { name: dish } : null,
});

test("a dish sold only as an add-on is not invisible", () => {
  const sold = tallySales([
    line("Bagnet Rice", 1, 189, [extra("Extra rice", 1, 25, "Rice (cup)")]),
  ]);
  const rice = sold.find((s) => s.name === "Rice (cup)");
  assert.equal(rice?.qty, 1);
  assert.equal(rice?.revenue, 25);
});

test("an add-on merges with direct sales of the same dish", () => {
  // Rice sold on its own, and rice sold hanging off a meal, are one dish.
  const sold = tallySales([
    line("Rice (cup)", 2, 25),
    line("Bagnet Rice", 1, 189, [extra("Extra rice", 1, 25, "Rice (cup)")]),
  ]);
  assert.equal(sold.filter((s) => s.name === "Rice (cup)").length, 1);
  assert.equal(sold.find((s) => s.name === "Rice (cup)")?.qty, 3);
});

test("two extras on a line of three is six, not two", () => {
  // The same multiplication `order_requirements` does for the stock. Counted
  // once per line, the shelf and the report would disagree.
  const sold = tallySales([
    line("Bagnet Rice", 3, 189, [extra("Extra rice", 2, 25, "Rice (cup)")]),
  ]);
  assert.equal(sold.find((s) => s.name === "Rice (cup)")?.qty, 6);
  assert.equal(sold.find((s) => s.name === "Rice (cup)")?.revenue, 150);
});

test("an add-on whose dish was deleted still counts, under its label", () => {
  const sold = tallySales([
    line("Solo Ji Pai", 1, 150, [extra("Iced tea", 1, 0, undefined)]),
  ]);
  assert.equal(sold.find((s) => s.name === "Iced tea")?.qty, 1);
});

test("a free add-on adds a sale and no money", () => {
  // The drink that comes with the combo. It left the shelf, so it sold.
  const sold = tallySales([
    line("Combo", 1, 220, [extra("Iced tea", 1, 0, "Iced Tea 16oz")]),
  ]);
  const tea = sold.find((s) => s.name === "Iced Tea 16oz");
  assert.equal(tea?.qty, 1);
  assert.equal(tea?.revenue, 0);
});

test("a cancelled order sold nothing, add-ons included", () => {
  const sold = tallySales([
    { ...line("Bagnet Rice", 1, 189, [extra("Extra rice", 1, 25, "Rice (cup)")]),
      orders: { status: "cancelled" } },
  ]);
  assert.deepEqual(sold, []);
});

test("the ranking is by how many sold", () => {
  const sold = tallySales([
    line("Quiet dish", 1, 100),
    line("Busy dish", 9, 100),
    line("Middle", 4, 100),
  ]);
  assert.deepEqual(sold.map((s) => s.name), ["Busy dish", "Middle", "Quiet dish"]);
});

test("a line with no dish left still shows up rather than vanishing", () => {
  const sold = tallySales([{ qty: 2, price_at_sale: 50, meals: null }]);
  assert.equal(sold[0].name, "Unknown item");
  assert.equal(sold[0].qty, 2);
});
