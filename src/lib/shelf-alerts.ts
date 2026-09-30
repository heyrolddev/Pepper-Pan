import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";

/**
 * The shelf saying it does not add up.
 *
 * ── What these are ───────────────────────────────────────────────────────
 *
 * `apply_order_stock` writes a `movement` line whenever a sale takes a
 * shelf below zero, or takes nothing off a shelf at all. Both mean the
 * same uncomfortable thing: what the shop believes it has and what it
 * actually has have come apart. More was sold than was recorded as made,
 * or a dish has no recipe and has been quietly costing nothing.
 *
 * ── The category has one author now ──────────────────────────────────────
 *
 * It had two. The inventory screen filed every batch produced and every
 * cycle count under `movement` as well, and this query cannot tell a writer
 * apart — only a category. So a morning of ordinary work came back as
 * "8 shelves stopped adding up today", listing two batches and six counts,
 * with not one real shortfall among them.
 *
 * Worse, the banner's own advice is "Recount it below", and a recount wrote
 * another `movement` row. The alert counted UP for every person who did what
 * it asked.
 *
 * 0072 moved the application's writes to `inventory` and backfilled the rows
 * already misfiled. This filter is correct only while `movement` stays the
 * database's alone — `tests/shelf-alerts-category.test.ts` fails if any
 * TypeScript source writes to it again.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * That warning was already being written, and it landed in the activity
 * log — three lines, folded by day, among the forty other things a shop
 * does. Rendered at exactly the same weight as "Ana clocked in". So the
 * software knew the chicken had run out mid-service and said so in a place
 * nobody reads mid-service, which is the same as not saying it.
 *
 * The badge rule in `admin-badges.ts` is the right test and this passes it:
 * a count here is a thing somebody has to DO — go and recount the batch, or
 * log the production that never got logged — not a total to admire.
 *
 * ── Today only, and why that is not a cop-out ────────────────────────────
 *
 * No `resolved` flag, no watermark to tick off. A shelf alert is news, and
 * the standing problem it points at lives where it belongs: in the stock
 * count itself, which stays wrong until somebody fixes it and is on the
 * screen this badge opens. Giving the news its own tick-off box would mean
 * an alert could be dismissed while the count it is about is still wrong —
 * which is how a warning becomes a thing people clear rather than read.
 */

export type ShelfAlert = {
  id: string;
  at: string;
  /** Written by the database, in the shop's own words. */
  description: string;
};

/**
 * Today's, newest first.
 *
 * Swallows its own failure and returns nothing, the same rule every badge
 * count follows: a missing migration must not take HQ down, and no alerts
 * is a fairer reading of "we could not tell" than a wrong number.
 */
export async function listShelfAlerts(): Promise<ShelfAlert[]> {
  try {
    const { data, error } = await createAdminClient()
      .from("activity_log")
      .select("id, at, description")
      .eq("category", "movement")
      .eq("date", shopToday())
      .order("at", { ascending: false })
      .limit(20);
    if (error) {
      console.error(`[shelf-alerts] ${error.message}`);
      return [];
    }
    return (data ?? []) as ShelfAlert[];
  } catch {
    return [];
  }
}

/** Just the number, for the rail. */
export async function countShelfAlerts(): Promise<number> {
  try {
    const { count, error } = await createAdminClient()
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("category", "movement")
      .eq("date", shopToday());
    if (error) {
      console.error(`[shelf-alerts] count: ${error.message}`);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}
