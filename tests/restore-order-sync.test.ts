import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RESTORE_ORDER } from "../src/lib/restore-order.ts";

/**
 * The behaviour check that proves a restore will not hit a foreign key it
 * has not filled yet holds a COPY of the restore order, because SQL cannot
 * import TypeScript.
 *
 * Two copies of an ordering is exactly the drift `restore-order.ts` warns
 * about in its own opening comment — and the one that would be wrong is the
 * check, which would then pass while testing a list nobody uses. A green run
 * saying the order is safe, about an order that is not the one the restore
 * follows, is worse than no check at all.
 *
 * So: the same rule `tests/order-wire.test.ts` already uses for the order
 * wire. Read the SQL as text and make the two agree.
 */

test("the behaviour check tests the same restore order the app uses", () => {
  const sql = fs.readFileSync(
    path.join(import.meta.dirname, "..", "scripts", "migration-check", "01-behaviour.sql"),
    "utf8"
  );

  const start = sql.indexOf("insert into restore_pos(pos, tbl) values");
  assert.notEqual(start, -1, "the restore-order check is missing from 01-behaviour.sql");
  const block = sql.slice(start, sql.indexOf(";", start));

  const inSql = [...block.matchAll(/\(\s*(\d+)\s*,\s*'([a-z_]+)'\s*\)/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => m[2]);

  assert.deepEqual(
    inSql,
    [...RESTORE_ORDER],
    "01-behaviour.sql is checking a different restore order from the one the app follows — regenerate it"
  );
});

test("the restore order names each table exactly once", () => {
  // A table listed twice would be restored twice. For a parent table that is
  // a harmless upsert; for a child table cleared by `parentsToClear` it is a
  // clear-and-insert run against rows that were just inserted.
  const seen = new Set<string>();
  for (const t of RESTORE_ORDER) {
    assert.ok(!seen.has(t), `${t} appears twice in RESTORE_ORDER`);
    seen.add(t);
  }
});
