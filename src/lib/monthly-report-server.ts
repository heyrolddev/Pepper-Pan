import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { loadCostBook } from "@/lib/costing-server";
import { buildMonthlyReport, type DishRow, type OrderRow, type Report } from "@/lib/monthly-report";

/**
 * A month's worth of rows, and the months there are to look at.
 *
 * ── The one figure that is an estimate, and it says so ───────────────────
 *
 * `orders.cogs` is the real cost of an order, recorded at the moment stock
 * moved. It is the truth for every money figure in the report. But it is
 * stored per ORDER, not per line — so "what did this dish earn" has to be
 * worked out from the recipe, and the only recipe available is today's.
 *
 * That means the per-dish profit uses TODAY's ingredient prices against
 * what the dish sold for THEN. If chicken went up in the middle of the
 * month, a chicken dish looks slightly worse than it was. The screen says
 * this rather than presenting it as measured, because a dish being called
 * a loss-maker is a decision somebody acts on.
 *
 * The month's own totals are not affected: those come from `orders.cogs`,
 * which is historical and exact.
 */

/** Months the shop has any sales in, newest first. */
export async function tradedMonths(limit = 13): Promise<string[]> {
  try {
    const { data } = await createAdminClient()
      .from("orders")
      .select("date")
      .neq("status", "cancelled")
      .order("date", { ascending: false })
      .limit(4000);
    const months = new Set<string>();
    for (const r of (data ?? []) as { date: string }[]) {
      if (r.date) months.add(r.date.slice(0, 7));
    }
    return [...months].sort().reverse().slice(0, limit);
  } catch {
    return [];
  }
}

const prevMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
};

const bounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

async function ordersIn(month: string): Promise<OrderRow[]> {
  const { from, to } = bounds(month);
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("date, status, revenue, cogs, discount, customer_id, fulfillment")
    .gte("date", from)
    .lte("date", to);
  if (error) {
    console.error(`[monthly] orders ${month}: ${error.message}`);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((o) => ({
    date: String(o.date),
    status: String(o.status),
    revenue: Number(o.revenue) || 0,
    cogs: Number(o.cogs) || 0,
    discount: Number(o.discount) || 0,
    customerId: (o.customer_id as string | null) ?? null,
    fulfillment: String(o.fulfillment ?? ""),
  }));
}

/** What each dish sold, and what it costs to make at today's prices. */
async function dishesIn(month: string): Promise<DishRow[]> {
  const { from, to } = bounds(month);
  const db = createAdminClient();

  const [lines, book] = await Promise.all([
    db
      .from("order_lines")
      .select("meal_id, qty, price_at_sale, meals(name), orders!inner(date, status)")
      .gte("orders.date", from)
      .lte("orders.date", to)
      .neq("orders.status", "cancelled"),
    loadCostBook().catch(() => null),
  ]);

  if (lines.error) {
    console.error(`[monthly] lines ${month}: ${lines.error.message}`);
    return [];
  }

  // The book has already costed every dish; recomputing here would be a
  // second copy of the same sum, free to disagree with the Dish costs screen.
  const costs = book?.mealCosts ?? new Map();

  type Row = {
    meal_id: string;
    qty: number;
    price_at_sale: number;
    meals: { name: string } | { name: string }[] | null;
  };

  const out = new Map<string, DishRow>();
  for (const r of (lines.data ?? []) as Row[]) {
    const meal = Array.isArray(r.meals) ? r.meals[0] : r.meals;
    const qty = Number(r.qty) || 0;
    const priced = costs.get(r.meal_id);
    const row = out.get(r.meal_id) ?? {
      mealId: r.meal_id,
      name: meal?.name ?? "A dish",
      qty: 0,
      revenue: 0,
      cogs: 0,
      /* A dish with no recipe costs ZERO, which is not the same as being
         free to make. Left unmarked it would top the profit ranking on the
         strength of a blank — the most flattering possible way to be wrong,
         and about the dishes the shop knows least about. */
      costed: priced?.costed === true,
    };
    row.qty += qty;
    row.revenue += qty * (Number(r.price_at_sale) || 0);
    // Today's recipe cost. See the note at the top of this file.
    row.cogs += qty * (Number(priced?.cost) || 0);
    out.set(r.meal_id, row);
  }
  return [...out.values()];
}

async function wasteIn(month: string): Promise<number> {
  const { from, to } = bounds(month);
  const { data } = await createAdminClient()
    .from("waste_log")
    .select("total_cost")
    .gte("date", from)
    .lte("date", to);
  return ((data ?? []) as { total_cost: number | null }[]).reduce(
    (s, w) => s + (Number(w.total_cost) || 0),
    0
  );
}

/**
 * What the shop pays out monthly whether it opens or not.
 *
 * The month's own bills where they were entered, falling back to the
 * standing estimate for a month nobody has filled in — a month with no
 * entered bills is not a month with no rent.
 */
async function fixedCostsFor(month: string): Promise<number> {
  const db = createAdminClient();
  const [bills, standing] = await Promise.all([
    db.from("monthly_bills").select("amount").eq("month", `${month}-01`),
    db.from("fixed_costs").select("amount").eq("active", true),
  ]);
  const entered = ((bills.data ?? []) as { amount: number }[]).reduce(
    (s, b) => s + (Number(b.amount) || 0),
    0
  );
  if (entered > 0) return entered;
  return ((standing.data ?? []) as { amount: number }[]).reduce(
    (s, f) => s + (Number(f.amount) || 0),
    0
  );
}

/** The whole report for one month. */
export async function monthlyReport(month: string): Promise<Report | null> {
  try {
    const [orders, prior, dishes, waste, fixedCosts] = await Promise.all([
      ordersIn(month),
      ordersIn(prevMonth(month)),
      dishesIn(month),
      wasteIn(month),
      fixedCostsFor(month),
    ]);
    return buildMonthlyReport({
      month,
      today: shopToday(),
      orders,
      prior,
      dishes,
      waste,
      fixedCosts,
    });
  } catch (e) {
    console.error(`[monthly] ${month}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
