import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AdminOrder } from "@/components/admin-order-list";
import type { OrderStatus } from "@/lib/orders";
import {
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentStatus,
} from "@/lib/payments";

/**
 * Loading orders for HQ, in one place, because there are now two ways in.
 *
 * The board reads the newest few hundred — which is the working view and
 * should stay that way; nobody wants two years of orders rendered to find
 * today's. But the search box only ever searched what the board had loaded,
 * so a ticket from last month returned nothing. That does not read as "out of
 * range", it reads as data loss, and it is the kind of thing that makes an
 * owner stop trusting the whole screen.
 *
 * So there is a second entry point that asks the database instead of the
 * array, and both build an AdminOrder through the same mapper — one shape,
 * one set of coercions, no chance of the two views disagreeing about what a
 * payment method is.
 */

/** How many the board loads. The working view, not the archive. */
export const BOARD_LIMIT = 200;

const COLUMNS =
  "id, ticket, created_at, status, fulfillment, revenue, eta_minutes, cancelled_reason, cancelled_by, cancelled_at, eta_set_at, contact_name, contact_phone, notes, customer_id, delivery_address, delivery_lat, delivery_lng, delivery_distance_km, delivery_fee, payment_method, payment_status, payment_reference, payment_receipt_url, scheduled_for, payment_plan, downpayment_amount, downpayment_confirmed_at, order_lines(qty, price_at_sale, meals(name))";

type OrderRow = {
  id: string;
  ticket: number | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  status: OrderStatus;
  fulfillment: string;
  revenue: number;
  eta_minutes: number | null;
  cancelled_reason: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  customer_id: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_distance_km: number | null;
  delivery_fee: number;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  eta_set_at: string | null;
  scheduled_for: string | null;
  payment_plan: string;
  downpayment_amount: number | null;
  downpayment_confirmed_at: string | null;
  order_lines: { qty: number; price_at_sale: number; meals: { name: string } | null }[];
};

type CustomerInfo = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_verified: boolean;
  is_blocked: boolean;
};

/**
 * Rows to AdminOrders, with the people attached.
 *
 * Two kinds of person are looked up in one query: the customer, and whoever
 * cancelled it. A cancellation with a reason and no name is half a record.
 */
async function hydrate(rows: OrderRow[]): Promise<AdminOrder[]> {
  const supabase = await createClient();

  const peopleIds = [
    ...new Set(
      [...rows.map((o) => o.customer_id), ...rows.map((o) => o.cancelled_by)].filter(Boolean)
    ),
  ] as string[];
  const { data: profileRows } = peopleIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone, is_verified, is_blocked")
        .in("id", peopleIds)
    : { data: [] };
  const profiles = new Map(((profileRows ?? []) as CustomerInfo[]).map((p) => [p.id, p]));

  // How many completed orders each customer has — a cheap "is this a real
  // regular or a first-timer?" signal next to each order. Counted across the
  // rows in hand, which is what it always was.
  const completedCount = new Map<string, number>();
  for (const o of rows) {
    if (o.customer_id && o.status === "completed") {
      completedCount.set(o.customer_id, (completedCount.get(o.customer_id) ?? 0) + 1);
    }
  }

  return rows.map((o) => {
    const p = o.customer_id ? profiles.get(o.customer_id) : undefined;
    return {
      id: o.id,
      ticket: o.ticket === null ? null : Number(o.ticket),
      created_at: o.created_at,
      status: o.status,
      fulfillment: o.fulfillment,
      revenue: Number(o.revenue),
      eta_minutes: o.eta_minutes,
      cancelled_reason: o.cancelled_reason,
      cancelled_at: o.cancelled_at,
      cancelled_by_name: o.cancelled_by
        ? (profiles.get(o.cancelled_by)?.full_name ?? null)
        : null,
      eta_set_at: o.eta_set_at,
      scheduled_for: o.scheduled_for,
      contact_name: o.contact_name,
      contact_phone: o.contact_phone,
      notes: o.notes,
      customer_id: o.customer_id,
      delivery_address: o.delivery_address,
      delivery_lat: o.delivery_lat,
      delivery_lng: o.delivery_lng,
      delivery_distance_km: o.delivery_distance_km,
      delivery_fee: Number(o.delivery_fee ?? 0),
      payment_method: (o.payment_method === "gcash" ? "gcash" : "cod") as PaymentMethod,
      payment_status: (PAYMENT_STATUSES as readonly string[]).includes(o.payment_status)
        ? (o.payment_status as PaymentStatus)
        : "unpaid",
      payment_reference: o.payment_reference,
      payment_receipt_url: o.payment_receipt_url,
      payment_plan: (o.payment_plan === "downpayment" ? "downpayment" : "full") as PaymentPlan,
      downpayment_amount: Number(o.downpayment_amount ?? 0),
      downpayment_confirmed_at: o.downpayment_confirmed_at,
      lines: (o.order_lines ?? []).map((l) => ({
        qty: Number(l.qty),
        price: Number(l.price_at_sale),
        name: l.meals?.name ?? "Item",
      })),
      customer: p
        ? {
            full_name: p.full_name,
            phone: p.phone,
            is_verified: p.is_verified,
            is_blocked: p.is_blocked,
          }
        : null,
      completedBefore: o.customer_id ? (completedCount.get(o.customer_id) ?? 0) : 0,
    };
  });
}

/**
 * The board: newest first, capped, plus how many exist in total.
 *
 * The total is the point of returning it. Without it the screen cannot say
 * "the newest 200 of 1,340", and a list that silently stops is a list somebody
 * eventually mistakes for the whole thing.
 */
export async function loadBoardOrders(): Promise<
  { orders: AdminOrder[]; total: number; error: null } | { orders: null; total: 0; error: string }
> {
  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("orders")
    .select(COLUMNS, { count: "estimated" })
    .order("created_at", { ascending: false })
    .limit(BOARD_LIMIT);

  if (error) return { orders: null, total: 0, error: error.message };
  const rows = (data ?? []) as unknown as OrderRow[];
  return { orders: await hydrate(rows), total: count ?? rows.length, error: null };
}

/**
 * The archive: ask the database, not the array.
 *
 * Deliberately several small `ilike` queries rather than one `.or(...)`.
 * PostgREST's `or` takes its clauses as a comma-separated STRING, so a comma
 * or a bracket typed into the search box changes the shape of the filter
 * rather than being matched by it. Separate filters are sent as ordinary
 * values and escaped by the client, which makes a customer called "Cruz, Ana"
 * a search term instead of a syntax error waiting to happen.
 */
export async function findOrders(query: string, limit = 40): Promise<AdminOrder[]> {
  const q = query.trim().replace(/^#/, "");
  if (q.length < 2) return [];

  const supabase = await createClient();
  const like = `%${q}%`;

  const attempts = [
    supabase.from("orders").select(COLUMNS).ilike("contact_name", like).limit(limit),
    supabase.from("orders").select(COLUMNS).ilike("contact_phone", like).limit(limit),
    supabase.from("orders").select(COLUMNS).ilike("payment_reference", like).limit(limit),
  ];

  // A number is almost always a ticket, so it gets an exact match of its own —
  // an `ilike` on a bigint column is not something PostgREST will do, and
  // "0042" and "42" are the same ticket to whoever typed it.
  if (/^\d+$/.test(q)) {
    attempts.push(
      supabase.from("orders").select(COLUMNS).eq("ticket", Number(q)).limit(limit)
    );
  }

  const results = await Promise.all(attempts);
  const byId = new Map<string, OrderRow>();
  for (const r of results) {
    if (r.error) {
      console.error(`[orders] search: ${r.error.message}`);
      continue;
    }
    for (const row of (r.data ?? []) as unknown as OrderRow[]) byId.set(row.id, row);
  }

  const rows = [...byId.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
  return hydrate(rows);
}
