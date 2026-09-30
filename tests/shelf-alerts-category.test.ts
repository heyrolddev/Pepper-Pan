import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The orange banner that was counting the shop's own work against it.
 *
 * Inventory opened on "8 shelves stopped adding up today", in orange, above
 * eight rows that read
 *
 *     Made 2x "Marinated Pork (1kg)" - 24 serving, cost P428.24
 *     Counted "1D Bento": 14 -> 37 pc (+23.00)
 *
 * Two batches and six counts. Nothing was short. Nothing had gone below zero.
 *
 * `activity_log.category = 'movement'` had two authors — the database, which
 * writes it when a shelf crosses below zero, and the inventory screen, which
 * wrote it for every batch and every count. `listShelfAlerts()` filters by
 * category and can see nothing else, so it swept up both.
 *
 * And the banner's advice is "Recount it below". A recount wrote another
 * 'movement' row, so the count went UP for every person who followed it.
 *
 * The fix is a convention — the application must not write `movement` — and a
 * convention with nothing enforcing it is how this happened the first time.
 * The comment on ACTIVITY_CATEGORIES said out loud that the database wrote to
 * that category, and the alert was built on it anyway. So this reads the
 * source instead of asking anybody to remember.
 */

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

/** Which category the alert reads. Taken from the file, not restated here. */
const ALERT_CATEGORY = (() => {
  const src = readFileSync("src/lib/shelf-alerts.ts", "utf8");
  const m = src.match(/\.eq\("category",\s*"([a-z_]+)"\)/);
  assert.ok(m, "shelf-alerts.ts no longer filters on a literal category");
  return m![1];
})();

test("the alert's category is the database's alone", () => {
  // Both idioms the activity-category check knows about: a literal insert, and
  // the per-file `log()` helper the inventory screen uses.
  const offenders: string[] = [];
  for (const { file, text } of sources) {
    if (file.endsWith("shelf-alerts.ts")) continue; // the reader, not a writer
    if (!text.includes("activity_log") && !/\blog\(\s*"/.test(text)) continue;

    const writes =
      new RegExp(`from\\("activity_log"\\)[\\s\\S]{0,300}?category:\\s*"${ALERT_CATEGORY}"`).test(text) ||
      new RegExp(`\\blog\\(\\s*(?:\\/\\/[^\\n]*\\n\\s*)*"${ALERT_CATEGORY}"`).test(text) ||
      new RegExp(`\\blog\\(\\s*(?:\\/\\*[\\s\\S]*?\\*\\/\\s*)*"${ALERT_CATEGORY}"`).test(text);

    if (writes) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    `These write "${ALERT_CATEGORY}", the category the shelf alert treats as a ` +
      `failure. Ordinary stock work belongs in "inventory" — filing it here ` +
      `reports the shop's own batches and counts as shelves that stopped ` +
      `adding up: ${offenders.join(", ")}`
  );
});

test("the database still writes the category, so the alert is not dead", () => {
  // The other half of the same question. A category nothing writes gives a
  // banner that can never fire — which looks like "fixed" and is not.
  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
    .join("\n");

  const writesIt = [...migrations.matchAll(/insert into activity_log[\s\S]{0,400}/g)].some(
    (m) => m[0].includes(`'${ALERT_CATEGORY}'`)
  );

  assert.ok(
    writesIt,
    `No migration writes '${ALERT_CATEGORY}', so the shelf alert can never ` +
      `fire. A silent banner is not a fixed banner.`
  );
});

test("the backfill leaves a real shortfall alerting", () => {
  // The rule 0072 backfills by, checked here as text so the two cannot drift:
  // a row is only moved out of the alert when it opens like the application's
  // own wording AND carries none of the database's warning phrases.
  const sql = readFileSync(
    "supabase/migrations/0072_a_shelf_that_was_never_short.sql",
    "utf8"
  );
  for (const phrase of [
    "went below zero: short by ",
    "took nothing off the shelf:",
    "Nothing came off the shelf for ",
  ]) {
    assert.ok(
      sql.includes(`description not like '%${phrase}%'`) ||
        sql.includes(`description not like '${phrase}%'`),
      `The backfill does not exclude the warning phrase "${phrase}", so a real ` +
        `shortfall whose text happens to open with "Counted" would be filed ` +
        `away as routine and never shown.`
    );
  }
});
