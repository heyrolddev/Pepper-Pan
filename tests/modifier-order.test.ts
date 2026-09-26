import test from "node:test";
import assert from "node:assert/strict";

import { inGroupOrder, renumberAfterMove } from "../src/lib/modifiers.ts";

/**
 * The order a dish asks its questions in.
 *
 * The owner's complaint, in their words: on a rice combo the customer is
 * asked "Choose your drinks" before "Extra rice" — the drink before the thing
 * they came for. Nothing was wrong with the data. `sort_order` existed,
 * `groupsFor` already sorted by it, and every group was sitting on the column
 * default of 0 because no screen had ever offered a way to change it. With
 * every number equal, the tiebreak decides, and the tiebreak is the NAME:
 * "Choose" sorts before "Extra".
 *
 * So these cover the two things that make the arrows real — that the move
 * survives a table full of zeroes, and that the admin and the dish dialog are
 * ordering by one rule and not two.
 */

const g = (id: string, name: string, sort = 0) => ({ id, name, sort });

/** The shop's actual case. */
const REAL = [g("drinks", "Choose your drinks"), g("rice", "Extra rice")];

test("with no order set, the name decides — which is the bug", () => {
  assert.deepEqual(
    inGroupOrder(REAL).map((r) => r.id),
    ["drinks", "rice"],
    "this is what the customer was seeing"
  );
});

test("one move puts extra rice first, out of a table of zeroes", () => {
  /**
   * The swap-two-values version that the promos strip uses would do NOTHING
   * here: it looks for a row with a greater or lesser `sort_order`, and when
   * everything is 0 there is none. Two buttons that quietly do nothing.
   */
  const writes = renumberAfterMove(REAL, "rice", -1);
  assert.ok(writes.length > 0, "the move found nothing to do");

  const after = REAL.map((r) => ({
    ...r,
    sort: writes.find((w) => w.id === r.id)?.sort ?? r.sort,
  }));
  assert.deepEqual(
    inGroupOrder(after).map((r) => r.id),
    ["rice", "drinks"]
  );
});

test("moving down is the same move the other way", () => {
  const writes = renumberAfterMove(REAL, "drinks", 1);
  const after = REAL.map((r) => ({
    ...r,
    sort: writes.find((w) => w.id === r.id)?.sort ?? r.sort,
  }));
  assert.deepEqual(
    inGroupOrder(after).map((r) => r.id),
    ["rice", "drinks"]
  );
});

test("a group already at the top has nothing to do, and says so quietly", () => {
  // Not an error. The button was pressed and there was nowhere to go.
  assert.deepEqual(renumberAfterMove(REAL, "drinks", -1), []);
});

test("a group already at the bottom likewise", () => {
  assert.deepEqual(renumberAfterMove(REAL, "rice", 1), []);
});

test("a group that no longer exists changes nothing", () => {
  assert.deepEqual(renumberAfterMove(REAL, "ghost", -1), []);
});

test("only the rows that actually move are written", () => {
  // Four already numbered 10/20/30/40; swapping the middle two touches two.
  const rows = [
    g("a", "A", 10), g("b", "B", 20), g("c", "C", 30), g("d", "D", 40),
  ];
  const writes = renumberAfterMove(rows, "c", -1);
  assert.deepEqual(writes.map((w) => w.id).sort(), ["b", "c"]);
});

test("numbering leaves room between neighbours", () => {
  // Tens, so a group added later can land between two without shifting them.
  const writes = renumberAfterMove([g("a", "A"), g("b", "B"), g("c", "C")], "c", -1);
  const sorts = writes.map((w) => w.sort).sort((x, y) => x - y);
  for (let i = 1; i < sorts.length; i++) {
    assert.ok(sorts[i] - sorts[i - 1] >= 10, `${sorts.join(", ")} is too tight`);
  }
});

test("repeated moves walk a group the whole way and stop", () => {
  let rows = [g("a", "A"), g("b", "B"), g("c", "C"), g("d", "D")];
  for (let i = 0; i < 10; i++) {
    const writes = renumberAfterMove(rows, "d", -1);
    if (writes.length === 0) break;
    rows = rows.map((r) => ({
      ...r,
      sort: writes.find((w) => w.id === r.id)?.sort ?? r.sort,
    }));
  }
  assert.deepEqual(inGroupOrder(rows).map((r) => r.id), ["d", "a", "b", "c"]);
});

test("the order never loses or duplicates a group", () => {
  const rows = [g("a", "A"), g("b", "B"), g("c", "C")];
  const out = inGroupOrder(rows);
  assert.equal(out.length, rows.length);
  assert.equal(new Set(out.map((r) => r.id)).size, rows.length);
});

test("junk in the column does not scramble the order", () => {
  const rows = [
    { id: "a", name: "A", sort: NaN },
    { id: "b", name: "B", sort: 10 },
  ];
  // NaN reads as 0, so it leads — rather than comparing false against
  // everything and leaving the sort to the engine's whim.
  assert.deepEqual(inGroupOrder(rows).map((r) => r.id), ["a", "b"]);
});
