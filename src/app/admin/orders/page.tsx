import { createClient } from "@/lib/supabase/server";
import { AdminOrderList, type AdminOrder } from "@/components/admin-order-list";
import { LiveOrdersBanner } from "@/components/live-orders-banner";
import type { OrderStatus } from "@/lib/orders";
import {
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentStatus,
} from "@/lib/payments";

type OrderRow = {
  id: string;
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
  payment_plan: string;
  downpayment_amount: number | null;
  order_lines: { qty: number; price_at_sale: number; meals: { name: string } | null }[];
};

type CustomerInfo = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_verified: boolean;
  is_blocked: boolean;
};

export default async function AdminOrdersPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment, revenue, eta_minutes, cancelled_reason, contact_name, contact_phone, notes, customer_id, delivery_address, delivery_lat, delivery_lng, delivery_distance_km, delivery_fee, payment_method, payment_status, payment_reference, payment_receipt_url, payment_plan, downpayment_amount, order_lines(qty, price_at_sale, meals(name))"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as OrderRow[];

  const customerIds = [...new Set(rows.map((o) => o.customer_id).filter(Boolean))] as string[];
  const { data: profileRows } = customerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone, is_verified, is_blocked")
        .in("id", customerIds)
    : { data: [] };
  const profiles = new Map(((profileRows ?? []) as CustomerInfo[]).map((p) => [p.id, p]));

  // How many completed orders each customer has — a cheap "is this a real
  // regular or a first-timer?" signal next to each order.
  const completedCount = new Map<string, number>();
  for (const o of rows) {
    if (o.customer_id && o.status === "completed") {
      completedCount.set(o.customer_id, (completedCount.get(o.customer_id) ?? 0) + 1);
    }
  }

  const orders: AdminOrder[] = rows.map((o) => {
    const p = o.customer_id ? profiles.get(o.customer_id) : undefined;
    return {
      id: o.id,
      created_at: o.created_at,
      status: o.status,
      fulfillment: o.fulfillment,
      revenue: Number(o.revenue),
      eta_minutes: o.eta_minutes,
      cancelled_reason: o.cancelled_reason,
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

  return (
    <div className="flex flex-col gap-6">
      <LiveOrdersBanner />
      <AdminOrderList orders={orders} />
    </div>
  );
}
