import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The shop's records, on the shop's own hard drive.
 *
 * Everything this business knows lives in one Supabase project: the recipes,
 * what each one costs, every order, every customer. A free-tier project that
 * is paused for inactivity, a password lost, a table cleared by the wrong
 * button — any of those and the whole history is gone, because there is no
 * second copy anywhere. That is the single largest risk in the system and it
 * costs nothing to close.
 *
 * So: a download. No storage bill, no third-party account, no API key — the
 * file lands in the owner's Downloads folder and from there onto whatever they
 * already trust. The only thing the software can do is make the copy easy and
 * say loudly when the last one got old.
 *
 * Two shapes, because a backup has two different jobs:
 *   - `full.json` is for restoring. Every table, machine-readable, matching
 *     the shape `scripts/seed.mjs` already imports.
 *   - the CSVs are for reading — by the owner in Sheets, or by an accountant
 *     who will never open a JSON file.
 */

/** Bumped when the JSON shape changes, so a restore can tell what it's holding. */
const BACKUP_VERSION = 2;

/**
 * Every table worth copying, and why it's in the list.
 *
 * Written out rather than discovered, because "back up whatever tables exist"
 * silently stops covering a table the day someone adds one — and a backup that
 * quietly gets less complete is worse than no backup, since it still looks
 * like one.
 */
const TABLES = [
  // The business itself — the recipes and what they cost, which is the part
  // that took months of real work to enter and exists nowhere else.
  "settings",
  "ingredients",
  "ingredient_lots",
  "batches",
  "batch_ingredients",
  "meals",
  "meal_ingredients",
  "meal_components",
  // What a dish needs to travel, and what an order needs once. Same standing
  // as a recipe: entered by hand, and the reason a take-out costs more than
  // the same dish eaten at the stall.
  "meal_packaging",
  "order_packaging",
  // The menu's own vocabulary — the names and colours behind the filter pills.
  "menu_categories",
  // Trading history
  "orders",
  "order_lines",
  "purchase_log",
  "consumption_log",
  "waste_log",
  "cash_ledger",
  "receivables",
  "cycle_counts",
  "oe_templates",
  // Who worked when, and what their shift took. This is payroll evidence.
  "staff_shifts",
  // What the shop pays out whether it opens or not, and what it bought to
  // trade with — both are the break-even and payback numbers' only source.
  "fixed_costs",
  "assets",
  // People, and what they said
  "profiles",
  "reviews",
  "chat_threads",
  "chat_messages",
  "faq_entries",
  "activity_log",
  // How the shop is set up. Small tables, but each one is an afternoon of
  // deciding — opening hours, delivery zones, the GCash details.
  "shop_settings",
  "shop_hours",
  "shop_closures",
  "delivery_settings",
  "payment_settings",
  "chat_settings",
  // The shop's own copy — promos and news. Not a record of anything that
  // happened, but it is writing the owner did, and losing it means writing
  // it again.
  "announcements",
  // Deliberately not here: push_subscriptions. Those are browser tokens that
  // expire on their own and re-register the next time someone opens the site,
  // so restoring them would restore a list of dead addresses.
  //
  // Seven tables were missing from this list — everything added since the
  // stock-movement work, including the shifts people are paid from. Which is
  // the exact failure the note at the top of this list warns about: the list
  // does not stop being a backup when it falls behind, it just stops being a
  // complete one, and nothing says so. Worth re-reading whenever a migration
  // adds a table.
] as const;

export type BackupTable = (typeof TABLES)[number];

export type TableResult = {
  table: BackupTable;
  rows: Record<string, unknown>[];
  /** Non-null when the read failed — the table is then empty in the file. */
  error: string | null;
};

export type Snapshot = {
  app: "PepperPan";
  version: number;
  exportedAt: string;
  tables: TableResult[];
};

/**
 * Read everything.
 *
 * The service-role client, because a backup that only contains the rows the
 * current session is allowed to see is not a backup. `/admin/backup` is
 * owner-gated and so is the download route — this is the one place where
 * bypassing RLS is the entire point.
 *
 * A table that fails is recorded and the rest still download. Missing one
 * table is a bad backup; refusing to make any backup because one table is
 * missing is a worse one, and the page shows exactly which failed rather than
 * pretending the file is complete.
 */
export async function collectSnapshot(): Promise<Snapshot> {
  const supabase = createAdminClient();

  const tables = await Promise.all(
    TABLES.map(async (table): Promise<TableResult> => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        console.error(`[backup] ${table}: ${error.message}`);
        return { table, rows: [], error: error.message };
      }
      return { table, rows: (data ?? []) as Record<string, unknown>[], error: null };
    })
  );

  return {
    app: "PepperPan",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

/** Just the counts, for the page — no point shipping every row to render a number. */
export async function countRows(): Promise<
  { table: BackupTable; count: number; error: string | null }[]
> {
  const supabase = createAdminClient();
  return Promise.all(
    TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        console.error(`[backup] count ${table}: ${error.message}`);
        return { table, count: 0, error: error.message };
      }
      return { table, count: count ?? 0, error: null };
    })
  );
}

/** The snapshot as the file that gets downloaded. */
export function snapshotToJson(snapshot: Snapshot): string {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of snapshot.tables) data[t.table] = t.rows;
  return JSON.stringify(
    {
      app: snapshot.app,
      version: snapshot.version,
      exportedAt: snapshot.exportedAt,
      // Kept in the file so a restore isn't misled by a table that reads as
      // empty when it was really unreadable.
      failed: snapshot.tables.filter((t) => t.error).map((t) => t.table),
      data,
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One cell, safe to open in a spreadsheet.
 *
 * Two separate hazards, and both are easy to forget:
 *   - CSV's own quoting, for commas, quotes and newlines inside a value.
 *   - Formula injection. Sheets and Excel execute a cell that opens with
 *     `=`, `+`, `-` or `@`, so a customer who names themselves `=cmd|...`
 *     runs code on the owner's laptop when they open their own sales export.
 *     Prefixing an apostrophe makes it text, which is what it always was.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Rows to a CSV file.
 *
 * The BOM is not decoration: without it Excel reads the file as Latin-1 and
 * every ₱ and every ñ in a customer's name comes out as mojibake. Sheets and
 * LibreOffice cope either way, Excel does not, and Excel is what an accountant
 * will use.
 */
export function toCsv(
  headers: string[],
  rows: (unknown[])[]
): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
