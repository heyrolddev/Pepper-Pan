import test from "node:test";
import assert from "node:assert/strict";
import {
  COLUMNS,
  asPlainText,
  renderReceipt,
  type Receipt,
} from "../src/lib/receipt.ts";
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

test("a bank transfer prints as a transfer, not as cash", () => {
  // It used to print "Paid by CASH" — the gcash branch was the only special
  // case and everything else fell through to the cash one. The receipt is the
  // only record a customer keeps, and the only one nobody can edit after.
  const text = textOf({
    ...sale,
    method: "bank",
    tendered: null,
    change: null,
    reference: "BPI 88213",
  });
  assert.match(text, /Paid by\s+BANK/);
  assert.match(text, /Reference\s+BPI 88213/);
  assert.equal(/Cash received/.test(text), false);
  assert.equal(/Change/.test(text), false);
});

test("add-ons print under the dish, priced so the paper adds up", () => {
  // Folding ₱15 of extra rice into the dish's own price prints
  // "1 x Pork Solo Rice 135.00" against a menu board that says 120 — and the
  // person who has to explain that is behind a counter with a queue.
  const rows = asPlainText(
    renderReceipt({
      ref: "A1B2",
      at: new Date("2026-09-20T10:00:00Z"),
      lines: [
        {
          name: "Pork Solo Rice",
          qty: 2,
          price: 120,
          extras: [
            { label: "Extra rice", price: 15 },
            { label: "Coke", price: 0 },
          ],
        },
      ],
      total: 270,
      dineIn: false,
      method: "cash",
      tendered: 300,
      change: 30,
    })
  );

  const body = rows.join("\n");
  assert.match(body, /\+ Extra rice\s+30\.00/);
  // Free is printed as a price, not left blank — a gap in the money column
  // reads as a line that failed to print.
  assert.match(body, /\+ Coke\s+0\.00/);
  assert.match(body, /2 x Pork Solo Rice\s+240\.00/);
});

/* ------------------------------------------------------------------
 * The code, and what's in it
 *
 * One piece of paper serving two readers. The cook runs down the left edge
 * looking for the dish; the customer reads the right edge for the money and
 * the block at the bottom for what they just ate. Both have to fit on a roll
 * 32 characters wide, which is the constraint every decision here answers to.
 * ------------------------------------------------------------------ */

const KCAL = { kcal: 742, protein: 38, carbs: 61, fat: 37 };
const DRINK = { kcal: 339, protein: 3, carbs: 68, fat: 6 };

const withFacts: Receipt = {
  ...sale,
  showNutrition: true,
  lines: [
    {
      name: "Black Pepper Chicken Noodles",
      code: "C1",
      qty: 2,
      price: 179,
      nutrition: KCAL,
      extras: [{ label: "Extra Rice", price: 20 }],
    },
    { name: "Tiger Sugar Milktea", code: "M3", qty: 1, price: 99, nutrition: DRINK },
  ],
  total: 497,
};

test("the code is printed where a cook reads it — at the left, after the quantity", () => {
  const text = textOf(withFacts);
  // Not at the end of a name that wraps, and not on a line of its own: a
  // cook's eye goes down the left edge of a ticket.
  assert.match(text, /^2 x C1 Black Pepper/m);
  assert.match(text, /^1 x M3 Tiger Sugar Milktea/m);
});

test("a dish with no code prints exactly as it always did", () => {
  assert.match(textOf(sale), /^2 x Black Pepper Noodles/m);
  assert.doesNotMatch(textOf(sale), /undefined|null/);
});

test("each line carries its own figure, for the LINE not for one of it", () => {
  // The money above it is the line's total, and two numbers on one row of
  // paper that count differently is exactly the confusion a receipt exists
  // to prevent. Two noodles: 1,484 kcal, 76P 122C 74F.
  assert.match(textOf(withFacts), /1,484 kcal {2}76P 122C 74F/);
  assert.match(textOf(withFacts), /339 kcal {2}3P 68C 6F/);
});

test("the order's own total is under the money", () => {
  const text = textOf(withFacts);
  assert.match(text, /Total calories\s+1,823 kcal/);
  assert.match(text, /Protein\/Carbs\/Fat\s+79P 190C 80F/);
  // Under, not over: it belongs beside the money it is about.
  assert.ok(text.indexOf("TOTAL (PHP)") < text.indexOf("Total calories"));
});

test("a line with no figure makes the total a floor, and says so", () => {
  // A silent skip prints an authoritative number that is low by exactly the
  // dish nobody has costed — worse than printing nothing, for the one person
  // on the receipt who reads it.
  const partial: Receipt = {
    ...withFacts,
    lines: [
      { name: "Noodles", code: "C1", qty: 1, price: 179, nutrition: KCAL },
      { name: "Mystery Special", code: "X9", qty: 1, price: 99 },
    ],
  };
  const text = textOf(partial);
  assert.match(text, /Calories \(at least\)\s+742 kcal/);
  assert.match(text, /Some items are not counted/);
  assert.doesNotMatch(text, /Total calories/);
});

test("nothing at all prints when the owner's switch is off", () => {
  // A receipt is customer-facing too. A shop that keeps calories off the
  // menu must not find them on the paper.
  const off = textOf({ ...withFacts, showNutrition: false });
  assert.doesNotMatch(off, /kcal/);
  assert.doesNotMatch(off, /Protein/);
  // The codes are not part of that switch — they are for the kitchen.
  assert.match(off, /^2 x C1 /m);
});

test("off is the default, so a caller that forgot cannot leak it", () => {
  const { showNutrition: _drop, ...noFlag } = withFacts;
  void _drop;
  assert.doesNotMatch(textOf(noFlag as Receipt), /kcal/);
});

test("the switch on with nothing known prints no empty block", () => {
  const blank: Receipt = {
    ...sale,
    showNutrition: true,
    lines: [{ name: "Noodles", qty: 1, price: 89 }],
  };
  const text = textOf(blank);
  assert.doesNotMatch(text, /kcal/);
  assert.doesNotMatch(text, /at least/);
});

test("every line still fits the paper with codes and figures on it", () => {
  // The whole reason this is built to a column count. A 48-character line on
  // a 32-character roll does not wrap — it is cut, silently, on the one
  // piece of paper nobody can edit afterwards.
  for (const width of ["narrow", "wide"] as const) {
    for (const row of renderReceipt(withFacts, width)) {
      assert.ok(
        row.text.length <= COLUMNS[width],
        `"${row.text}" is ${row.text.length} chars on ${width} paper`
      );
    }
  }
});

test("a long name with a code still wraps rather than being cut", () => {
  const long: Receipt = {
    ...withFacts,
    lines: [
      {
        name: "Extra Large Black Pepper Chicken Noodles with Egg",
        code: "C12",
        qty: 1,
        price: 249,
        nutrition: KCAL,
      },
    ],
  };
  const text = textOf(long);
  assert.match(text, /1 x C12 Extra Large/);
  assert.match(text, /with Egg\s+249\.00/);
});

test("the figures survive the fold to printer ASCII", () => {
  // The peso sign is folded to P; the macro shorthand uses P too, and must
  // not be mangled by the same pass.
  const text = textOf(withFacts);
  assert.match(text, /76P 122C 74F/);
  assert.doesNotMatch(text, /[^\x00-\x7F]/);
});

test("zero quantities are not counted into the order total", () => {
  const zero: Receipt = {
    ...withFacts,
    lines: [
      { name: "Noodles", qty: 1, price: 179, nutrition: KCAL },
      { name: "Ghost", qty: 0, price: 0, nutrition: DRINK },
    ],
  };
  assert.match(textOf(zero), /Total calories\s+742 kcal/);
});
