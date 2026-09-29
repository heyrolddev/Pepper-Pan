import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AUTH_REFS,
  collectAuthIds,
  repairNote,
  repairRows,
} from "../src/lib/restore-repair.ts";
import { RESTORE_ORDER } from "../src/lib/restore-order.ts";

/**
 * The code that runs on the worst day this shop will ever have.
 *
 * A backup cannot carry `auth.users` — that is Supabase's table, full of
 * password hashes that are not ours to copy. So a restore into a FRESH
 * project arrives holding orders, reviews, chats and shifts pointing at
 * accounts that exist nowhere, Postgres refuses every one of them, and one
 * refused row used to take the whole table with it.
 */

const GONE = "99999999-9999-9999-9999-999999999999";
const HERE = "11111111-1111-1111-1111-111111111111";
const present = new Set([HERE]);

// ---------------------------------------------------------------------------
// The sale survives its customer
// ---------------------------------------------------------------------------

test("an order whose customer is gone is still an order", () => {
  // THE case. The money, the date, the ticket and the lines are all intact
  // and all matter; the link to a deleted login is the only thing lost.
  const r = repairRows(
    "orders",
    [{ id: "o1", customer_id: GONE, revenue: 500, ticket: 12 }],
    present
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].customer_id, null);
  assert.equal(r.rows[0].revenue, 500, "the money is untouched");
  assert.equal(r.rows[0].ticket, 12);
  assert.deepEqual(r.nulled, [{ column: "customer_id", count: 1 }]);
  assert.equal(r.heldBack, 0);
});

test("a walk-in order was never anybody's and passes straight through", () => {
  const r = repairRows("orders", [{ id: "o2", customer_id: null, revenue: 100 }], present);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.nulled, []);
});

test("a restore into the SAME project changes nothing at all", () => {
  // The common case, and it must stay free: every id is found, so no column
  // is touched and no row is held back.
  const r = repairRows("orders", [{ id: "o3", customer_id: HERE, revenue: 300 }], present);
  assert.equal(r.rows[0].customer_id, HERE);
  assert.deepEqual(r.nulled, []);
  assert.equal(r.heldBack, 0);
});

test("one bad row does not cost the good ones beside it", () => {
  // This is what the chunking used to do: PostgREST sends 500 rows as one
  // statement, so one refused row lost all 500 — and the loop then stopped,
  // losing every chunk after it too.
  const r = repairRows(
    "orders",
    [
      { id: "a", customer_id: null, revenue: 100 },
      { id: "b", customer_id: GONE, revenue: 200 },
      { id: "c", customer_id: HERE, revenue: 300 },
    ],
    present
  );
  assert.equal(r.rows.length, 3, "all three sales come back");
  assert.equal(r.rows[1].customer_id, null);
  assert.equal(r.rows[2].customer_id, HERE);
});

// ---------------------------------------------------------------------------
// The rows that genuinely cannot come back
// ---------------------------------------------------------------------------

test("a profile cannot exist without its login, and is held back", () => {
  const r = repairRows(
    "profiles",
    [
      { id: HERE, full_name: "The Owner" },
      { id: GONE, full_name: "Someone Deleted" },
    ],
    present
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.heldBack, 1);
  assert.equal(r.rows[0].full_name, "The Owner");
});

test("a shift with nobody in it is not payroll evidence", () => {
  const r = repairRows(
    "staff_shifts",
    [{ id: "s1", staff_id: GONE, closing_cash: 4000 }],
    present
  );
  assert.equal(r.rows.length, 0);
  assert.equal(r.heldBack, 1);
  // And it must say so — a silent gap in payroll found months later is the
  // failure this whole file exists to prevent.
  const note = repairNote("staff_shifts", r)!;
  assert.ok(/held back/i.test(note), note);
  assert.ok(/staff account/i.test(note), note);
  assert.ok(/import this file again/i.test(note), note);
});

test("a nullable column on a row that is otherwise held back still reports", () => {
  const r = repairRows(
    "profiles",
    [{ id: HERE, role_offered_by: GONE, full_name: "The Owner" }],
    present
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].role_offered_by, null);
  assert.deepEqual(r.nulled, [{ column: "role_offered_by", count: 1 }]);
});

// ---------------------------------------------------------------------------
// Collecting the ids to ask about
// ---------------------------------------------------------------------------

test("every auth id in the file is collected once", () => {
  const ids = collectAuthIds({
    orders: [{ customer_id: GONE }, { customer_id: GONE }, { customer_id: null }],
    reviews: [{ customer_id: HERE, relayed_by: GONE }],
    // Not an auth reference — must not be collected.
    meals: [{ id: "not-a-uuid" }],
  });
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(GONE.toLowerCase()));
  assert.ok(ids.includes(HERE.toLowerCase()));
});

test("junk in an id column is ignored rather than asked about", () => {
  const ids = collectAuthIds({ orders: [{ customer_id: "" }, { customer_id: "nope" }] });
  assert.deepEqual(ids, []);
});

test("a table the file does not carry contributes nothing", () => {
  assert.deepEqual(collectAuthIds({}), []);
  assert.deepEqual(collectAuthIds(undefined), []);
});

// ---------------------------------------------------------------------------
// The list itself, checked against the schema
// ---------------------------------------------------------------------------

test("every restorable table that references auth.users is in AUTH_REFS", () => {
  // The failure this guards is silent and arrives on restore day: a
  // migration adds a column pointing at auth.users, nothing here knows, and
  // that table loses every row belonging to a deleted account.
  const dir = path.join(import.meta.dirname, "..", "supabase", "migrations");
  const sql = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
    .join("\n");

  // `<column> uuid ... references auth.users`, however it is spelled.
  const found = new Map<string, Set<string>>();
  for (const m of sql.matchAll(
    /(?:create table if not exists|alter table)\s+(\w+)([\s\S]*?)(?=create table if not exists|alter table|\n-- =|$)/gi
  )) {
    const table = m[1];
    for (const c of m[2].matchAll(/(\w+)\s+uuid[^,;)]*references\s+auth\.users/gi)) {
      if (!found.has(table)) found.set(table, new Set());
      found.get(table)!.add(c[1]);
    }
  }

  const restorable = new Set<string>(RESTORE_ORDER);
  const missing: string[] = [];
  for (const [table, cols] of found) {
    if (!restorable.has(table)) continue; // not restored, not our problem
    const known = new Set((AUTH_REFS[table] ?? []).map((r) => r.column));
    for (const col of cols) if (!known.has(col)) missing.push(`${table}.${col}`);
  }

  assert.deepEqual(
    missing,
    [],
    `These columns point at auth.users and AUTH_REFS does not know them, so a restore into a fresh project would lose those rows: ${missing.join(", ")}`
  );
});

test("AUTH_REFS does not name a table the restore never writes", () => {
  const restorable = new Set<string>(RESTORE_ORDER);
  for (const table of Object.keys(AUTH_REFS)) {
    assert.ok(restorable.has(table), `${table} is repaired but never restored`);
  }
});

test("nothing to repair means nothing to say", () => {
  const r = repairRows("orders", [{ id: "o", customer_id: HERE }], present);
  assert.equal(repairNote("orders", r), null);
});
