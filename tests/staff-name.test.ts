import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { NAME_MAX, cleanName } from "../src/lib/staff-name.ts";

/**
 * The name that gets printed on a customer's receipt.
 *
 * Worth rules and worth tests, because the failure is not a red box on a
 * screen — it is paper in somebody's hand, and a shift report the shop is
 * paid against.
 */

const ok = (raw: string) => {
  const r = cleanName(raw);
  assert.equal(r.error, null, `"${raw}" should be allowed: ${r.error}`);
  return r.name!;
};
const refused = (raw: string) => {
  const r = cleanName(raw);
  assert.notEqual(r.error, null, `"${raw}" should have been refused`);
  return r.error!;
};

test("real Filipino names are not refused by a tidier's idea of a name", () => {
  // Every one of these is somebody. A validator insisting on "First Last"
  // rejects real people, and the person it rejects cannot work around it.
  for (const n of [
    "Rolando Dela Cruz",
    "Ma. Cristina Santos-Reyes",
    "Juan dela Cruz Jr.",
    "Niña Española",
    "O'Brien",
    "Lito",
    "José Rizal Mercado y Alonso",
  ]) {
    assert.equal(ok(n), n.replace(/\s+/g, " "));
  }
});

test("spare whitespace is tidied rather than refused", () => {
  // Names get pasted out of spreadsheets often enough to be worth handling
  // quietly instead of bouncing.
  assert.equal(ok("  Rolando   Dela  Cruz "), "Rolando Dela Cruz");
});

test("an empty box is refused, and says what to do", () => {
  assert.match(refused(""), /name you want on the till/i);
  assert.match(refused("   "), /name you want on the till/i);
  assert.match(refused("R"), /name you want on the till/i);
});

test("a name too long to print is refused before it reaches paper", () => {
  const long = "R".repeat(NAME_MAX + 1);
  assert.match(refused(long), /too long for a receipt/i);
  assert.equal(cleanName("R".repeat(NAME_MAX)).error, null, "exactly the limit is fine");
});

test("something with no letters in it is not a name", () => {
  for (const junk of ["12345", "!!!", "-- --", "..."]) {
    assert.match(refused(junk), /doesn't look like a name/i);
  }
});

test("a name with digits in it is still allowed", () => {
  // "Cashier 2" is a real thing a stall writes on a till, and refusing it
  // helps nobody.
  assert.equal(ok("Cashier 2"), "Cashier 2");
});

/* ---- what renaming must NOT do ---- */

test("renaming never rewrites what past sales were rung up under", () => {
  // `orders.logged_by` is text stamped at the sale, the same rule as
  // price_at_sale. If the action ever reached for `orders`, yesterday's shift
  // report would silently change to say somebody else took the money.
  const src = readFileSync("src/app/admin/me/actions.ts", "utf8");
  const at = src.indexOf("export async function saveMyName(");
  assert.notEqual(at, -1);
  let depth = 0;
  let body = "";
  for (let i = at; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        body = src.slice(at, i + 1);
        break;
      }
    }
  }
  assert.doesNotMatch(body, /from\("orders"\)/);
  assert.doesNotMatch(body, /from\("staff_shifts"\)/);
  assert.doesNotMatch(body, /from\("cash_ledger"\)/);
  // It touches exactly one table's data, plus the log of having done so.
  assert.match(body, /from\("profiles"\)\s*\.update/);
});

test("the change is written down with both names", () => {
  const src = readFileSync("src/app/admin/me/actions.ts", "utf8");
  assert.match(src, /is now shown as/);
  assert.match(src, /activity_log/);
});
