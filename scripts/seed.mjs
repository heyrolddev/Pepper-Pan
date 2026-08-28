// One-time import of the real PepperPan backup JSON into Supabase.
// Run after applying supabase/migrations/0001_init.sql:
//   node --env-file=.env.local scripts/seed.mjs
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const raw = JSON.parse(await readFile(new URL('../data/pepperpan_backup.json', import.meta.url), 'utf8'));
const data = raw.data;

async function upsert(table, rows, label) {
  if (!rows.length) { console.log(`- ${label}: nothing to import`); return; }
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw new Error(`${label} failed: ${error.message}`);
  console.log(`- ${label}: imported ${rows.length}`);
}

// ---- ingredients + lots ----
const ingredients = data.inventory.map((i) => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  purchase_price: i.purchasePrice ?? 0,
  purchase_qty: i.purchaseQty ?? 0,
  categories: i.categories ?? [],
  cost: i.cost ?? 0,
  stock: i.stock ?? 0,
  reorder: i.reorder ?? 0,
}));
await upsert('ingredients', ingredients, 'ingredients');

const lots = [];
for (const i of data.inventory) {
  // Mirrors the original app's ensureLots(): an item with no lots array yet
  // is treated as one un-dated lot matching its current stock.
  const itemLots = i.lots !== undefined ? i.lots : (Number(i.stock) > 0 ? [{ id: `${i.id}-lot0`, qty: i.stock, cost: i.cost, receivedDate: null, expiryDate: null }] : []);
  for (const l of itemLots) {
    lots.push({
      id: l.id,
      ingredient_id: i.id,
      qty: l.qty,
      cost: l.cost ?? 0,
      received_date: l.receivedDate || null,
      expiry_date: l.expiryDate || null,
    });
  }
}
await upsert('ingredient_lots', lots, 'ingredient_lots');

// ---- batches ----
const batches = data.batches.map((b) => ({
  id: b.id,
  name: b.name,
  yield_qty: b.yieldQty ?? 0,
  yield_unit: b.yieldUnit ?? 'g',
  batch_stock: b.batchStock ?? 0,
  reorder_level: b.reorderLevel ?? 0,
  manual_cost_per_unit: b.manualCostPerUnit ?? null,
}));
await upsert('batches', batches, 'batches');

const batchIngredients = data.batches.flatMap((b) =>
  (b.ingredients || []).map((ing) => ({ batch_id: b.id, ingredient_id: ing.invId, qty: ing.qty }))
);
await upsert('batch_ingredients', batchIngredients, 'batch_ingredients');

// ---- meals ----
const meals = data.meals.map((m) => ({
  id: m.id,
  name: m.name,
  price: m.price ?? 0,
  kind: m.kind ?? 'single',
  categories: m.categories ?? [],
  is_public: true,
  is_available: true,
}));
await upsert('meals', meals, 'meals');

const mealIngredients = data.meals.flatMap((m) =>
  (m.ingredients || []).map((ing) => ({ meal_id: m.id, ref_type: ing.type, ref_id: ing.refId, qty: ing.qty }))
);
await upsert('meal_ingredients', mealIngredients, 'meal_ingredients');

const mealComponents = data.meals.flatMap((m) =>
  (m.components || []).map((c) => ({ meal_id: m.id, component_meal_id: c.mealId, qty: c.qty }))
);
await upsert('meal_components', mealComponents, 'meal_components');

// ---- orders (historical, walk-in — no customer_id) ----
const orders = data.orders.map((o) => ({
  id: o.id,
  date: o.date,
  logged_by: o.loggedBy || null,
  status: 'completed',
  tag: o.tag || null,
  revenue: o.revenue ?? 0,
  cogs: o.cogs ?? 0,
  oe: o.oe ?? 0,
  gross_profit: o.grossProfit ?? 0,
  net_profit: o.netProfit ?? 0,
}));
await upsert('orders', orders, 'orders');

const orderLines = data.orders.flatMap((o) =>
  (o.lines || []).map((l) => ({ order_id: o.id, meal_id: l.mealId, qty: l.qty, price_at_sale: l.priceAtSale }))
);
await upsert('order_lines', orderLines, 'order_lines');

// ---- waste ----
const waste = data.waste.map((w) => ({
  id: w.id,
  date: w.date,
  ingredient_id: w.invId || null,
  qty: w.qty,
  unit: w.unit,
  reason: w.reason,
  cost_at_time: w.costAtTime,
  total_cost: w.totalCost,
  category: w.category || 'internal',
  source_type: w.sourceType,
  source_id: w.sourceId,
  source_name: w.sourceName,
  note: w.note || null,
  logged_by: w.loggedBy || null,
}));
await upsert('waste_log', waste, 'waste_log');

// ---- consumption log ----
const knownIngredientIds = new Set(data.inventory.map((i) => i.id));
const consumptionSkipped = data.consumptionLog.filter((c) => !knownIngredientIds.has(c.invId));
const consumption = data.consumptionLog
  .filter((c) => knownIngredientIds.has(c.invId))
  .map((c) => ({
    id: c.id,
    ingredient_id: c.invId,
    date: c.date,
    qty: c.qty,
    type: c.type || null,
  }));
if (consumptionSkipped.length) {
  console.log(`- consumption_log: skipping ${consumptionSkipped.length} entr${consumptionSkipped.length === 1 ? 'y' : 'ies'} referencing a deleted ingredient`);
}
await upsert('consumption_log', consumption, 'consumption_log');

// ---- purchase log / cash ledger / receivables / cycle counts / oe templates (empty today, imported if present) ----
await upsert('purchase_log', data.purchaseLog.map((p) => ({
  id: p.id, ingredient_id: p.invId, lot_id: p.lotId, date: p.date, supplier: p.supplier, qty: p.qty, cost: p.cost,
})), 'purchase_log');

await upsert('cash_ledger', (data.cashLedger || []).map((c) => ({
  id: c.id, date: c.date, type: c.type, amount: c.amount, note: c.note, logged_by: c.loggedBy,
})), 'cash_ledger');

await upsert('receivables', (data.receivables || []).map((r) => ({
  id: r.id, date: r.date, customer: r.customer, amount: r.amount, collected: !!r.collected, note: r.note,
})), 'receivables');

await upsert('oe_templates', (data.oeTemplates || []).map((o) => ({ id: o.id, payload: o })), 'oe_templates');
await upsert('cycle_counts', (data.cycleCounts || []).map((c) => ({ id: c.id, date: c.date, payload: c })), 'cycle_counts');

// ---- activity log ----
const activity = data.activityLog.map((a) => ({
  id: a.id,
  at: a.at,
  date: a.date,
  category: a.category,
  description: a.description,
  undoable: !!a.undoable,
  undone: !!a.undone,
  undo_type: a.undoType || null,
  undo_data: a.undoData || null,
}));
await upsert('activity_log', activity, 'activity_log');

// ---- settings (single row; PIN fields intentionally dropped — real auth replaces the PIN gate) ----
const s = data.settings || {};
const { error: settingsError } = await supabase.from('settings').upsert({
  id: 1,
  open_days_per_month: s.openDaysPerMonth ?? 26,
  cash_reserve: s.cashReserve ?? 0,
  promo_tags: s.promoTags ?? [],
  cash_balance_enabled: !!s.cashBalanceEnabled,
  cash_balance_starting_amount: s.cashBalanceStartingAmount ?? 0,
  cash_balance_start_date: s.cashBalanceStartDate || null,
  logged_by_names: s.loggedByNames ?? [],
  last_backup_date: s.lastBackupDate || null,
});
if (settingsError) throw new Error(`settings failed: ${settingsError.message}`);
console.log('- settings: updated');

console.log('\nDone. Real PepperPan data is now in Supabase.');
