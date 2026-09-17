import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import type { ShopNormal } from "@/lib/marketing";

export type { ShopNormal };

/**
 * What a normal day looks like at this shop.
 *
 * The difference between this calculator and the hundred break-even
 * calculators on the web: those start every box empty and ask the owner to
 * guess their own margin. A guessed margin makes every figure downstream
 * wrong in the same direction, and nobody notices, because the sum is still
 * internally consistent.
 *
 * The shop already knows all of it. The margin is in `orders.cogs`, which is
 * frozen at the moment of sale. The usual day is in the daily takings. The
 * ordinary swing between days is in the same place. So the boxes open
 * pre-filled with the shop's own history, and the owner changes them only
 * where they have a reason to.
 *
 * Everything is a starting point, not a lock. A campaign run on weekends only
 * has a different baseline than the eight-week median, and the owner is the
 * one who knows that.
 */

/** How far back to look. Long enough to smooth a bad week, short enough to be this shop now. */
const WINDOW_DAYS = 56;


const EMPTY: ShopNormal = {
  baselinePerDay: 0,
  marginRatio: 0,
  avgOrderValue: 0,
  dailySwing: 0,
  days: 0,
  thin: true,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function loadShopNormal(): Promise<ShopNormal> {
  // The margin needs `cogs`, which is revoked from every browser-side session
  // in migration 0021 — so this reads through the service role, like the rest
  // of the owner's dashboard. Nothing here reaches a customer.
  const supabase = createAdminClient();

  const from = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const to = shopToday(new Date());

  const { data, error } = await supabase
    .from("orders")
    .select("date, revenue, cogs")
    .gte("date", from)
    .lte("date", to)
    .neq("status", "cancelled");

  if (error || !data || data.length === 0) return EMPTY;

  const rows = data as { date: string; revenue: number; cogs: number }[];

  // Takings per trading day. Days the shop didn't open aren't in `orders` at
  // all, which is the right answer — a closed Sunday is not a bad day, and
  // averaging it in would set the baseline below every day the shop trades.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + (Number(r.revenue) || 0));
  }
  const daily = [...byDay.values()].filter((v) => v > 0);

  const baselinePerDay = median(daily);
  const swingFrom = daily.map((v) => Math.abs(v - baselinePerDay));
  const dailySwing = median(swingFrom);

  const revenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  // Only orders that actually carry a cost can speak to the margin. An order
  // from before costing existed would otherwise read as 100% margin and pull
  // the whole figure up — which would make every campaign look affordable.
  const costed = rows.filter((r) => Number(r.revenue) > 0 && Number(r.cogs) > 0);
  const costedRevenue = costed.reduce((s, r) => s + Number(r.revenue), 0);
  const costedCogs = costed.reduce((s, r) => s + Number(r.cogs), 0);
  const marginRatio = costedRevenue > 0 ? (costedRevenue - costedCogs) / costedRevenue : 0;

  const avgOrderValue = rows.length > 0 ? revenue / rows.length : 0;

  return {
    baselinePerDay,
    marginRatio: Math.min(1, Math.max(0, marginRatio)),
    avgOrderValue,
    dailySwing,
    days: daily.length,
    // Under a fortnight of trading and the median is being computed from
    // almost nothing. The calculator still works — it just says where the
    // figures came from rather than presenting them as the shop's normal.
    thin: daily.length < 14 || costedRevenue <= 0,
  };
}
