import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrderTracker, type TrackedOrder } from "@/components/order-tracker";
import type { ReviewableItem } from "@/components/order-review-panel";
import {
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentStatus,
} from "@/lib/payments";

type OrderLine = {
  id: number;
  meal_id: string;
  qty: number;
  price_at_sale: number;
  meals: { name: string } | null;
};

type Order = {
  id: string;
  created_at: string;
  status: string;
  fulfillment: string;
  revenue: number;
  eta_minutes: number | null;
  cancelled_reason: string | null;
  delivery_address: string | null;
  delivery_fee: number;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  eta_set_at: string | null;
  payment_plan: string;
  downpayment_amount: number | null;
  downpayment_confirmed_at: string | null;
  order_lines: OrderLine[];
};

export default async function OrdersPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="flex-1">
        <PageHeader title="Your Orders" />
        <section className="mx-auto max-w-2xl px-6 py-14">
          <p className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80">
            Ordering isn&apos;t set up yet.
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="flex-1">
        <PageHeader
          eyebrow="Order history"
          title="Your Orders"
          subtitle="Sign in to see everything you've ordered."
        />
        <section className="mx-auto max-w-2xl px-6 py-14 text-center">
          <Link
            href="/login?next=/orders"
            className="inline-block rounded-full bg-brand-600 px-8 py-4 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Sign in →
          </Link>
        </section>
      </main>
    );
  }

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, created_at, status, fulfillment, revenue, eta_minutes, cancelled_reason, eta_set_at, delivery_address, delivery_fee, payment_method, payment_status, payment_reference, payment_plan, downpayment_amount, downpayment_confirmed_at, order_lines(id, meal_id, qty, price_at_sale, meals(name))"
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const typedOrders = (orders ?? []) as unknown as Order[];

  // Everything this customer has already rated, so a completed order shows
  // their existing stars rather than inviting a duplicate review.
  const { data: myReviewRows } = await supabase
    .from("reviews")
    .select("meal_id, rating, comment")
    .eq("customer_id", user.id);

  const myReviews = new Map(
    ((myReviewRows ?? []) as { meal_id: string | null; rating: number; comment: string | null }[])
      .map((r) => [r.meal_id ?? "__shop__", { rating: r.rating, comment: r.comment }])
  );

  const reviewableFor = (o: Order): ReviewableItem[] => {
    if (o.status !== "completed") return [];
    // One row per distinct dish — ordering the same thing twice shouldn't ask
    // for two reviews of it.
    const seen = new Map<string, string>();
    for (const l of o.order_lines ?? []) {
      const id = (l as unknown as { meal_id?: string }).meal_id;
      if (id && !seen.has(id)) seen.set(id, l.meals?.name ?? "Item");
    }
    return [
      {
        mealId: null,
        label: "Pepper Pan overall",
        sublabel: "Service, speed, the whole experience",
        existing: myReviews.get("__shop__") ?? null,
      },
      ...[...seen.entries()].map(([id, name]) => ({
        mealId: id,
        label: name,
        existing: myReviews.get(id) ?? null,
      })),
    ];
  };

  const tracked: TrackedOrder[] = typedOrders.map((o) => ({
    id: o.id,
    created_at: o.created_at,
    status: o.status,
    fulfillment: o.fulfillment,
    revenue: Number(o.revenue),
    eta_minutes: o.eta_minutes,
    cancelled_reason: o.cancelled_reason,
    eta_set_at: o.eta_set_at,
    delivery_address: o.delivery_address,
    delivery_fee: Number(o.delivery_fee ?? 0),
    payment_method: (o.payment_method === "gcash" ? "gcash" : "cod") as PaymentMethod,
    payment_status: (PAYMENT_STATUSES as readonly string[]).includes(o.payment_status)
      ? (o.payment_status as PaymentStatus)
      : "unpaid",
    payment_reference: o.payment_reference,
    payment_plan: (o.payment_plan === "downpayment" ? "downpayment" : "full") as PaymentPlan,
    downpayment_amount: Number(o.downpayment_amount ?? 0),
    downpayment_confirmed_at: o.downpayment_confirmed_at,
    reviewable: reviewableFor(o),
    lines: (o.order_lines ?? []).map((l) => ({
      id: l.id,
      qty: Number(l.qty),
      price_at_sale: Number(l.price_at_sale),
      name: l.meals?.name ?? "Item",
    })),
  }));

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Order history"
        title="Your Orders"
        subtitle={
          tracked.length > 0
            ? "Track what's cooking and look back at everything you've ordered."
            : undefined
        }
      />

      <section className="mx-auto max-w-2xl px-6 py-14">
        {tracked.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-10 text-center">
            <p className="font-display text-2xl font-bold text-ink-950">
              No orders yet
            </p>
            <p className="mt-2 text-ink-800/70">
              Your first craving is one click away.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-block rounded-full bg-brand-600 px-7 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
            >
              Browse the menu →
            </Link>
          </div>
        ) : (
          <OrderTracker orders={tracked} customerId={user.id} />
        )}
      </section>
    </main>
  );
}
