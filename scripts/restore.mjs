// Put a backup file back into Supabase.
//
//   node --env-file=.env.local scripts/restore.mjs pepperpan-backup_2026-08-31_1430.json
//
// The other half of /admin/backup. A backup nobody can restore is a file, not
// a backup, so this ships with the project rather than being something the
// owner has to come back and ask for.
//
// It upserts rather than deletes: rows in the file overwrite rows with the
// same id, and anything already in the database that isn't in the file is left
// alone. That makes it safe to run twice, and safe to run against a database
// that has moved on — but it does mean a restore does NOT undo a deletion of
// rows the backup never had. To roll a table fully back to the file, empty it
// first, deliberately.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node --env-file=.env.local scripts/restore.mjs <backup.json>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const backup = JSON.parse(await readFile(path, 'utf8'));
if (backup.app !== 'PepperPan') {
  console.error(`That doesn't look like a PepperPan backup (app: ${backup.app}).`);
  process.exit(1);
}
console.log(`PepperPan backup v${backup.version}, exported ${backup.exportedAt}`);
if (backup.failed?.length) {
  console.warn(`⚠ These tables failed to export and will be empty: ${backup.failed.join(', ')}`);
}

// Parents before children, because a foreign key does not care what order the
// JSON keys happened to be in.
const ORDER = [
  'settings',
  'shop_settings', 'shop_hours', 'shop_closures',
  'delivery_settings', 'payment_settings', 'chat_settings',
  'profiles',
  'ingredients', 'ingredient_lots',
  'batches', 'batch_ingredients',
  // Categories before meals: nothing enforces it with a foreign key, but a
  // menu that comes back before its own vocabulary shows every dish
  // uncoloured until the next table lands.
  'menu_categories',
  'meals', 'meal_ingredients', 'meal_components',
  'meal_packaging', 'order_packaging',
  // Shifts before orders: an order carries `shift_id`.
  'staff_shifts',
  'orders', 'order_lines',
  'purchase_log', 'consumption_log', 'waste_log',
  'cash_ledger', 'receivables', 'cycle_counts', 'oe_templates',
  'fixed_costs', 'assets',
  'reviews', 'chat_threads', 'chat_messages', 'faq_entries',
  'activity_log',
  // Stands alone — nothing references it, and it references nothing.
  'announcements',
];

// Big tables in one statement can exceed the request size, so they go in
// pieces. 500 is comfortably under it for rows this shape.
const CHUNK = 500;
const problems = [];

for (const table of ORDER) {
  const rows = backup.data?.[table];
  if (!Array.isArray(rows)) continue;
  if (rows.length === 0) { console.log(`- ${table}: empty`); continue; }

  let done = 0;
  let failed = null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + CHUNK));
    if (error) { failed = error.message; break; }
    done += Math.min(CHUNK, rows.length - i);
  }

  if (failed) {
    // Kept going rather than thrown. One table that won't load — usually
    // `profiles`, whose rows point at auth users that no longer exist in a
    // fresh project — must not stop the recipes and the sales history from
    // coming back.
    console.error(`✗ ${table}: ${failed} (${done}/${rows.length} restored)`);
    problems.push(`${table}: ${failed}`);
  } else {
    console.log(`✓ ${table}: ${done}`);
  }
}

const unknown = Object.keys(backup.data ?? {}).filter((t) => !ORDER.includes(t));
if (unknown.length) {
  console.warn(`\n⚠ Not restored — this script doesn't know these tables: ${unknown.join(', ')}`);
  console.warn('  Add them to ORDER in this file, in an order that respects their foreign keys.');
}

if (problems.length) {
  console.error(`\nFinished with ${problems.length} table(s) not fully restored.`);
  process.exit(1);
}
console.log('\nRestored.');
