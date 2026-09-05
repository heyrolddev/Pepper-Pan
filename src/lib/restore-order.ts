/**
 * The order tables have to come back in, and what counts as a backup file.
 *
 * Deliberately free of imports — no `server-only`, no `@/` alias, nothing
 * from Supabase. That is what lets `scripts/restore.mjs` read this same list
 * with a relative import while the HQ screen reads it through the app. The
 * order is the part that must not drift: two copies of it would sooner or
 * later disagree about whether shifts come before orders, and the one that is
 * wrong is discovered on the day somebody is restoring a backup — which is
 * the worst possible day to discover anything.
 */

/**
 * Parents before children, because a foreign key does not care what order the
 * JSON keys happened to be in.
 */
export const RESTORE_ORDER = [
  "settings",
  "shop_settings",
  "shop_hours",
  "shop_closures",
  "delivery_settings",
  "payment_settings",
  "chat_settings",
  "profiles",
  "ingredients",
  "ingredient_lots",
  "batches",
  "batch_ingredients",
  // Categories before meals: nothing enforces it with a foreign key, but a
  // menu that comes back before its own vocabulary shows every dish
  // uncoloured until the next table lands.
  "menu_categories",
  "meals",
  "meal_ingredients",
  "meal_components",
  "meal_packaging",
  "order_packaging",
  // Shifts before orders: an order carries `shift_id`.
  "staff_shifts",
  "orders",
  "order_lines",
  "purchase_log",
  "consumption_log",
  "waste_log",
  "cash_ledger",
  "receivables",
  "cycle_counts",
  "oe_templates",
  "fixed_costs",
  "assets",
  "reviews",
  "chat_threads",
  "chat_messages",
  "faq_entries",
  "activity_log",
  // Stands alone — nothing references it, and it references nothing.
  "announcements",
] as const;

export type RestorableTable = (typeof RESTORE_ORDER)[number];

/**
 * Big tables in one statement can exceed the request size, so they go in
 * pieces. 500 is comfortably under it for rows this shape.
 */
export const RESTORE_CHUNK = 500;

export type BackupFile = {
  app: string;
  version?: number;
  exportedAt?: string;
  failed?: string[];
  data?: Record<string, unknown[]>;
};

/**
 * Whether this is one of ours, checked before a single row is written.
 *
 * The file arrives from a person's downloads folder, which is somewhere any
 * JSON can be. Reading `app` is what stops an unrelated file being upserted
 * table by table until something happens to have a matching column name.
 */
export function readBackup(text: string): BackupFile | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "That file isn't JSON — pick the backup file HQ gave you." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "That file is empty, or isn't a backup." };
  }
  const file = parsed as BackupFile;
  if (file.app !== "PepperPan") {
    return {
      error: `That doesn't look like a Pepper Pan backup${
        file.app ? ` (it says "${file.app}")` : ""
      }. Use a file from HQ → Backup.`,
    };
  }
  if (!file.data || typeof file.data !== "object") {
    return { error: "That backup has no data in it." };
  }
  return file;
}

/** Tables present in the file that this build does not know how to restore. */
export function unknownTables(file: BackupFile): string[] {
  const known = new Set<string>(RESTORE_ORDER);
  return Object.keys(file.data ?? {}).filter((t) => !known.has(t));
}

/**
 * Child tables, and the column naming their parent.
 *
 * These tables have `bigserial` primary keys, so their ids live only in the
 * database — a backup of this system carries them and upserts cleanly, but a
 * file converted from the old phone app cannot know them. Inserting such rows
 * a second time would not replace the first set, it would add to it: every
 * recipe would list each ingredient twice, and every cost computed from a
 * recipe would silently double.
 *
 * So the rule is written in terms of the rows themselves rather than in terms
 * of where the file came from: a child row that carries an `id` is upserted
 * by that id, and a child row without one means "these are all of this
 * parent's lines" — clear the parent's existing lines, then insert. That
 * makes importing twice produce exactly what importing once produced, which
 * is the property that makes an import safe to retry when something looks
 * wrong.
 */
export const CHILD_PARENT: Record<string, string> = {
  meal_ingredients: "meal_id",
  meal_components: "meal_id",
  meal_packaging: "meal_id",
  batch_ingredients: "batch_id",
  order_lines: "order_id",
};

/**
 * The parent ids whose children must be cleared before these rows go in, or
 * null when the rows carry their own ids and can simply be upserted.
 *
 * Null rather than an empty list, because "nothing to clear" and "clear
 * nothing" are different instructions and confusing them deletes rows nobody
 * asked to delete.
 */
export function parentsToClear(
  table: string,
  rows: unknown[]
): { column: string; ids: string[] } | null {
  const column = CHILD_PARENT[table];
  if (!column) return null;
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    // One row carrying an id is enough to say this file has them: they come
    // from a single export, so they are all present or all absent.
    if (r.id !== undefined && r.id !== null) return null;
    const parent = r[column];
    if (typeof parent === "string" && parent) ids.add(parent);
  }
  return ids.size > 0 ? { column, ids: [...ids] } : null;
}
