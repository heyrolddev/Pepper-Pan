import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ShopSnapshot } from "@/lib/marketing-analyst";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Everything is bucketed in the shop's own timezone: a 9pm order in Apalit
// belongs to that evening's rush, not to the next UTC day.
const manilaParts = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  hour: "numeric",
  hour12: false,
});

function bucket(iso: string): { weekday: string; hour: number } {
  const parts = manilaParts.formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday, hour: hour === 24 ? 0 : hour };
}

type OrderRow = {
  id: string;
  customer_id: string | null;
  created_at: string;
  date: string;
  status: string;
  fulfillment: string;
  revenue: number;
  delivery_fee: number | null;
  payment_status: string;
  payment_method: string;
};

/**
 * The shop's numbers, shaped for both the page and the analysis.
 *
 * Built once and used twice, so the figures the owner reads on screen are
 * exactly the figures the analysis was given — nothing can advise on one set
 * of numbers while the page shows another.
 */
export async function buildSnapshot(): Promise<ShopSnapshot> {
  const supabase = await createClient();

  const now = new Date();
  const day = 864e5;
  const d30 = new Date(now.getTime() - 30 * day).toISOString().slice(0, 10);
  const d60 = new Date(now.getTime() - 60 * day).toISOString().slice(0, 10);

  const [ordersRes, linesRes, mealsRes, reviewsRes, chatRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, customer_id, created_at, date, status, fulfillment, revenue, delivery_fee, payment_status, payment_method"
      )
      .gte("date", d60),
    supabase
      .from("order_lines")
      .select("qty, price_at_sale, meals(name), orders!inner(date, status)")
      .gte("orders.date", d30),
    supabase.from("meals").select("name, price, is_available").eq("is_public", true),
    supabase.from("reviews").select("rating, comment, created_at").eq("is_hidden", false),
    supabase.from("chat_messages").select("content, role").eq("role", "user").limit(200),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  const live = orders.filter((o) => o.status !== "cancelled");
  const last30 = live.filter((o) => o.date >= d30);
  const prior30 = live.filter((o) => o.date < d30);

  const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + Number(o.revenue || 0), 0);
  const completed = last30.filter((o) => o.status === "completed");

  // --- items -------------------------------------------------------------
  type Line = {
    qty: number;
    price_at_sale: number;
    meals: { name: string } | null;
    orders: { status: string } | null;
  };
  const tally = new Map<string, { qty: number; revenue: number }>();
  for (const line of (linesRes.data ?? []) as unknown as Line[]) {
    if (line.orders?.status === "cancelled") continue;
    const name = line.meals?.name ?? "Unknown item";
    const cur = tally.get(name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(line.qty);
    cur.revenue += Number(line.qty) * Number(line.price_at_sale);
    tally.set(name, cur);
  }
  const ranked = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);

  // A dish nobody ordered never appears in order_lines, so the slow movers
  // have to come from the menu itself — that absence is the whole point.
  const menu = (mealsRes.data ?? []) as { name: string; price: number; is_available: boolean }[];
  const slowMovers = menu
    .map((m) => ({ name: m.name, qty: tally.get(m.name)?.qty ?? 0, price: Number(m.price) }))
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5);

  // --- time of day / week ------------------------------------------------
  const hourTally = new Array(24).fill(0) as number[];
  const weekTally = new Map<string, { orders: number; revenue: number }>();
  for (const o of last30) {
    const b = bucket(o.created_at);
    hourTally[b.hour] += 1;
    const cur = weekTally.get(b.weekday) ?? { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += Number(o.revenue || 0);
    weekTally.set(b.weekday, cur);
  }

  // --- customers ---------------------------------------------------------
  const perCustomer = new Map<string, number>();
  for (const o of live) {
    if (!o.customer_id) continue;
    perCustomer.set(o.customer_id, (perCustomer.get(o.customer_id) ?? 0) + 1);
  }
  const firstSeen = new Map<string, string>();
  for (const o of [...live].sort((a, b) => a.date.localeCompare(b.date))) {
    if (o.customer_id && !firstSeen.has(o.customer_id)) firstSeen.set(o.customer_id, o.date);
  }

  const reviews = (reviewsRes.data ?? []) as {
    rating: number;
    comment: string | null;
    created_at: string;
  }[];

  const questions = [
    ...new Set(
      ((chatRes.data ?? []) as { content: string }[])
        .map((m) => m.content.trim())
        .filter((c) => c.length > 6 && c.length < 200)
    ),
  ].slice(0, 25);

  return {
    generatedAt: now.toISOString(),
    window: "Last 30 days, compared with the 30 before it",
    revenue: {
      last30: Math.round(sum(last30) * 100) / 100,
      prior30: Math.round(sum(prior30) * 100) / 100,
      avgOrder:
        completed.length > 0 ? Math.round((sum(completed) / completed.length) * 100) / 100 : 0,
      currency: "PHP",
    },
    orders: {
      last30: last30.length,
      prior30: prior30.length,
      cancelRate:
        orders.length > 0
          ? Math.round((orders.filter((o) => o.status === "cancelled").length / orders.length) * 100)
          : 0,
    },
    fulfillment: {
      pickup: last30.filter((o) => o.fulfillment === "pickup").length,
      delivery: last30.filter((o) => o.fulfillment === "delivery").length,
      deliveryFees:
        Math.round(last30.reduce((s, o) => s + Number(o.delivery_fee || 0), 0) * 100) / 100,
    },
    payments: {
      cod: last30.filter((o) => o.payment_method === "cod").length,
      gcash: last30.filter((o) => o.payment_method === "gcash").length,
      unpaidGcash: last30.filter(
        (o) => o.payment_method === "gcash" && o.payment_status === "submitted"
      ).length,
    },
    customers: {
      total: perCustomer.size,
      repeat: [...perCustomer.values()].filter((n) => n > 1).length,
      newLast30: [...firstSeen.values()].filter((d) => d >= d30).length,
    },
    bestSellers: ranked.slice(0, 8).map((r) => ({
      name: r.name,
      qty: r.qty,
      revenue: Math.round(r.revenue * 100) / 100,
    })),
    slowMovers,
    byHour: hourTally
      .map((orders, hour) => ({ hour, orders }))
      .filter((h) => h.orders > 0),
    byWeekday: WEEKDAYS.map((day) => ({
      day,
      orders: weekTally.get(day)?.orders ?? 0,
      revenue: Math.round((weekTally.get(day)?.revenue ?? 0) * 100) / 100,
    })),
    reviews: {
      count: reviews.length,
      average:
        reviews.length > 0
          ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
          : 0,
      recent: reviews
        .filter((r) => r.comment)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 12)
        .map((r) => ({ rating: r.rating, comment: (r.comment ?? "").slice(0, 300) })),
    },
    questionsAsked: questions,
  };
}
