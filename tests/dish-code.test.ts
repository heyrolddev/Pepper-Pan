import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanCode,
  codeProblem,
  codeTheMenu,
  letterFor,
  suggestCode,
} from "../src/lib/dish-code.ts";

test("a code is letters and numbers, upper case", () => {
  assert.equal(cleanCode(" c-1 "), "C1");
  assert.equal(cleanCode("giant #2"), "GIANT2");
  assert.equal(cleanCode(null), "");
});

test("a code cannot be longer than somebody will say out loud", () => {
  assert.equal(cleanCode("ABCDEFGHIJKL").length, 8);
});

test("the letter comes from the category", () => {
  assert.equal(letterFor("Chicken"), "C");
  assert.equal(letterFor("drinks"), "D");
});

test("a category starting with a digit still gets a letter", () => {
  // "8oz Drinks" has no usable first character. Taking it anyway would
  // produce codes like 81, 82 — numbers pretending to be codes.
  assert.equal(letterFor("8oz Drinks"), "O");
  assert.equal(letterFor("22oz"), "O");
});

test("no category at all still produces something sayable", () => {
  assert.equal(letterFor(null), "X");
  assert.equal(letterFor("###"), "X");
});

test("numbering restarts per letter, so a new drink never renumbers chicken", () => {
  assert.equal(suggestCode("Chicken", ["C1", "C2", "D1"]), "C3");
  assert.equal(suggestCode("Drinks", ["C1", "C2", "C3"]), "D1");
});

test("a freed code is reused rather than climbing forever", () => {
  // Delete C2 and the next chicken dish is C2 again. A year of edits should
  // not leave a printed menu running to C47.
  assert.equal(suggestCode("Chicken", ["C1", "C3"]), "C2");
});

test("case does not create a second code", () => {
  // The database index is on lower(code). Suggesting "c1" next to "C1" would
  // produce a save that fails with a constraint error nobody can act on.
  assert.equal(suggestCode("Chicken", ["c1"]), "C2");
});

test("numbering the menu leaves existing codes exactly alone", () => {
  const out = codeTheMenu([
    { id: "a", code: "C9", category: "Chicken" },
    { id: "b", code: null, category: "Chicken" },
    { id: "c", code: "", category: "Drinks" },
  ]);
  assert.equal(out.has("a"), false, "a dish that already had a code was renumbered");
  assert.equal(out.get("b"), "C1");
  assert.equal(out.get("c"), "D1");
});

test("numbering the menu never hands out the same code twice", () => {
  const out = codeTheMenu([
    { id: "a", code: null, category: "Chicken" },
    { id: "b", code: null, category: "Chicken" },
    { id: "c", code: null, category: "Coffee" },
  ]);
  const codes = [...out.values()];
  assert.equal(new Set(codes).size, codes.length, `duplicate in ${codes.join(", ")}`);
  // Chicken and Coffee both want C. The third dish takes the next free one.
  assert.deepEqual(codes, ["C1", "C2", "C3"]);
});

test("a typed code that belongs to another dish is refused by name", () => {
  assert.match(codeProblem("C1", ["C1"]) ?? "", /already another dish/);
  assert.equal(codeProblem("C2", ["C1"]), null);
  assert.equal(codeProblem("", ["C1"]), null, "blank is allowed — not every dish needs one");
});

test("a code typed in the other case is still the same code", () => {
  assert.match(codeProblem("c1", ["C1"]) ?? "", /already another dish/);
});

test("a code of only punctuation is refused rather than silently emptied", () => {
  assert.match(codeProblem("!!!", []) ?? "", /Letters and numbers/);
});
