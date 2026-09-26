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
  // The menu cards the dishes are grouped under, and the add-ons offered
  // with them. Both were missing: `menu_products` since the day it shipped,
  // which is exactly the drift the note above warns about — a backup that
  // restores every dish and none of the grouping brings the menu back as
  // seventy-odd loose cards, and the owner rebuilds it all by hand.
  "menu_products",
  "meals",
  "meal_ingredients",
  "meal_components",
  "modifier_groups",
  "modifier_options",
  "meal_modifier_groups",
  "product_modifier_groups",
  // What a dish needs to travel, and what an order needs once. Same standing
  // as a recipe: entered by hand, and the reason a take-out costs more than
  // the same dish eaten at the stall.
  "meal_packaging",
  "order_packaging",
  // The menu's own vocabulary — the names and colours behind the filter pills.
  "menu_categories",
  // Who the shop buys from. `purchase_log.supplier_id` points here, so a
  // restore that skipped this table would bring back every delivery with the
  // supplier nulled out — and the free-text name is only on the rows written
  // before 0045, so for everything since there would be nothing left saying
  // where it came from.
  "suppliers",
  // Trading history
  "orders",
  "order_lines",
  // What was added to each line, at the price it was added for. Without it a
  // restored order is missing the extra rice it was charged for.
  "order_line_extras",
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
  // What each of those bills actually came to, month by month. Losing this
  // does not lose a number that can be retyped from a drawer somewhere — it
  // loses the only record the shop has of its own consumption trend, and
  // every month of it is a month nobody can go back and observe again.
  "monthly_bills",
  "assets",
  // Money owed and money spent. Three more tables that arrived after this
  // list was last read — and the most expensive three to lose, because
  // nothing else in the system knows them: who the shop still owes, what it
  // paid out that was not stock, and what every promo actually cost. "Start
  // fresh" already clears all three by name; the backup that is supposed to
  // be the way back from that did not carry them.
  "supplier_debts",
  "running_costs",
  "marketing_campaigns",
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

/**
 * The tables deliberately left out, and why — written down rather than simply
 * absent.
 *
 * A table missing from `TABLES` and a table that has no business being there
 * look identical from outside this file, which is exactly how four of them
 * went missing for two migrations without anybody noticing. Naming the
 * exclusions turns "is this list complete?" into a question a test can answer:
 * `tests/backup-coverage.test.ts` reads every `create table` in
 * `supabase/migrations/` and fails if one is in neither list. Adding a table
 * now means deciding, once, which of the two it belongs in.
 */
export const NOT_BACKED_UP: Record<string, string> = {
  // Browser tokens that expire on their own and re-register the next time
  // somebody opens the site. Restoring them restores dead addresses.
  push_subscriptions: "browser tokens — they re-register by themselves",
  // Which phone was allowed in. Tied to a device that may be long gone, and
  // re-approving one takes a tap.
  device_sessions: "device approvals — re-granted in one tap",
  // A record of what broke in a system that no longer exists once you are
  // restoring. Restoring it would reopen faults already fixed.
  error_log: "faults in a build that is being replaced",
  // The safety copies themselves. A backup of the backups is a loop.
  restore_snapshots: "the safety copies — backing these up is a loop",
};

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
