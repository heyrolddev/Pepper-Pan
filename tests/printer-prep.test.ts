import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { asPlainText, testSlip } from "../src/lib/receipt.ts";

/**
 * Getting the printer ready before service, and the two rules that hold it up.
 *
 * Neither the store nor the Bluetooth layer can be loaded here — both are
 * browser modules — so the parts that can be checked as values are, and the
 * two properties the whole design rests on are checked in the source. They
 * are the kind that stay true until somebody tidies something, and then
 * quietly do not.
 */

const slip = testSlip("XP-58", new Date("2026-09-24T07:15:00+08:00"));
const text = asPlainText(slip).join("\n");

test("the test slip says outright that it is not a receipt", () => {
  // A convincing test slip ends up in a customer's hand — or worse, in the
  // shift's paperwork being counted as a sale.
  assert.match(text, /PRINTER TEST/);
  assert.match(text, /not a receipt/i);
});

test("the test slip carries no money and no reference", () => {
  assert.doesNotMatch(text, /₱/);
  assert.doesNotMatch(text, /total/i);
  assert.doesNotMatch(text, /\bref\b/i);
});

test("the test slip names the printer it came out of", () => {
  // Two printers on one counter is not exotic, and "it printed" is only
  // useful if you know which one printed.
  assert.match(text, /XP-58/);
});

test("the test slip fits the narrow roll without wrapping", () => {
  for (const line of asPlainText(slip)) {
    assert.ok(line.length <= 32, `"${line}" is ${line.length} characters on a 32-wide roll`);
  }
});

/* ---- the two rules the morning depends on ---- */

const STORE = readFileSync("src/lib/printer-store.ts", "utf8");
const BT = readFileSync("src/lib/bluetooth-printer.ts", "utf8");

/** The body of one exported function, brace-matched. */
function body(source: string, signature: string): string {
  const at = source.indexOf(signature);
  assert.notEqual(at, -1, `no function matching: ${signature}`);
  let depth = 0;
  let started = false;
  for (let i = at; i < source.length; i++) {
    if (source[i] === "{") {
      depth++;
      started = true;
    } else if (source[i] === "}") {
      depth--;
      if (started && depth === 0) return source.slice(at, i + 1);
    }
  }
  throw new Error("unbalanced braces");
}

test("waking the printer never opens a chooser", () => {
  // `requestDevice` needs a real tap, by browser rule. If `reconnect` ever
  // reached for it, the silent wake-up on page load would either be refused
  // or — worse, where a gesture happens to be in flight — would throw a
  // device picker over the till on its own.
  const wake = body(STORE, "export async function reconnect(");
  assert.doesNotMatch(wake, /\bconnectPrinter\(/);
  assert.doesNotMatch(wake, /requestDevice/);
});

test("printing a finished sale never opens a chooser either", () => {
  // Same rule, the other end of the day: an automatic print that popped a
  // chooser would appear to hang, waiting for a tap nobody knows to give.
  const auto = body(STORE, "export async function printSale(");
  assert.doesNotMatch(auto, /\bconnectPrinter\(|requestDevice/);
});

test("reconnecting is given up on quietly rather than thrown", () => {
  // It runs unprompted when the till opens. A flag that is off, a cleared
  // permission or a printer still switched off are all ordinary, and none of
  // them is worth a red banner at seven in the morning.
  const fn = body(BT, "export async function reconnectPrinter(");
  assert.match(fn, /return null/);
  assert.match(fn, /catch/);
});

test("the ability to remember a printer is checked, not assumed", () => {
  // `getDevices()` is still behind a Chrome flag. Assuming it would make the
  // till promise a silent reconnect it cannot deliver.
  assert.match(BT, /typeof bluetooth\(\)\?\.getDevices === "function"/);
});
