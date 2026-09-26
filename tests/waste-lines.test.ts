import test from "node:test";
import assert from "node:assert/strict";

import {
  doubledUp,
  overStock,
  partialReport,
  readyLines,
  wasteTotal,
  type Wastable,
  type WasteDraft,
} from "../src/lib/waste-lines.ts";

const PORK: Wastable = { kind: "inv", id: "p", name: "Pork belly", unit: "g", stock: 2000, unitCost: 0.45 };
const SPROUTS: Wastable = { kind: "inv", id: "s", name: "Beansprouts", unit: "g", stock: 500, unitCost: 0.12 };
const DUMPLINGS: Wastable = { kind: "batch", id: "d", name: "Dumpling filling", unit: "pc", stock: 40, unitCost: 6 };

const CATALOGUE = new Map<string, Wastable>([
  ["inv:p", PORK],
  ["inv:s", SPROUTS],
  ["batch:d", DUMPLINGS],
]);

function draft(key: string, pick: string, qty: string): WasteDraft {
  return { key, pick, qty };
}

test("a full row is ready, priced from the item", () => {
  const { ready, problems } = readyLines([draft("1", "inv:p", "500")], CATALOGUE);
  assert.deepEqual(problems, []);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].name, "Pork belly");
  assert.equal(ready[0].unit, "g");
  assert.equal(ready[0].qty, 500);
  assert.ok(Math.abs(ready[0].cost - 225) < 1e-9);
});

test("several rows come back in the order they were typed", () => {
  const { ready } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "batch:d", "12"), draft("3", "inv:s", "200")],
    CATALOGUE
  );
  assert.deepEqual(ready.map((r) => r.name), ["Pork belly", "Dumpling filling", "Beansprouts"]);
});

test("a wholly blank row is neither ready nor a complaint", () => {
  // A form that opens with empty rows must not open shouting at them.
  const { ready, problems } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "", ""), draft("3", "", "")],
    CATALOGUE
  );
  assert.equal(ready.length, 1);
  assert.deepEqual(problems, []);
});

test("a row with a quantity and nothing picked is a complaint, not a silent skip", () => {
  // The dangerous half of the blank rule: typing 500 and forgetting to pick
  // is exactly what a "skip anything incomplete" rule would throw away.
  const { ready, problems } = readyLines([draft("1", "", "500")], CATALOGUE);
  assert.equal(ready.length, 0);
  assert.deepEqual(problems, [{ key: "1", what: "Pick what it was." }]);
});

test("a picked row with no quantity names what it is asking about", () => {
  const { problems } = readyLines([draft("1", "inv:p", "")], CATALOGUE);
  assert.equal(problems.length, 1);
  assert.match(problems[0].what, /Pork belly/);
});

test("zero and nonsense quantities are refused", () => {
  const { ready, problems } = readyLines(
    [draft("1", "inv:p", "0"), draft("2", "inv:s", "-5"), draft("3", "batch:d", "abc")],
    CATALOGUE
  );
  assert.equal(ready.length, 0);
  assert.equal(problems.length, 3);
});

test("an item that has since been deleted is a complaint on its own row", () => {
  const { ready, problems } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "inv:gone", "100")],
    CATALOGUE
  );
  assert.equal(ready.length, 1);
  assert.deepEqual(problems.map((p) => p.key), ["2"]);
});

test("the total is what the whole submission cost", () => {
  const { ready } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "batch:d", "10")],
    CATALOGUE
  );
  assert.ok(Math.abs(wasteTotal(ready) - (225 + 60)) < 1e-9);
  assert.equal(wasteTotal([]), 0);
});

test("a line that removes more than the shelf has is flagged, not blocked", () => {
  const { ready } = readyLines(
    [draft("1", "inv:s", "900"), draft("2", "inv:p", "100")],
    CATALOGUE
  );
  // Both are still ready — the count was probably already off, and refusing
  // is how the real figure never gets recorded at all.
  assert.equal(ready.length, 2);
  assert.deepEqual(overStock(ready).map((l) => l.name), ["Beansprouts"]);
});

test("exactly the stock on hand is not over", () => {
  const { ready } = readyLines([draft("1", "inv:s", "500")], CATALOGUE);
  assert.deepEqual(overStock(ready), []);
});

test("the same item on two lines is named once", () => {
  const { ready } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "inv:p", "300"), draft("3", "inv:s", "10")],
    CATALOGUE
  );
  assert.deepEqual(doubledUp(ready), ["Pork belly"]);
});

test("an ingredient and a batch that share an id are not the same thing", () => {
  // `inv:x` and `batch:x` are different rows in different tables. Keying on
  // the id alone would report a false double and, worse, suggest the owner
  // remove a line that is correct.
  const both = new Map<string, Wastable>([
    ["inv:x", { kind: "inv", id: "x", name: "Chili oil", unit: "ml", stock: 100, unitCost: 1 }],
    ["batch:x", { kind: "batch", id: "x", name: "Chili oil batch", unit: "ml", stock: 100, unitCost: 2 }],
  ]);
  const { ready } = readyLines([draft("1", "inv:x", "10"), draft("2", "batch:x", "10")], both);
  assert.deepEqual(doubledUp(ready), []);
});

test("nothing doubled up says nothing", () => {
  const { ready } = readyLines(
    [draft("1", "inv:p", "500"), draft("2", "inv:s", "10")],
    CATALOGUE
  );
  assert.deepEqual(doubledUp(ready), []);
});

/* ---- what to say when half of it worked ---- */

test("a run where everything worked says nothing at all", () => {
  assert.equal(partialReport(["Pork belly", "Beansprouts"], []), null);
});

test("a partial run says how many are already in, so nothing is logged twice", () => {
  const msg = partialReport(["Pork belly", "Beansprouts"], [{ name: "Dumpling filling", why: "no longer exists" }])!;
  assert.match(msg, /2 of 3 logged/);
  assert.match(msg, /Dumpling filling/);
  assert.match(msg, /already in/);
});

test("a run where nothing worked does not claim anything is in", () => {
  const msg = partialReport([], [{ name: "Pork belly", why: "not on shift" }])!;
  assert.doesNotMatch(msg, /already in/);
  assert.match(msg, /Pork belly/);
  assert.match(msg, /not on shift/);
});

test("every failed line is named, not just the first", () => {
  const msg = partialReport(
    ["Pork belly"],
    [{ name: "Beansprouts", why: "gone" }, { name: "Dumpling filling", why: "gone" }]
  )!;
  assert.match(msg, /Beansprouts/);
  assert.match(msg, /Dumpling filling/);
});
