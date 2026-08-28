import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/reveal";

type OrderLine = {
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
  order_lines: OrderLine[];
};

const statusTone: Record<string, string> = {
  pending: "bg-gold-400 text-ink-950",
  confirmed: "bg-chili-500 text-cream-50",
  preparing: "bg-chili-500 text-cream-50",
  ready: "bg-jade-600 text-cream-50",
  completed: "bg-jade-700 text-cream-50",
  cancelled: "bg-ink-800 text-cream-100",
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
      "id, created_at, status, fulfillment, revenue, order_lines(qty, price_at_sale, meals(name))"
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const typedOrders = (orders ?? []) as unknown as Order[];

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Order history"
        title="Your Orders"
        subtitle={
          typedOrders.length > 0
            ? "Everything you've ordered from Pepper Pan."
            : undefined
        }
      />

      <section className="mx-auto max-w-2xl px-6 py-14">
        {typedOrders.length === 0 ? (
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
          <ul className="flex flex-col gap-5">
            {typedOrders.map((order, i) => (
              <Reveal key={order.id} delay={Math.min(i, 6) * 0.06}>
                <li className="overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
                  <div className="flex items-center justify-between gap-4 border-b border-ink-950/10 px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-ink-950">
                        {new Date(order.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs capitalize text-ink-800/60">
                        {order.fulfillment}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        statusTone[order.status] ?? "bg-ink-800 text-cream-100"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-2 px-6 py-4 text-sm">
                    {order.order_lines.map((line, idx) => (
                      <li key={idx} className="flex justify-between gap-4">
                        <span className="text-ink-800">
                          {line.qty} × {line.meals?.name ?? "Item"}
                        </span>
                        <span className="shrink-0 font-semibold text-ink-950">
                          ₱{(line.qty * Number(line.price_at_sale)).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-between border-t border-ink-950/10 px-6 py-4">
                    <span className="font-display font-bold text-ink-950">Total</span>
                    <span className="font-display text-lg font-black text-brand-600">
                      ₱{Number(order.revenue).toFixed(2)}
                    </span>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
