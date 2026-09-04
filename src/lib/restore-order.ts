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
