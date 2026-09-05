/**
 * Reading a backup out of the phone app this system replaced.
 *
 * The stall ran on a phone app before it ran on this. That app holds the real
 * figures — 93 ingredients counted by hand, 83 dishes with their recipes, a
 * month of sales — and this system holds a schema derived from it, which is
 * why almost every field lines up. Almost, and the gaps are the whole job.
 *
 * Deliberately free of imports, for the same reason `restore-order.ts` is:
 * pure input to pure output, so the whole of it can be tested without a
 * database, a server, or a browser. Nothing here reads the network or the
 * clock.
 *
 * THE FOUR THINGS THIS FILE EXISTS TO GET RIGHT
 *
 * 1. Names. The old app is camelCase JavaScript objects; this one is
 *    snake_case Postgres. `inventory` is `ingredients`, `waste` is
 *    `waste_log`, `invId` is `ingredient_id`.
 *
 * 2. Shape. The old app nests — a meal carries its recipe, an ingredient
 *    carries its lots. Postgres does not, so each nested array becomes rows
 *    in a child table carrying their parent's id.
 *
 * 3. Defaults that would be wrong. An imported order has no status, and this
 *    schema's default is 'pending' — which would drop seven historical sales
 *    into the live order queue, where they would show as tickets waiting to
 *    be cooked and could fire ETA alerts at the owner. They are completed
 *    walk-ins and must arrive saying so. The same trap sits on `is_public`,
 *    which defaults true: 83 dishes with no photographs, 32 of them "(T.O)"
 *    duplicates, would appear on the customer-facing menu the moment the
 *    import finished. They arrive hidden; publishing is a decision.
 *
 * 4. What has nowhere to go, said out loud. The old app stores a numeric PIN
 *    for staff mode; this system has real accounts with roles, and importing
 *    a PIN would be carrying a weaker thing forward. It is dropped, and the
 *    report says it was dropped rather than leaving the owner to notice.
 */

/* ------------------------------------------------------------------ *
 * What the old app's file looks like
 * ------------------------------------------------------------------ */

export type LegacyLot = {
  id?: string;
  qty?: number;
  cost?: number;
  receivedDate?: string | null;
  expiryDate?: string | null;
};

export type LegacyRef = { type?: string; refId?: string; qty?: number };

export type LegacyFile = {
  app?: string;
  version?: number;
  exportedAt?: string;
  data?: Record<string, unknown>;
};

/** Which system wrote a backup file. */
export type BackupKind = "legacy" | "native" | "unknown";

/**
 * Tell the two formats apart from the file's own contents.
 *
 * Both say `app: "PepperPan"`, because both are this shop's. What separates
 * them is the table names, and they do not overlap at all: the old app writes
 * `inventory` and `cashLedger`, this one writes `ingredients` and
 * `cash_ledger`. So the owner never has to know which file they are holding,
 * which matters because the moment they have to choose is the moment they can
 * choose wrong.
 */
const LEGACY_MARKERS = ["inventory", "cashLedger", "consumptionLog", "purchaseLog", "activityLog"];
const NATIVE_MARKERS = ["ingredients", "cash_ledger", "consumption_log", "purchase_log", "activity_log"];

export function detectBackupKind(file: LegacyFile): BackupKind {
  const keys = Object.keys(file.data ?? {});
  if (keys.length === 0) return "unknown";
  const legacy = LEGACY_MARKERS.filter((k) => keys.includes(k)).length;
  const native = NATIVE_MARKERS.filter((k) => keys.includes(k)).length;
  if (legacy === 0 && native === 0) return "unknown";
  return legacy > native ? "legacy" : "native";
}

/* ------------------------------------------------------------------ *
 * Small helpers, each guarding one way a hand-held file can be wrong
 * ------------------------------------------------------------------ */

/** An array, or an empty one — never a crash on a key that isn't there. */
function rows(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = data[key];
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === "object") as Record<string, unknown>[]) : [];
}

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return null;
}

/**
 * A number, or zero.
 *
 * Zero rather than null because every numeric column this feeds is
 * `not null default 0`: a quantity that failed to parse is better recorded as
 * nothing than as a row the database refuses, which would take its siblings
 * down with it in the same chunk.
 */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** A number or null, for columns that genuinely allow "not set". */
function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

/**
 * The `YYYY-MM-DD` part, and nothing else.
 *
 * Sliced rather than parsed, for the reason that keeps coming up in this
 * codebase: `new Date("2026-09-04")` is midnight UTC, which is 8am in Manila,
 * so anything recorded in the evening would be filed under the following day.
 * The old app already writes plain calendar dates; the job is to keep them
 * that way rather than to round-trip them through a timezone.
 */
function day(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** A string list with the blanks and duplicates gone. */
function tags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    const s = str(raw);
    if (!s) continue;
    if (out.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
  }
  return out;
}

/**
 * Only the two kinds a recipe line may point at.
 *
 * `meal_ingredients.ref_type` carries a check constraint, and a row that
 * violates it fails the whole chunk it travels in. Filtering here means one
 * unrecognised line is one line lost, not five hundred.
 */
function refType(v: unknown): "inv" | "batch" | null {
  const s = str(v)?.toLowerCase();
  return s === "inv" || s === "batch" ? s : null;
}

/** As above, but waste may also point at a finished dish. */
function wasteSource(v: unknown): "inv" | "batch" | "meal" | null {
  const s = str(v)?.toLowerCase();
  return s === "inv" || s === "batch" || s === "meal" ? s : null;
}

/**
 * A row without an id cannot be upserted; it would insert a fresh copy on
 * every run and quietly break the promise that importing twice is safe.
 */
function id(v: unknown): string | null {
  return str(v);
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

export type ImportReport = {
  /** Table by table, what the file will put in. */
  counts: Record<string, number>;
  /** Facts in the file that this schema has no column for. */
  dropped: string[];
  /** Rows skipped because they were unusable, and why. */
  skipped: string[];
  exportedAt: string | null;
};

export type ConvertResult = {
  /** In this system's own backup shape, ready for the existing restore. */
  backup: { app: "PepperPan"; version: number; exportedAt?: string; data: Record<string, unknown[]> };
  report: ImportReport;
};

/* ------------------------------------------------------------------ *
 * The conversion
 * ------------------------------------------------------------------ */

/**
 * Turn the old app's file into this system's backup format.
 *
 * Emitting a backup rather than writing to the database is the design
 * decision worth defending: it means the import reuses the restore path that
 * already exists and is already trusted, instead of becoming a second way
 * into the shop's tables that has to be kept correct in parallel. It also
 * means the whole conversion can be checked without a database in front of
 * it — which is what the tests do.
 */
export function convertLegacyBackup(file: LegacyFile): ConvertResult {
  const data = (file.data ?? {}) as Record<string, unknown>;
  const dropped: string[] = [];
  const skipped: string[] = [];

  const out: Record<string, unknown[]> = {};

  /* ---------------- ingredients, and their lots ---------------- */

  const ingredients: unknown[] = [];
  const lots: unknown[] = [];
  let lotsWithoutId = 0;

  for (const r of rows(data, "inventory")) {
    const ingId = id(r.id);
    if (!ingId) {
      skipped.push("an ingredient with no id");
      continue;
    }
    ingredients.push({
      id: ingId,
      name: str(r.name) ?? "Unnamed",
      unit: str(r.unit) ?? "pc",
      purchase_price: num(r.purchasePrice),
      purchase_qty: num(r.purchaseQty),
      categories: tags(r.categories),
      cost: num(r.cost),
      stock: num(r.stock),
      reorder: num(r.reorder),
    });

    for (const l of Array.isArray(r.lots) ? (r.lots as LegacyLot[]) : []) {
      const lotId = id(l?.id);
      if (!lotId) {
        lotsWithoutId += 1;
        continue;
      }
      lots.push({
        id: lotId,
        ingredient_id: ingId,
        qty: num(l.qty),
        cost: num(l.cost),
        received_date: day(l.receivedDate),
        expiry_date: day(l.expiryDate),
      });
    }
  }
  if (lotsWithoutId > 0) {
    skipped.push(`${lotsWithoutId} stock lot${lotsWithoutId === 1 ? "" : "s"} with no id`);
  }
  out.ingredients = ingredients;
  out.ingredient_lots = lots;

  /* ---------------- batches, and their recipes ---------------- */

  const batches: unknown[] = [];
  const batchIngredients: unknown[] = [];

  for (const r of rows(data, "batches")) {
    const batchId = id(r.id);
    if (!batchId) {
      skipped.push("a batch with no id");
      continue;
    }
    batches.push({
      id: batchId,
      name: str(r.name) ?? "Unnamed batch",
      yield_qty: num(r.yieldQty),
      yield_unit: str(r.yieldUnit) ?? "g",
      batch_stock: num(r.batchStock),
      reorder_level: num(r.reorderLevel),
      manual_cost_per_unit: numOrNull(r.manualCostPerUnit),
    });

    for (const line of Array.isArray(r.ingredients) ? (r.ingredients as Record<string, unknown>[]) : []) {
      const invId = id(line?.invId);
      if (!invId) continue;
      // No `id`: this child table is `bigserial`, and the importer clears a
      // parent's lines before inserting its new ones rather than upserting
      // them by a key the file does not have.
      batchIngredients.push({ batch_id: batchId, ingredient_id: invId, qty: num(line.qty) });
    }
  }
  out.batches = batches;
  out.batch_ingredients = batchIngredients;

  /* ---------------- meals, recipes and combos ---------------- */

  const meals: unknown[] = [];
  const mealIngredients: unknown[] = [];
  const mealComponents: unknown[] = [];
  let badRefs = 0;

  for (const r of rows(data, "meals")) {
    const mealId = id(r.id);
    if (!mealId) {
      skipped.push("a dish with no id");
      continue;
    }
    meals.push({
      id: mealId,
      name: str(r.name) ?? "Unnamed dish",
      price: num(r.price),
      kind: str(r.kind) === "combo" ? "combo" : "single",
      categories: tags(r.categories),
      // Hidden on arrival. See the header: `is_public` defaults true, and an
      // import is not a decision to publish 83 photograph-less dishes.
      is_public: false,
      is_available: true,
    });

    for (const line of Array.isArray(r.ingredients) ? (r.ingredients as LegacyRef[]) : []) {
      const t = refType(line?.type);
      const ref = id(line?.refId);
      if (!t || !ref) {
        badRefs += 1;
        continue;
      }
      mealIngredients.push({ meal_id: mealId, ref_type: t, ref_id: ref, qty: num(line.qty) });
    }

    for (const c of Array.isArray(r.components) ? (r.components as Record<string, unknown>[]) : []) {
      const ref = id(c?.mealId ?? c?.refId);
      if (!ref) continue;
      mealComponents.push({ meal_id: mealId, component_meal_id: ref, qty: num(c.qty) });
    }
  }
  if (badRefs > 0) skipped.push(`${badRefs} recipe line${badRefs === 1 ? "" : "s"} pointing nowhere`);
  out.meals = meals;
  out.meal_ingredients = mealIngredients;
  out.meal_components = mealComponents;

  // The vocabulary behind the menu's filter pills, built from the categories
  // the dishes actually use.
  //
  // The old app has no equivalent table — a category there is just a string on
  // a dish — so without this an import leaves `menu_categories` empty. The
  // customer menu survives that now (it builds its pills from the dishes), but
  // the table is what carries the colour and the sort order, and an owner who
  // wants Drinks last and green has nowhere to say so until a row exists.
  //
  // `sort_order` follows first appearance rather than the alphabet, because
  // the order dishes were entered in is closer to how the owner thinks about
  // the menu than A-to-Z is. `colour` is left at the column default, which
  // `colourOf` turns into a stable per-name fallback — so the pills are
  // coloured and distinguishable from the first minute, and every one of them
  // is still the owner's to change.
  const seen = new Map<string, number>();
  for (const m of meals as { categories: string[] }[]) {
    for (const name of m.categories) {
      if (!seen.has(name)) seen.set(name, seen.size);
    }
  }
  out.menu_categories = [...seen].map(([name, sort_order]) => ({ name, sort_order }));

  /* ---------------- orders and their lines ---------------- */

  const orders: unknown[] = [];
  const orderLines: unknown[] = [];

  for (const r of rows(data, "orders")) {
    const orderId = id(r.id);
    if (!orderId) {
      skipped.push("an order with no id");
      continue;
    }
    orders.push({
      id: orderId,
      date: day(r.date),
      logged_by: str(r.loggedBy),
      // Stated, never defaulted. These are sales that already happened; the
      // schema default of 'pending' would put them in the live queue.
      status: "completed",
      fulfillment: "pickup",
      payment_method: "cash",
      tag: str(r.tag),
      revenue: num(r.revenue),
      cogs: num(r.cogs),
      oe: num(r.oe),
      gross_profit: num(r.grossProfit),
      net_profit: num(r.netProfit),
    });

    for (const line of Array.isArray(r.lines) ? (r.lines as Record<string, unknown>[]) : []) {
      const mealId = id(line?.mealId);
      if (!mealId) continue;
      orderLines.push({ order_id: orderId, meal_id: mealId, qty: num(line.qty), price_at_sale: num(line.priceAtSale) });
    }
  }
  out.orders = orders;
  out.order_lines = orderLines;

  /* ---------------- the logs ---------------- */

  out.purchase_log = rows(data, "purchaseLog")
    .filter((r) => id(r.id) && id(r.invId))
    .map((r) => ({
      id: id(r.id),
      ingredient_id: id(r.invId),
      lot_id: id(r.lotId),
      date: day(r.date),
      supplier: str(r.supplier),
      qty: num(r.qty),
      cost: num(r.cost),
      logged_by: str(r.loggedBy),
    }));

  out.consumption_log = rows(data, "consumptionLog")
    .filter((r) => id(r.id) && id(r.invId))
    .map((r) => ({
      id: id(r.id),
      ingredient_id: id(r.invId),
      date: day(r.date),
      qty: num(r.qty),
      type: str(r.type),
    }));

  out.waste_log = rows(data, "waste")
    .filter((r) => id(r.id))
    .map((r) => ({
      id: id(r.id),
      date: day(r.date),
      ingredient_id: id(r.invId),
      qty: num(r.qty),
      unit: str(r.unit),
      reason: str(r.reason),
      cost_at_time: num(r.costAtTime),
      total_cost: num(r.totalCost),
      category: str(r.category) ?? "internal",
      source_type: wasteSource(r.sourceType),
      source_id: id(r.sourceId),
      source_name: str(r.sourceName),
      note: str(r.note),
      logged_by: str(r.loggedBy),
    }));

  out.cash_ledger = rows(data, "cashLedger")
    .filter((r) => id(r.id))
    .map((r) => ({
      id: id(r.id),
      date: day(r.date),
      type: str(r.type) === "in" ? "in" : "out",
      amount: num(r.amount),
      note: str(r.note),
      // 0030 exists for these two. Without them a restock and an electricity
      // bill are the same ₱250 leaving the till.
      source: str(r.source),
      ref_id: id(r.purchaseLogId) ?? id(r.orderId),
    }));

  out.activity_log = rows(data, "activityLog")
    .filter((r) => id(r.id))
    .map((r) => ({
      id: id(r.id),
      at: str(r.at),
      date: day(r.date),
      category: str(r.category),
      description: str(r.description) ?? "(no description)",
      undoable: bool(r.undoable),
      undone: bool(r.undone),
      undo_type: str(r.undoType),
      undo_data: r.undoData ?? null,
      // The old app has no accounts, so there is nobody to point at. Left
      // null rather than guessed.
      actor: null,
    }));

  /* ---------------- settings, and the bills hiding inside them ---------------- */

  const s = (data.settings ?? {}) as Record<string, unknown>;
  const hasSettings = s && typeof s === "object" && !Array.isArray(s) && Object.keys(s).length > 0;

  if (hasSettings) {
    out.settings = [
      {
        id: 1,
        open_days_per_month: num(s.openDaysPerMonth) || 26,
        cash_reserve: num(s.cashReserve),
        promo_tags: tags(s.promoTags),
        cash_balance_enabled: bool(s.cashBalanceEnabled),
        cash_balance_starting_amount: num(s.cashBalanceStartingAmount),
        cash_balance_start_date: day(s.cashBalanceStartDate),
        logged_by_names: tags(s.loggedByNames),
        last_backup_date: str(s.lastBackupDate),
      },
    ];

    // The old app kept the monthly bills inside settings; here they are rows,
    // because the money page divides each one by the days actually open.
    const bills = Array.isArray(s.monthlyOEItems) ? (s.monthlyOEItems as Record<string, unknown>[]) : [];
    out.fixed_costs = bills
      .filter((b) => id(b?.id))
      .map((b) => ({
        id: id(b.id),
        label: str(b.label) ?? "Monthly cost",
        amount: num(b.amount),
        active: true,
      }));

    if (str(s.pin) || str(s.staffPin)) {
      dropped.push(
        "the app's numeric PIN and staff PIN — this system uses real accounts with roles, and a PIN alongside them would be a weaker way in, not a spare key"
      );
    }
    if (s.seededStarterInventory !== undefined || s.activeUndoEntryId !== undefined) {
      dropped.push("the old app's own bookkeeping (starter-inventory flag, pending undo) — meaningless outside it");
    }
    if (s.assetsLockedInAmount !== undefined && s.assetsLockedInAmount !== null) {
      dropped.push("the locked-in assets total — this system records assets as individual rows instead");
    }
  }

  if (rows(data, "receivables").length === 0) out.receivables = [];
  if (rows(data, "assets").length === 0) out.assets = [];

  // Anything present in the file that this conversion has no rule for. Said
  // out loud rather than silently ignored — an unmentioned key is how data
  // goes missing without anybody noticing for a month.
  const handled = new Set([
    "inventory", "batches", "meals", "orders", "purchaseLog", "consumptionLog",
    "waste", "cashLedger", "activityLog", "settings", "receivables", "assets",
    "cycleCounts", "oeTemplates",
  ]);
  for (const key of Object.keys(data)) {
    if (handled.has(key)) continue;
    const n = Array.isArray(data[key]) ? (data[key] as unknown[]).length : 0;
    if (n > 0) dropped.push(`${n} row${n === 1 ? "" : "s"} of "${key}" — this version has nowhere to put them`);
  }

  const counts: Record<string, number> = {};
  for (const [table, list] of Object.entries(out)) {
    if (list.length > 0) counts[table] = list.length;
  }

  return {
    backup: {
      app: "PepperPan",
      version: 1,
      exportedAt: str(file.exportedAt) ?? undefined,
      data: out,
    },
    report: { counts, dropped, skipped, exportedAt: str(file.exportedAt) },
  };
}
