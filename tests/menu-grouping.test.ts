import test from "node:test";
import assert from "node:assert/strict";
import { suggestGrouping } from "../src/lib/menu-grouping.ts";

/**
 * Reading the grouping back out of the names the shop already uses.
 *
 * The fixtures are the shop's real menu, because the shapes that matter are
 * the ones it actually has: the size in front, the variant in brackets at the
 * back, and the four-way ji pai that shares a prefix which is not the name of
 * anything.
 *
 * What is being tested as hard as the successes is the REFUSALS. A wrong
 * suggestion is worse than no suggestion, because a filled-in form looks like
 * it was considered and gets saved without being read.
 */

test("the size in front", () => {
  assert.deepEqual(
    suggestGrouping(["16oz Iced Spanish Latte", "22oz Iced Spanish Latte"]),
    { productName: "Iced Spanish Latte", axis: "Size", values: ["16oz", "22oz"] }
  );
});

test("the variant in brackets at the back", () => {
  // The brackets are doing the job the option chip is about to do.
  assert.deepEqual(
    suggestGrouping(["Giant Jipai (Original)", "Giant Jipai (SPICY)"]),
    { productName: "Giant Jipai", axis: "Flavour", values: ["Original", "SPICY"] }
  );
});

test("a shared run at both ends", () => {
  assert.deepEqual(
    suggestGrouping(["16oz Brown Sugar Milktea", "22oz Brown Sugar Milktea"]),
    { productName: "Brown Sugar Milktea", axis: "Size", values: ["16oz", "22oz"] }
  );
});

test("four ways, as one choice of four", () => {
  // Not as tidy as two axes crossed, and deliberately not guessed at: the
  // owner splits Flavour from Cheese in two taps if they want to, and a
  // four-value chip row works perfectly well until they do.
  const s = suggestGrouping([
    "Giant Jipai (Original)",
    "Giant Jipai (SPICY)",
    "Giant Jipai w/cheese (Original)",
    "Giant Jipai w/cheese (SPICY)",
  ]);
  assert.equal(s?.productName, "Giant Jipai");
  assert.deepEqual(s?.values, ["Original", "SPICY", "w/cheese (Original)", "w/cheese (SPICY)"]);

  // The brackets survive when they are not wrapping the whole value. Trimming
  // by ends instead produced "w/cheese (Original" — an unclosed bracket on a
  // chip, which reads as a bug rather than as a name.
  assert.ok(s!.values.every((v) => (v.match(/\(/g) ?? []).length === (v.match(/\)/g) ?? []).length));
});

test("the choice is named from the values, or left bland", () => {
  assert.equal(suggestGrouping(["Small Fries", "Large Fries"])?.axis, "Size");
  assert.equal(suggestGrouping(["500ml Tea", "750ml Tea"])?.axis, "Size");
  assert.equal(suggestGrouping(["Ji Pai Mild", "Ji Pai Spicy"])?.axis, "Flavour");
  // A wrong specific word reads as the software being confused; a vague right
  // one reads as a box waiting to be filled in.
  assert.equal(suggestGrouping(["Bowl Tuesday", "Bowl Friday"])?.axis, "Option");
});

test("words, not characters — a common run stops at a space", () => {
  // Character-wise these share "Ji Pai " plus a "w"; word-wise they share
  // "Ji Pai", which is the only one of the two that is a name.
  const s = suggestGrouping(["Ji Pai wings", "Ji Pai wrap"]);
  assert.equal(s?.productName, "Ji Pai");
  assert.deepEqual(s?.values, ["wings", "wrap"]);
});

test("case is ignored when matching but kept when shown", () => {
  const s = suggestGrouping(["GIANT Jipai (Original)", "Giant Jipai (SPICY)"]);
  assert.equal(s?.productName, "GIANT Jipai");
});

/* ---- the refusals ---------------------------------------------- */

test("dishes with nothing in common are not variants of anything", () => {
  assert.equal(suggestGrouping(["Black Pepper Noodles", "Brown Sugar Milktea"]), null);
});

test("a dish whose whole name is the shared part gets no suggestion", () => {
  // "Ji Pai" and "Ji Pai Spicy" would leave the first with no value at all,
  // and a chip with nothing written on it.
  assert.equal(suggestGrouping(["Ji Pai", "Ji Pai Spicy"]), null);
});

test("two dishes that differ by nothing are duplicates, not variants", () => {
  // The chips would be two identical buttons, and whichever was tapped the
  // customer would get the first one.
  assert.equal(suggestGrouping(["Ji Pai (Spicy)", "Ji Pai [SPICY]"]), null);
});

test("one dish is not a group", () => {
  assert.equal(suggestGrouping(["Ji Pai"]), null);
  assert.equal(suggestGrouping([]), null);
});

test("a blank name never produces a suggestion", () => {
  assert.equal(suggestGrouping(["", "Ji Pai Spicy"]), null);
  assert.equal(suggestGrouping(["   ", "  "]), null);
});
