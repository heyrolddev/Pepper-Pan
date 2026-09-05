import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertLegacyBackup,
  detectBackupKind,
} from "../src/lib/legacy-import.ts";
import { parentsToClear } from "../src/lib/restore-order.ts";

/**
 * A small file in the old app's shape, with one of everything that matters.
 *
 * Written out by hand rather than trimmed from the real export, because a
 * fixture cut from real data quietly stops covering the case it was cut for
 * the first time somebody "tidies" it.
 */
function legacyFile() {
  return {
    app: "PepperPan",
    version: 1,
    exportedAt: "2026-09-05T02:43:11.753Z",
    data: {
      inventory: [
        {
          id: "inv1",
          name: "IODIZED SALT",
          unit: "g",
          purchasePrice: 18,
          purchaseQty: 1000,
          categories: ["Dry", "dry", "  "],
          cost: 0.018,
          stock: 270.9,
          reorder: 100,
          lots: [
            { id: "lot1", qty: 270.9, cost: 0.018, receivedDate: null, expiryDate: null },
            { id: "lot2", qty: 10, cost: 0.02, receivedDate: "2026-08-30", expiryDate: "2027-01-01" },
            { qty: 5, cost: 0.02 },
          ],
        },
      ],
      batches: [
        {
          id: "b1",
          name: "Black Pepper Sauce",
          yieldQty: 2400,
          yieldUnit: "g",
          batchStock: 1695,
          reorderLevel: 500,
          manualCostPerUnit: null,
          ingredients: [{ invId: "inv1", qty: 10.9 }, { qty: 3 }],
        },
      ],
      meals: [
        {
          id: "m1",
          name: "XL/BP Chicken Noodles",
          price: 179,
          kind: "single",
          categories: ["Mains"],
          ingredients: [
            { type: "batch", refId: "b1", qty: 140 },
            { type: "inv", refId: "inv1", qty: 75 },
            { type: "nonsense", refId: "x", qty: 1 },
          ],
          components: [],
        },
      ],
      orders: [
        {
          id: "o1",
          date: "2026-08-26",
          loggedBy: "Eunice",
          lines: [{ mealId: "m1", qty: 2, priceAtSale: 179 }],
          revenue: 358,
          cogs: 100,
          tag: "",
          oe: 0,
          grossProfit: 258,
          netProfit: 258,
        },
      ],
      cashLedger: [
        {
          id: "c1",
          at: "2026-08-31T01:27:28.341Z",
          date: "2026-08-31",
          type: "out",
          source: "restock",
          amount: 250,
          note: "B. PEPPER",
          purchaseLogId: "p1",
        },
        { id: "c2", date: "2026-09-01", type: "in", source: "order", amount: 537, orderId: "o1" },
      ],
      purchaseLog: [
        { id: "p1", invId: "inv1", lotId: "lot2", date: "2026-08-31", supplier: "Antobox", qty: 1000, cost: 0.25, loggedBy: "Eunice" },
      ],
      consumptionLog: [{ id: "k1", date: "2026-08-27", invId: "inv1", qty: 10.9, type: "sale" }],
      waste: [
        { id: "w1", date: "2026-08-28", invId: "inv1", qty: 68, unit: "g", reason: "Staff meal", costAtTime: 0.12, totalCost: 8.16, category: "internal", sourceType: "meal", sourceId: "m1", sourceName: "Noodles", note: "", loggedBy: "harold" },
      ],
      activityLog: [
        { id: "a1", at: "2026-08-27T14:53:16.593Z", date: "2026-08-27", category: "config", description: "Duplicated meal", undoable: false, undone: false, undoType: null, undoData: null },
      ],
      settings: {
        pin: "23172026",
        staffPin: "0000",
        staffModeOn: false,
        monthlyOEItems: [{ id: "f1", label: "Owners Draw", amount: 950 }],
        openDaysPerMonth: 26,
        cashReserve: 0,
        promoTags: [],
        cashBalanceEnabled: true,
        cashBalanceStartingAmount: 1375,
        cashBalanceStartDate: "2026-08-28",
        seededStarterInventory: true,
        loggedByNames: ["Eunice", "harold"],
        lastBackupDate: "2026-09-03T05:44:36.745Z",
      },
      assets: [],
      receivables: [],
    },
  };
}

/* ---------------- telling the two formats apart ---------------- */

test("a phone-app file is recognised as legacy", () => {
  assert.equal(detectBackupKind(legacyFile()), "legacy");
});

test("this system's own backup is recognised as native", () => {
  const native = {
    app: "PepperPan",
    data: { ingredients: [], cash_ledger: [], consumption_log: [], meals: [{ id: "m" }] },
  };
  assert.equal(detectBackupKind(native), "native");
});

test("a file with neither set of tables is unknown, not guessed at", () => {
  assert.equal(detectBackupKind({ app: "PepperPan", data: { widgets: [] } }), "unknown");
  assert.equal(detectBackupKind({ app: "PepperPan", data: {} }), "unknown");
});

/* ---------------- the defaults that would have been wrong ---------------- */

test("imported orders are completed, never left to default to pending", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const orders = backup.data.orders as Record<string, unknown>[];
  assert.equal(orders.length, 1);
  assert.equal(orders[0].status, "completed");
  assert.equal(orders[0].fulfillment, "pickup");
});

test("imported dishes are hidden from the customer menu", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const meals = backup.data.meals as Record<string, unknown>[];
  assert.equal(meals[0].is_public, false);
  assert.equal(meals[0].is_available, true);
});

/* ---------------- names and shapes ---------------- */

test("nested lots become their own rows, each naming its ingredient", () => {
  const { backup, report } = convertLegacyBackup(legacyFile());
  const lots = backup.data.ingredient_lots as Record<string, unknown>[];
  assert.equal(lots.length, 2, "the lot with no id is not importable");
  assert.equal(lots[0].ingredient_id, "inv1");
  assert.equal(lots[1].expiry_date, "2027-01-01");
  assert.ok(report.skipped.some((s) => s.includes("stock lot")));
});

test("a recipe line pointing nowhere is dropped, not carried as a bad row", () => {
  const { backup, report } = convertLegacyBackup(legacyFile());
  const lines = backup.data.meal_ingredients as Record<string, unknown>[];
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((l) => l.ref_type),
    ["batch", "inv"]
  );
  assert.ok(report.skipped.some((s) => s.includes("recipe line")));
});

test("categories are trimmed and de-duplicated case-insensitively", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const ing = backup.data.ingredients as Record<string, unknown>[];
  assert.deepEqual(ing[0].categories, ["Dry"]);
});

test("waste may point at a finished dish, which 0030 allows", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const waste = backup.data.waste_log as Record<string, unknown>[];
  assert.equal(waste[0].source_type, "meal");
  assert.equal(waste[0].ingredient_id, "inv1");
  assert.equal(waste[0].logged_by, "harold");
});

test("a cash movement keeps what caused it", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const cash = backup.data.cash_ledger as Record<string, unknown>[];
  assert.equal(cash[0].source, "restock");
  assert.equal(cash[0].ref_id, "p1", "a restock points at its purchase");
  assert.equal(cash[1].ref_id, "o1", "a sale points at its order");
});

test("the monthly bills come out of settings and become rows", () => {
  const { backup } = convertLegacyBackup(legacyFile());
  const bills = backup.data.fixed_costs as Record<string, unknown>[];
  assert.equal(bills.length, 1);
  assert.equal(bills[0].label, "Owners Draw");
  assert.equal(bills[0].amount, 950);
  assert.equal(bills[0].active, true);
});

test("the PIN is dropped, and the report says so rather than staying quiet", () => {
  const { backup, report } = convertLegacyBackup(legacyFile());
  const settings = backup.data.settings as Record<string, unknown>[];
  assert.equal(settings[0].pin, undefined);
  assert.equal(settings[0].cash_balance_starting_amount, 1375);
  assert.ok(report.dropped.some((d) => d.includes("PIN")));
});

test("a table this version has no rule for is reported, not silently lost", () => {
  const file = legacyFile();
  (file.data as Record<string, unknown>).loyaltyCards = [{ id: "z1" }, { id: "z2" }];
  const { report } = convertLegacyBackup(file);
  assert.ok(report.dropped.some((d) => d.includes("loyaltyCards") && d.includes("2 rows")));
});

/* ---------------- dates stay Manila days ---------------- */

test("a date is sliced, never parsed through a timezone", () => {
  const file = legacyFile();
  // An evening entry. Parsed as a Date this is 2026-08-31 in UTC and would be
  // filed a day early; sliced, it stays the day it was written.
  file.data.cashLedger[0].date = "2026-09-01T23:30:00.000Z";
  const { backup } = convertLegacyBackup(file);
  const cash = backup.data.cash_ledger as Record<string, unknown>[];
  assert.equal(cash[0].date, "2026-09-01");
});

test("a date that is not one becomes null rather than an invalid row", () => {
  const file = legacyFile();
  file.data.orders[0].date = "not a date";
  const { backup } = convertLegacyBackup(file);
  assert.equal((backup.data.orders as Record<string, unknown>[])[0].date, null);
});

/* ---------------- the promise that importing twice is safe ---------------- */

test("converting twice produces exactly the same thing", () => {
  const a = convertLegacyBackup(legacyFile());
  const b = convertLegacyBackup(legacyFile());
  assert.deepEqual(a.backup, b.backup);
  assert.deepEqual(a.report, b.report);
});

test("child rows with no id ask for their parent's rows to be cleared first", () => {
  const { backup } = convertLegacyBackup(legacyFile());

  // This is what stops a second import doubling every recipe.
  const recipes = parentsToClear("meal_ingredients", backup.data.meal_ingredients);
  assert.deepEqual(recipes, { column: "meal_id", ids: ["m1"] });

  const batchLines = parentsToClear("batch_ingredients", backup.data.batch_ingredients);
  assert.deepEqual(batchLines, { column: "batch_id", ids: ["b1"] });

  const lines = parentsToClear("order_lines", backup.data.order_lines);
  assert.deepEqual(lines, { column: "order_id", ids: ["o1"] });
});

test("child rows that carry their own id are upserted, never cleared", () => {
  // This is the shape of one of THIS system's backups: bigserial ids present.
  const rows = [{ id: 41, meal_id: "m1", ref_type: "inv", ref_id: "i1", qty: 1 }];
  assert.equal(parentsToClear("meal_ingredients", rows), null);
});

test("a parent table is never cleared, whatever its rows look like", () => {
  assert.equal(parentsToClear("meals", [{ name: "no id here" }]), null);
  assert.equal(parentsToClear("ingredients", [{ name: "nor here" }]), null);
});

/* ---------------- refusing to crash on a hand-held file ---------------- */

test("a file missing whole sections converts to empty rather than throwing", () => {
  const { backup, report } = convertLegacyBackup({ app: "PepperPan", data: {} });
  assert.deepEqual(backup.data.ingredients, []);
  assert.deepEqual(backup.data.meals, []);
  assert.deepEqual(report.counts, {});
});

test("rubbish where an array should be is treated as no rows", () => {
  const { backup } = convertLegacyBackup({
    app: "PepperPan",
    data: { inventory: "not an array", meals: [null, 7, { id: "m1", name: "Real" }] },
  });
  assert.deepEqual(backup.data.ingredients, []);
  assert.equal((backup.data.meals as unknown[]).length, 1);
});

test("a quantity that is not a number becomes zero, not a rejected row", () => {
  const file = legacyFile();
  file.data.inventory[0].stock = "lots" as unknown as number;
  const { backup } = convertLegacyBackup(file);
  assert.equal((backup.data.ingredients as Record<string, unknown>[])[0].stock, 0);
});
