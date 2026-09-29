import test from "node:test";
import assert from "node:assert/strict";
import {
  cheapestFor,
  compareToCost,
  perUnitPrice,
  quoteLabel,
} from "../src/lib/supplier-quotes.ts";

/**
 * The market sells chicken by the kilo; `ingredients.cost` is per gram. So
 * every quote crosses a unit boundary before it means anything — and a wrong
 * factor here does not look wrong. It makes one supplier appear a THOUSAND
 * times cheaper than another, on the screen whose whole job is choosing
 * between them.
 */

const q = (price: number, qty: number, unit: string) => ({ price, qty, unit });

// ---------------------------------------------------------------------------
// The conversion
// ---------------------------------------------------------------------------

test("a kilo price becomes a price per gram", () => {
  // ₱230 a kilo IS ₱0.23 a gram. Off by a thousand and the chicken looks
  // free.
  const r = perUnitPrice(q(230, 1, "kg"), "g");
  assert.ok(r.ok);
  assert.ok(Math.abs(r.perUnit - 0.23) < 1e-9);
});

test("a litre price becomes a price per millilitre", () => {
  const r = perUnitPrice(q(95, 1, "L"), "ml");
  assert.ok(r.ok);
  assert.ok(Math.abs(r.perUnit - 0.095) < 1e-9);
});

test("the same unit needs no conversion at all", () => {
  const r = perUnitPrice(q(12, 1, "pc"), "pc");
  assert.ok(r.ok);
  assert.equal(r.perUnit, 12);
});

test("a price for several is divided by how many", () => {
  // "₱460 for 2 kg" is still ₱0.23 a gram.
  const r = perUnitPrice(q(460, 2, "kg"), "g");
  assert.ok(r.ok);
  assert.ok(Math.abs(r.perUnit - 0.23) < 1e-9);
});

test("spelling and case are not a different unit", () => {
  for (const unit of ["KG", " Kilo ", "kilos", "Kilogram"]) {
    const r = perUnitPrice(q(230, 1, unit), "g");
    assert.ok(r.ok, unit);
    assert.ok(Math.abs(r.perUnit - 0.23) < 1e-9, unit);
  }
});

// ---------------------------------------------------------------------------
// Refusing, which is the point
// ---------------------------------------------------------------------------

test("a unit nothing knows is refused, not guessed at", () => {
  // A sack is a real thing to be quoted in and this cannot answer it
  // without being told how big a sack is. Inventing a factor would be
  // worse than saying so.
  const r = perUnitPrice(q(1800, 1, "sack"), "g");
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /sack/.test(r.why), r.ok ? "" : r.why);
});

test("weight against volume is refused, however familiar both units are", () => {
  const r = perUnitPrice(q(95, 1, "L"), "g");
  assert.equal(r.ok, false);
  assert.ok(!r.ok && /different things/.test(r.why));
});

test("a nonsense price or quantity is refused", () => {
  assert.equal(perUnitPrice(q(NaN, 1, "kg"), "g").ok, false);
  assert.equal(perUnitPrice(q(230, 0, "kg"), "g").ok, false);
  assert.equal(perUnitPrice(q(230, -1, "kg"), "g").ok, false);
  assert.equal(perUnitPrice(q(-5, 1, "kg"), "g").ok, false);
});

test("a free sample is a real price and is not refused", () => {
  // Zero is a price. It is "we cannot work it out" that is not.
  const r = perUnitPrice(q(0, 1, "kg"), "g");
  assert.ok(r.ok);
  assert.equal(r.perUnit, 0);
});

// ---------------------------------------------------------------------------
// Against what the shop already pays
// ---------------------------------------------------------------------------

test("a cheaper quote is named as cheaper, with the gap", () => {
  const v = compareToCost(q(200, 1, "kg"), { unit: "g", cost: 0.25 });
  assert.notEqual(v.kind, "unknown");
  if (v.kind === "unknown") return;
  assert.equal(v.kind, "cheaper");
  assert.ok(Math.abs(v.change - (0.2 - 0.25) / 0.25) < 1e-9);
  assert.ok(Math.abs(v.perUnit - 0.2) < 1e-9);
});

test("a dearer quote is named as dearer", () => {
  const v = compareToCost(q(300, 1, "kg"), { unit: "g", cost: 0.25 });
  assert.equal(v.kind, "dearer");
});

test("within a twentieth is the same price", () => {
  // Two prices within five per cent are not a reason to change who
  // delivers at six in the morning.
  const v = compareToCost(q(255, 1, "kg"), { unit: "g", cost: 0.25 });
  assert.equal(v.kind, "same");
});

test("with no recorded cost there is no verdict, rather than a flattering one", () => {
  const v = compareToCost(q(230, 1, "kg"), { unit: "g", cost: null });
  assert.equal(v.kind, "unknown");
  const zero = compareToCost(q(230, 1, "kg"), { unit: "g", cost: 0 });
  assert.equal(zero.kind, "unknown");
});

test("a quote that cannot convert carries its reason into the verdict", () => {
  const v = compareToCost(q(1800, 1, "sack"), { unit: "g", cost: 0.25 });
  assert.equal(v.kind, "unknown");
  if (v.kind !== "unknown") return;
  assert.ok(v.why.length > 20);
});

// ---------------------------------------------------------------------------
// Who is cheapest
// ---------------------------------------------------------------------------

test("the quotes rank cheapest first", () => {
  const out = cheapestFor("g", [
    { ...q(245, 1, "kg"), supplierId: "nena", supplierName: "Aling Nena", quotedOn: "2026-09-01" },
    { ...q(230, 1, "kg"), supplierId: "kambal", supplierName: "Kambal", quotedOn: "2026-09-02" },
  ]);
  assert.deepEqual(out.map((r) => r.supplierName), ["Kambal", "Aling Nena"]);
  assert.ok(Math.abs(out[0].perUnit - 0.23) < 1e-9);
});

test("a quote in a unit that cannot convert is left out, not placed at a guess", () => {
  const out = cheapestFor("g", [
    { ...q(230, 1, "kg"), supplierId: "a", supplierName: "Kambal", quotedOn: "2026-09-02" },
    { ...q(1, 1, "sack"), supplierId: "b", supplierName: "Sack Man", quotedOn: "2026-09-02" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].supplierName, "Kambal");
});

test("nothing quoted ranks nothing", () => {
  assert.deepEqual(cheapestFor("g", []), []);
});

// ---------------------------------------------------------------------------
// Saying it
// ---------------------------------------------------------------------------

test("a price for one reads as 'per', a price for several reads as 'for'", () => {
  assert.equal(quoteLabel(q(230, 1, "kg")), "₱230.00 per kg");
  assert.equal(quoteLabel(q(460, 2, "kg")), "₱460.00 for 2 kg");
});
