import test from "node:test";
import assert from "node:assert/strict";
import {
  RESTORE_ORDER,
  readBackup,
  unknownTables,
} from "../src/lib/restore-order.ts";

/**
 * What happens on the worst day.
 *
 * A restore runs when the data is already gone, so the failures that matter
 * are the quiet ones: a wrong file written row by row into live tables, or a
 * table coming back before the one it points at.
 */

const backup = (extra: object = {}) =>
  JSON.stringify({
    app: "PepperPan",
    version: 1,
    exportedAt: "2026-09-04T02:00:00.000Z",
    data: { meals: [{ id: "m1" }] },
    ...extra,
  });

test("a file from somewhere else is refused before anything is written", () => {
  const r = readBackup(JSON.stringify({ app: "SomeOtherApp", data: {} }));
  assert.ok("error" in r);
  assert.match(r.error, /SomeOtherApp/);
});

test("a file that is not JSON is refused", () => {
  const r = readBackup("this is not json {{{");
  assert.ok("error" in r);
});

test("a JSON file that is not a backup at all is refused", () => {
  for (const junk of ["null", "[]", '"hello"', "{}"]) {
    assert.ok("error" in readBackup(junk), `accepted ${junk}`);
  }
});

test("our own backup is accepted and keeps its date", () => {
  const r = readBackup(backup());
  assert.ok(!("error" in r));
  assert.equal(r.exportedAt, "2026-09-04T02:00:00.000Z");
});

test("parents come back before their children", () => {
  // Not a spot check — the foreign keys that actually exist, in one place.
  // Getting one of these backwards fails a restore halfway through, leaving
  // a database that is neither the old one nor the new one.
  // Read out of the migrations rather than remembered. An earlier version of
  // this test asserted orders -> order_packaging, which sounds obviously true
  // and is not: that table's `ref_id` is a polymorphic text column pointing at
  // inventory and batches, and the name is what misleads. A list of real
  // constraints is the only kind worth asserting.
  const pairs: [string, string][] = [
    ["batches", "batch_ingredients"],
    ["chat_threads", "chat_messages"],
    ["ingredients", "batch_ingredients"],
    ["ingredients", "consumption_log"],
    ["ingredients", "ingredient_lots"],
    ["ingredients", "purchase_log"],
    ["ingredients", "waste_log"],
    ["meals", "meal_components"],
    ["meals", "meal_ingredients"],
    ["meals", "meal_packaging"],
    ["meals", "order_lines"],
    ["meals", "reviews"],
    ["orders", "order_lines"],
    ["orders", "reviews"],
  ];
  const at = (t: string) => RESTORE_ORDER.indexOf(t as never);
  for (const [parent, child] of pairs) {
    assert.notEqual(at(parent), -1, `${parent} missing from RESTORE_ORDER`);
    assert.notEqual(at(child), -1, `${child} missing from RESTORE_ORDER`);
    assert.ok(
      at(parent) < at(child),
      `${child} would be restored before ${parent}`
    );
  }
});

test("no table is listed twice", () => {
  assert.equal(new Set(RESTORE_ORDER).size, RESTORE_ORDER.length);
});

test("a table this build doesn't know is reported, not silently dropped", () => {
  const r = readBackup(backup({ data: { meals: [], something_new: [] } }));
  assert.ok(!("error" in r));
  assert.deepEqual(unknownTables(r), ["something_new"]);
});
