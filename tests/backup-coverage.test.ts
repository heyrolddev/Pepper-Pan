import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { RESTORE_ORDER } from "../src/lib/restore-order.ts";

/**
 * The list that keeps falling behind the database.
 *
 * Three times now a migration has added a table and nothing has added it to
 * the backup: `menu_products` shipped un-backed-up, then the whole modifier
 * set, then `suppliers`, `supplier_debts`, `running_costs` and
 * `marketing_campaigns`. Every time, the backup carried on producing a file
 * that looked exactly like a complete one. That is the failure this project
 * keeps having to design against — software that knows something and does not
 * say it — and a comment asking the next person to remember has now been
 * proved not to work.
 *
 * So the check is mechanical: read the migrations, read the two lists, and
 * fail on anything in neither. `backup.ts` is read as text rather than
 * imported because it is a `server-only` module and Node's test runner is not
 * a server.
 */

const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

/** Every table the migrations create, in the order they first appear. */
const created = [
  ...new Set(
    [...migrations.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)].map(
      (m) => m[1]
    )
  ),
];

const backupSource = readFileSync("src/lib/backup.ts", "utf8");

/** The string entries of a `const NAME = [ … ] as const;` block. */
function listIn(source: string, name: string): string[] {
  const at = source.indexOf(`const ${name} = [`);
  assert.notEqual(at, -1, `${name} is not declared the way this test reads it`);
  const body = source.slice(at, source.indexOf("] as const;", at));
  return [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

const backedUp = listIn(backupSource, "TABLES");
const excluded = [
  ...backupSource
    .slice(backupSource.indexOf("export const NOT_BACKED_UP"))
    .slice(0, backupSource.slice(backupSource.indexOf("export const NOT_BACKED_UP")).indexOf("};"))
    .matchAll(/^\s{2}([a-z_]+):/gm),
].map((m) => m[1]);

test("the migrations really do create the tables this test is checking", () => {
  // If the regex above ever stops matching, every other assertion here passes
  // vacuously — which is the one way a test like this fails silently.
  assert.ok(created.length > 40, `only found ${created.length} tables`);
  assert.ok(created.includes("orders"));
  assert.ok(created.includes("order_line_extras"));
});

test("every table is either backed up or deliberately not", () => {
  const known = new Set([...backedUp, ...excluded]);
  const missing = created.filter((t) => !known.has(t));
  assert.deepEqual(
    missing,
    [],
    `${missing.join(", ")} — add to TABLES in backup.ts, or to NOT_BACKED_UP with a reason`
  );
});

test("nothing is both backed up and excluded", () => {
  const both = backedUp.filter((t) => excluded.includes(t));
  assert.deepEqual(both, [], `${both.join(", ")} is in two lists that contradict each other`);
});

test("every list names a table that exists", () => {
  const real = new Set(created);
  const ghosts = [...backedUp, ...excluded, ...RESTORE_ORDER].filter((t) => !real.has(t));
  assert.deepEqual(ghosts, [], `${ghosts.join(", ")} is in a list but no migration creates it`);
});

test("everything backed up can be restored", () => {
  // A table in the file that the restore does not know how to put back is a
  // backup the owner cannot fully use — `unknownTables` would flag it at them
  // rather than at us.
  const order = new Set<string>(RESTORE_ORDER);
  const unrestorable = backedUp.filter((t) => !order.has(t));
  assert.deepEqual(
    unrestorable,
    [],
    `${unrestorable.join(", ")} is backed up but missing from RESTORE_ORDER`
  );
});
