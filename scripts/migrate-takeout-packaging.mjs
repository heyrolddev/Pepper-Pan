// Turn the "(T.O) X" duplicate dishes into packaging on "X".
//
//   node --env-file=.env.local scripts/migrate-takeout-packaging.mjs          # plan only
//   node --env-file=.env.local scripts/migrate-takeout-packaging.mjs --apply  # do it
//
// 27 of the 72 dishes on this menu are take-out twins that differ from their
// dine-in counterpart only by packaging. This reads that difference back out
// and stores it as the dish's take-out packaging, so one dish can be served
// two ways instead of two dishes being maintained in parallel.
//
// The twins are HIDDEN, never deleted: historical order_lines point at them,
// and those sales really happened at those prices. Hiding takes them off the
// menu and out of the till while leaving the history intact.
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const stripPrefix = (s) => s.replace(/^\(\s*T\.?\s*O\.?\s*\)\s*/i, '');

const [{ data: meals, error: e1 }, { data: lines, error: e2 }, { data: ing }, { data: bat }] =
  await Promise.all([
    db.from('meals').select('id, name, is_public, is_available'),
    db.from('meal_ingredients').select('meal_id, ref_type, ref_id, qty'),
    db.from('ingredients').select('id, name'),
    db.from('batches').select('id, name'),
  ]);
if (e1 || e2) {
  console.error('Could not read the menu:', (e1 ?? e2).message);
  process.exit(1);
}

const label = new Map([
  ...ing.map((r) => [`inv:${r.id}`, r.name]),
  ...bat.map((r) => [`batch:${r.id}`, `${r.name} (batch)`]),
]);
const linesFor = new Map();
for (const l of lines) {
  const list = linesFor.get(l.meal_id) ?? [];
  list.push(l);
  linesFor.set(l.meal_id, list);
}

// A dine-in twin may share its name with more than one dish. Matching on a
// name that isn't unique would attach one dish's packaging to another, so
// those are reported and skipped rather than guessed at.
const byName = new Map();
for (const m of meals.filter((m) => !/^\(\s*T\.?\s*O\.?\s*\)/i.test(m.name))) {
  const k = norm(m.name);
  byName.set(k, byName.has(k) ? null : m);
}

const plan = [];
const skipped = [];
for (const twin of meals.filter((m) => /^\(\s*T\.?\s*O\.?\s*\)/i.test(m.name))) {
  const base = byName.get(norm(stripPrefix(twin.name)));
  if (base === undefined) {
    skipped.push(`${twin.name} — no dine-in dish of that name`);
    continue;
  }
  if (base === null) {
    skipped.push(`${twin.name} — more than one dish shares that name`);
    continue;
  }

  const baseQty = new Map(
    (linesFor.get(base.id) ?? []).map((l) => [`${l.ref_type}:${l.ref_id}`, Number(l.qty) || 0])
  );
  const packaging = [];
  for (const l of linesFor.get(twin.id) ?? []) {
    const k = `${l.ref_type}:${l.ref_id}`;
    // Only the excess counts as packaging. A take-out portion that also uses
    // more of an ingredient keeps the difference, not the whole line.
    const extra = (Number(l.qty) || 0) - (baseQty.get(k) ?? 0);
    if (extra > 0.00001) {
      packaging.push({ ref_type: l.ref_type, ref_id: l.ref_id, qty: extra });
    }
  }
  if (packaging.length === 0) {
    skipped.push(`${twin.name} — identical to ${base.name}, nothing to move`);
    continue;
  }
  plan.push({ twin, base, packaging });
}

console.log(`\n${plan.length} dish(es) will get take-out packaging:\n`);
for (const p of plan) {
  console.log(`  ${p.base.name}`);
  for (const l of p.packaging) {
    console.log(`      + ${label.get(`${l.ref_type}:${l.ref_id}`) ?? '(deleted item)'} × ${l.qty}`);
  }
  console.log(`      (from "${p.twin.name}", which will be hidden)`);
}
if (skipped.length) {
  console.log(`\nSkipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

if (!APPLY) {
  console.log('\nPlan only — nothing has changed. Re-run with --apply to do it.');
  process.exit(0);
}

let done = 0;
for (const p of plan) {
  // Replaced rather than appended, so running this twice doesn't double the
  // packaging on every dish.
  const { error: delErr } = await db.from('meal_packaging').delete().eq('meal_id', p.base.id);
  if (delErr) { console.error(`✗ ${p.base.name}: ${delErr.message}`); continue; }

  const { error: insErr } = await db
    .from('meal_packaging')
    .insert(p.packaging.map((l) => ({ meal_id: p.base.id, ...l })));
  if (insErr) { console.error(`✗ ${p.base.name}: ${insErr.message}`); continue; }

  const { error: hideErr } = await db
    .from('meals')
    .update({ is_public: false, is_available: false })
    .eq('id', p.twin.id);
  if (hideErr) { console.error(`✗ hiding ${p.twin.name}: ${hideErr.message}`); continue; }
  done++;
}

console.log(`\nDone. ${done} dish(es) now carry their own take-out packaging, and ${done} duplicate(s) are hidden.`);
console.log('Their sales history is untouched — hidden, not deleted.');
console.log('\nNext: in HQ, move anything charged once per ORDER (the bag) out of the');
console.log('per-dish packaging and into the order packaging list, or a four-dish');
console.log('take-out will be charged four bags.');
