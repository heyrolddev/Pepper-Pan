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
// The same list HQ's restore screen uses. Node strips the types on import, so
// there is one order rather than two that can drift — and the day they drift
// is the day somebody is restoring a backup, which is the worst possible day
// to find out.
import { RESTORE_ORDER, RESTORE_CHUNK } from '../src/lib/restore-order.ts';

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


const problems = [];

for (const table of RESTORE_ORDER) {
  const rows = backup.data?.[table];
  if (!Array.isArray(rows)) continue;
  if (rows.length === 0) { console.log(`- ${table}: empty`); continue; }

  let done = 0;
  let failed = null;
  for (let i = 0; i < rows.length; i += RESTORE_CHUNK) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + RESTORE_CHUNK));
    if (error) { failed = error.message; break; }
    done += Math.min(RESTORE_CHUNK, rows.length - i);
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

const unknown = Object.keys(backup.data ?? {}).filter((t) => !RESTORE_ORDER.includes(t));
if (unknown.length) {
  console.warn(`\n⚠ Not restored — this script doesn't know these tables: ${unknown.join(', ')}`);
  console.warn('  Add them to RESTORE_ORDER in src/lib/restore-order.ts, in an order that respects their foreign keys.');
}

if (problems.length) {
  console.error(`\nFinished with ${problems.length} table(s) not fully restored.`);
  process.exit(1);
}
console.log('\nRestored.');
