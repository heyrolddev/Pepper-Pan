import "server-only";
import { createClient } from "@/lib/supabase/server";
import { shopToday } from "@/lib/format-date";
import { MIN_WEEKS, outlook, weeksFor, type Outlook } from "@/lib/forecast";

/** The longest view offered, and therefore what gets fetched and projected. */
export const MAX_MONTHS = 12;

/**
 * Two years of daily takings, folded into the outlook.
 *
 * Two years rather than everything: it is more history than the projection
 * can use, plenty for the chart, and it keeps one row per trading day rather
 * than growing without limit as the shop ages.
 *
 * Cancelled orders are excluded here rather than filtered later. A cancelled
 * order earned nothing, and leaving it in would put a spike in the history
 * that the trend is then drawn through.
 *
 * `date` is the shop's own trading date, not a timestamp — an order rung up
 * at 11pm belongs to that day's takings wherever the server happens to be.
 */
export async function salesOutlook(): Promise<Outlook & { enough: boolean }> {
  const today = shopToday();
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - 2);

  const db = await createClient();
  const { data, error } = await db
    .from("orders")
    .select("date, revenue")
    .neq("status", "cancelled")
    .gte("date", from.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const rows = error
    ? []
    : ((data ?? []) as { date: string; revenue: number | null }[]).map((o) => ({
        date: o.date,
        revenue: Number(o.revenue) || 0,
      }));

  // Always the long horizon: the six-month view is its own first half, so the
  // screen can switch between them without asking the server again.
  const o = outlook(rows, today, MAX_MONTHS);
  return { ...o, enough: o.fit !== null };
}

export { MIN_WEEKS, weeksFor };
