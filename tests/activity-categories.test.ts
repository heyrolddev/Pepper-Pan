import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { ACTIVITY_CATEGORIES, CATEGORY_LABEL } from "../src/lib/activity.ts";

/**
 * The History filter, against what the shop actually files.
 *
 * `ACTIVITY_CATEGORIES` is the list the filter chips are built from. Nothing
 * checked it against the code that writes the log, and over a dozen features
 * the two drifted in both directions at once:
 *
 *   - `settings` was a chip. Nothing has ever been filed under it. Clicking it
 *     returned an empty screen, which looks exactly like a broken screen.
 *   - `shift`, `backup` and `waste` were being written from three different
 *     files and had no chip at all. Clocking in, taking a backup and throwing
 *     food away were all findable only by scrolling "All", badged with the raw
 *     lowercase word because `CATEGORY_LABEL` had no entry either.
 *
 * Same failure as the backup list, and the same fix: read the source, compare
 * the two sets, and fail on anything in one and not the other. A comment
 * asking the next person to remember has been tried and does not work.
 */

/* ---------------- what the code actually writes ---------------- */

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const sources = walk("src").map((f) => ({ file: f, text: readFileSync(f, "utf8") }));

/**
 * Two idioms write to this table, and both are caught here.
 *
 * The first is a literal insert — `.from("activity_log").insert({ category:
 * "menu", ... })`. The second is a per-file `log()` helper that takes the
 * category as its first argument; Inventory has one, and it is the only reason
 * `waste` and `movement` exist at all. A helper is only read as a log helper
 * when its file mentions `activity_log`, so an unrelated `log("debug")`
 * somewhere else is not mistaken for one.
 */
function categoriesWritten(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const note = (cat: string, file: string) => {
    const at = found.get(cat) ?? [];
    if (!at.includes(file)) at.push(file);
    found.set(cat, at);
  };

  for (const { file, text } of sources) {
    if (!text.includes("activity_log")) continue;

    for (const m of text.matchAll(
      /from\("activity_log"\)[\s\S]{0,300}?category:\s*"([a-z_]+)"/g
    )) {
      note(m[1], file);
    }
    for (const m of text.matchAll(/\blog\(\s*"([a-z_]+)"/g)) {
      note(m[1], file);
    }
  }
  return found;
}

const written = categoriesWritten();
const declared = new Set<string>(ACTIVITY_CATEGORIES);

/** The database writes to the log too, since 0053. */
const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

function writtenBySql(cat: string): boolean {
  for (const m of migrations.matchAll(/insert into activity_log[\s\S]{0,400}/g)) {
    if (m[0].includes(`'${cat}'`)) return true;
  }
  return false;
}

/* ---------------- the checks ---------------- */

test("every category the code writes has a filter chip", () => {
  const missing = [...written.entries()].filter(([cat]) => !declared.has(cat));
  assert.deepEqual(
    missing.map(([cat]) => cat),
    [],
    "written but not in ACTIVITY_CATEGORIES, so no chip and no label: " +
      missing.map(([cat, files]) => `${cat} (${files.join(", ")})`).join("; ")
  );
});

test("no filter chip returns an empty screen forever", () => {
  const dead = ACTIVITY_CATEGORIES.filter(
    (cat) => !written.has(cat) && !writtenBySql(cat)
  );
  assert.deepEqual(
    dead,
    [],
    `declared but never written by anything — these chips can only ever come ` +
      `back empty: ${dead.join(", ")}`
  );
});

test("every chip has words on it, not the raw column value", () => {
  for (const cat of ACTIVITY_CATEGORIES) {
    assert.ok(CATEGORY_LABEL[cat], `${cat} has no CATEGORY_LABEL entry`);
    assert.notEqual(
      CATEGORY_LABEL[cat],
      cat,
      `${cat}'s label is just the category name again`
    );
  }
});

test("every chip has a tone, so no badge falls back to grey", () => {
  const view = readFileSync("src/components/activity-log.tsx", "utf8");
  const block = view.match(/const TONE: Record<string, string> = \{([\s\S]*?)\};/);
  assert.ok(block, "TONE map not found in activity-log.tsx");
  const toned = new Set([...block[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]));

  for (const cat of ACTIVITY_CATEGORIES) {
    assert.ok(toned.has(cat), `${cat} has no TONE, so its badge renders grey`);
  }
  for (const cat of toned) {
    assert.ok(
      declared.has(cat),
      `${cat} has a TONE but is not a category — a colour for nothing`
    );
  }
});

test("a shelf going below zero is filed somewhere a person can find it", () => {
  // 0053 logs the crossing from inside the database, where no TypeScript
  // grep would ever see it. If the category it writes is renamed without the
  // list being updated, those rows land under a chip that does not exist.
  assert.ok(
    writtenBySql("movement"),
    "no migration files a shortfall under 'movement' any more"
  );
  assert.ok(declared.has("movement"), "'movement' has no chip in History");
});
