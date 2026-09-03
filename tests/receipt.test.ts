import test from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, asPlainText, renderReceipt, type Receipt } from "../src/lib/receipt.ts";
import { chunk, encodeReceipt } from "../src/lib/escpos.ts";

/**
 * What comes out of the printer.
 *
 * A receipt is the only part of this system a customer takes home, and the
 * only part nobody can edit after the fact. It is also the hardest thing to
 * eyeball, because it is fixed-width text going to a device most people
 * testing this do not have on the desk.
 */

const sale: Receipt = {
  ref: "A1B2",
  at: new Date("2026-09-03T04:30:00Z"), // 12:30 PM in Manila
  lines: [
    { name: "Black Pepper Noodles", qty: 2, price: 89 },
    { name: "Milktea", qty: 1, price: 55 },
  ],
  total: 233,
  dineIn: false,
  method: "cash",
  tendered: 500,
  change: 267,
  customer: "Marites",
  servedBy: "Rolds",
};

const textOf = (r: Receipt, width: "narrow" | "wide" = "narrow") =>
  asPlainText(renderReceipt(r, width), width).join("\n");

test("nothing is wider than the paper", () => {
  for (const width of ["narrow", "wide"] as const) {
    for (const row of renderReceipt(sale, width)) {
      assert.ok(
        row.text.length <= COLUMNS[width],
        `"${row.text}" is ${row.text.length} chars on ${width} paper`
      );
    }
  }
});

test("the customer's name is printed, so a bag can be handed over by name", () => {
  assert.match(textOf(sale), /For Marites/);
  assert.doesNotMatch(textOf({ ...sale, customer: null }), /^For /m);
});

test("a cash sale shows what was handed over and what went back", () => {
  const out = textOf(sale);
  assert.match(out, /Cash received.*500\.00/);
  assert.match(out, /Change.*267\.00/);
  assert.match(out, /Paid by.*CASH/);
});

test("a GCash sale shows the reference and never a change line", () => {
  const out = textOf({
    ...sale,
    method: "gcash",
    reference: "9988776655",
    tendered: null,
    change: null,
  });
  assert.match(out, /Paid by.*GCASH/);
  assert.match(out, /Reference.*9988776655/);
  assert.doesNotMatch(out, /Change/);
});

test("a multiple shows its unit price, a single does not", () => {
  assert.match(textOf(sale), /@ 89\.00 each/);
  const single: Receipt = { ...sale, lines: [{ name: "Milktea", qty: 1, price: 55 }] };
  assert.doesNotMatch(textOf(single), /each/);
});

test("the total is the printed total", () => {
  assert.match(textOf(sale), /TOTAL \(PHP\).*233\.00/);
});

test("dine-in and take-out are distinguishable on the paper", () => {
  assert.match(textOf(sale), /TAKE-OUT/);
  assert.match(textOf({ ...sale, dineIn: true }), /DINE-IN/);
});

test("it says it is not an official receipt", () => {
  // The customer should find that out from the paper, not from the BIR.
  assert.match(textOf(sale), /not an official receipt/i);
});

test("a long dish name wraps instead of losing its price", () => {
  const long: Receipt = {
    ...sale,
    lines: [{ name: "Extra Spicy Black Pepper Beef Noodles with Egg", qty: 1, price: 145 }],
  };
  const out = textOf(long);
  assert.match(out, /145\.00/);
  for (const row of renderReceipt(long)) {
    assert.ok(row.text.length <= COLUMNS.narrow);
  }
});

test("accents and peso signs become bytes a thermal printer can render", () => {
  // The printer renders one byte per character from a code page. Anything
  // outside it prints as garbage, so it has to be folded down before sending.
  const odd: Receipt = { ...sale, customer: "Niño", lines: [{ name: "Crème Brûlée", qty: 1, price: 90 }] };
  for (const row of renderReceipt(odd)) {
    assert.match(row.text, /^[\x20-\x7E]*$/, `non-ASCII survived: ${row.text}`);
  }
});

test("the encoded job starts with a printer reset", () => {
  const bytes = encodeReceipt(renderReceipt(sale));
  assert.equal(bytes[0], 0x1b); // ESC
  assert.equal(bytes[1], 0x40); // @  — ESC @ resets the printer
  assert.ok(bytes.length > 100);
});

test("chunking loses nothing and respects the size limit", () => {
  const bytes = encodeReceipt(renderReceipt(sale));
  const parts = chunk(bytes, 180);
  assert.ok(parts.length > 1, "a receipt should need more than one BLE write");
  for (const p of parts) assert.ok(p.length <= 180);
  assert.deepEqual(
    Array.from(new Uint8Array(parts.flatMap((p) => Array.from(p)))),
    Array.from(bytes)
  );
});
