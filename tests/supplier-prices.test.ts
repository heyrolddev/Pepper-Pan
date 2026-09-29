import test from "node:test";
import assert from "node:assert/strict";
import {
  cheaperElsewhere,
  supplierItems,
  supplierTotal,
  unitPrice,
  type PurchaseLine,
} from "../src/lib/supplier-prices.ts";

/**
 * The shop asked for a price history, and what they meant by it was a basis
 * for a decision: is this supplier getting dearer, and is somebody else
 * cheaper. Both of those live in the UNIT price — a ₱1,150 delivery and a
 * ₱250 one say nothing until you know one was five kilos and the other one.
 */

const buy = (over: Partial<PurchaseLine> = {}): PurchaseLine => ({
  id: "1",
  date: "2026-09-01",
  ingredientId: "pork",
  ingredientName: "Pork Belly",
  unit: "g",
  supplierId: "nena",
  supplierName: "Aling Nena",
  qty: 5000,
  paid: 1150,
  ...over,
});

// ---------------------------------------------------------------------------
// The comparable number
// ---------------------------------------------------------------------------

test("the unit price is what makes two deliveries comparable", () => {
  assert.equal(unitPrice({ qty: 5000, paid: 1150 }), 0.23);
  assert.equal(unitPrice({ qty: 1000, paid: 250 }), 0.25);
});

test("a delivery with no quantity has no unit price, rather than a zero", () => {
  // Zero is a price. "We cannot work it out" is not.
  assert.equal(unitPrice({ qty: 0, paid: 500 }), null);
  assert.equal(unitPrice({ qty: -1, paid: 500 }), null);
});

// ---------------------------------------------------------------------------
// Getting dearer
// ---------------------------------------------------------------------------

test("a price rise is measured against the previous delivery, not the average", () => {
  const [item] = supplierItems([
    buy({ id: "a", date: "2026-07-01", qty: 5000, paid: 1000 }), // 0.20
    buy({ id: "b", date: "2026-08-01", qty: 5000, paid: 1100 }), // 0.22
    buy({ id: "c", date: "2026-09-01", qty: 5000, paid: 1250 }), // 0.25
  ]);
  assert.equal(item.lastUnit, 0.25);
  assert.equal(item.previousUnit, 0.22);
  assert.equal(item.move, "up");
  assert.ok(Math.abs(item.change! - (0.25 - 0.22) / 0.22) < 1e-9);
});

test("a fall is a fall, and the order of the deliveries decides which", () => {
  // Reading the list the wrong way round would report every rise as a fall.
  const [item] = supplierItems([
    buy({ id: "a", date: "2026-08-01", qty: 1000, paid: 300 }),
    buy({ id: "b", date: "2026-09-01", qty: 1000, paid: 200 }),
  ]);
  assert.equal(item.move, "down");
  assert.equal(item.lastUnit, 0.2);
});

test("a first delivery has no direction, and is not given one", () => {
  const [item] = supplierItems([buy()]);
  assert.equal(item.move, "first");
  assert.equal(item.change, null);
  assert.equal(item.previousUnit, null);
});

test("under a centavo in the peso is rounding, not a price change", () => {
  const [item] = supplierItems([
    buy({ id: "a", date: "2026-08-01", qty: 1000, paid: 200 }),
    buy({ id: "b", date: "2026-09-01", qty: 1000, paid: 200.5 }),
  ]);
  assert.equal(item.move, "same");
});

test("a delivery with no quantity is skipped as the comparison, not treated as zero", () => {
  const [item] = supplierItems([
    buy({ id: "a", date: "2026-07-01", qty: 1000, paid: 200 }), // 0.20
    buy({ id: "b", date: "2026-08-01", qty: 0, paid: 150 }),    // unusable
    buy({ id: "c", date: "2026-09-01", qty: 1000, paid: 220 }), // 0.22
  ]);
  assert.equal(item.previousUnit, 0.2, "it reaches past the unusable one");
  assert.equal(item.move, "up");
});

// ---------------------------------------------------------------------------
// Grouping and totals
// ---------------------------------------------------------------------------

test("one row per thing bought, with what it has cost in total", () => {
  const items = supplierItems([
    buy({ id: "a", ingredientId: "pork", ingredientName: "Pork Belly", paid: 1000, qty: 5000 }),
    buy({ id: "b", ingredientId: "pork", ingredientName: "Pork Belly", paid: 1100, qty: 5000, date: "2026-09-05" }),
    buy({ id: "c", ingredientId: "oil", ingredientName: "Cooking Oil", unit: "ml", paid: 300, qty: 2000 }),
  ]);
  assert.equal(items.length, 2);
  // Biggest spend first: that is the row where a price move is worth an
  // argument. A thing bought once for forty pesos is not.
  assert.equal(items[0].name, "Pork Belly");
  assert.equal(items[0].times, 2);
  assert.equal(items[0].spent, 2100);
  assert.equal(items[0].qty, 10000);
  assert.equal(items[1].name, "Cooking Oil");
});

test("every delivery is kept, so the row can be opened up", () => {
  const [item] = supplierItems([
    buy({ id: "a", date: "2026-07-01" }),
    buy({ id: "b", date: "2026-09-01" }),
  ]);
  assert.equal(item.lines.length, 2);
  assert.equal(item.lines[0].id, "b", "newest first");
});

test("the supplier's total is the sum of its rows", () => {
  const items = supplierItems([
    buy({ id: "a", paid: 1000 }),
    buy({ id: "b", ingredientId: "oil", ingredientName: "Oil", paid: 300, date: "2026-09-10" }),
  ]);
  const t = supplierTotal(items);
  assert.equal(t.spent, 1300);
  assert.equal(t.items, 2);
  assert.equal(t.lastOn, "2026-09-10");
});

test("a supplier nothing was bought from totals cleanly", () => {
  assert.deepEqual(supplierTotal([]), { spent: 0, items: 0, lastOn: null });
});

// ---------------------------------------------------------------------------
// Somebody else is cheaper — the basis for a decision
// ---------------------------------------------------------------------------

test("another supplier selling the same thing for less is surfaced", () => {
  const found = cheaperElsewhere(
    { ingredientId: "pork", lastUnit: 0.25 },
    [buy({ id: "x", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 190 })]
  );
  assert.ok(found);
  assert.equal(found!.supplierName, "Mang Tony");
  assert.equal(found!.unit, 0.19);
  assert.ok(Math.abs(found!.saving - 0.24) < 1e-9);
});

test("a difference under a twentieth is not worth changing supplier over", () => {
  // Two suppliers within five per cent is not a reason to change who
  // delivers at six in the morning, and saying so weekly gets it ignored.
  const found = cheaperElsewhere(
    { ingredientId: "pork", lastUnit: 0.25 },
    [buy({ id: "x", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 242 })]
  );
  assert.equal(found, null);
});

test("the comparison uses each supplier's LAST price, not an old one", () => {
  // What somebody charged in March is not an offer anybody can take today.
  const found = cheaperElsewhere(
    { ingredientId: "pork", lastUnit: 0.25 },
    [
      buy({ id: "x", date: "2026-03-01", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 100 }),
      buy({ id: "y", date: "2026-09-01", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 240 }),
    ]
  );
  assert.equal(found, null, "Tony's current price is not a saving");
});

test("the cheapest of several is the one named", () => {
  const found = cheaperElsewhere(
    { ingredientId: "pork", lastUnit: 0.30 },
    [
      buy({ id: "x", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 250 }),
      buy({ id: "y", supplierId: "lita", supplierName: "Aling Lita", qty: 1000, paid: 200 }),
    ]
  );
  assert.equal(found!.supplierName, "Aling Lita");
});

test("a different ingredient is not a comparison", () => {
  const found = cheaperElsewhere(
    { ingredientId: "pork", lastUnit: 0.25 },
    [buy({ id: "x", ingredientId: "oil", supplierId: "tony", supplierName: "Mang Tony", qty: 1000, paid: 50 })]
  );
  assert.equal(found, null);
});

test("with no unit price of our own there is nothing to compare against", () => {
  assert.equal(cheaperElsewhere({ ingredientId: "pork", lastUnit: null }, [buy()]), null);
});
