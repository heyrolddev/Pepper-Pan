import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

export default async function OrdersPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <p className="text-brand-800/80 dark:text-brand-100/70">
          Ordering isn&apos;t set up yet.
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
          Your orders
        </h1>
        <p className="mb-4 text-brand-800/80 dark:text-brand-100/70">
          Sign in to see your order history.
        </p>
        <Link
          href="/login?next=/orders"
          className="inline-block rounded-full bg-brand-900 px-6 py-3 font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-gold-400 dark:text-brand-950 dark:hover:bg-gold-300"
        >
          Sign in
        </Link>
      </main>
    );
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, status, fulfillment, revenue, order_lines(qty, price_at_sale, meals(name))")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const typedOrders = (orders ?? []) as unknown as Order[];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
        Your orders
      </h1>

      {typedOrders.length === 0 ? (
        <p className="text-brand-800/80 dark:text-brand-100/70">
          No orders yet.{" "}
          <Link href="/menu" className="font-medium underline">
            Browse the menu
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {typedOrders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-brand-200/60 bg-white/60 p-5 dark:border-brand-800 dark:bg-brand-900/60"
            >
              <div className="flex items-center justify-between text-sm text-brand-800/70 dark:text-brand-100/60">
                <span>{new Date(order.created_at).toLocaleString()}</span>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 font-medium capitalize text-brand-900 dark:bg-brand-800 dark:text-brand-100">
                  {order.status}
                </span>
              </div>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-brand-900 dark:text-brand-100">
                {order.order_lines.map((line, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>
                      {line.qty} × {line.meals?.name ?? "Item"}
                    </span>
                    <span>₱{(line.qty * Number(line.price_at_sale)).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-brand-200/60 pt-3 font-semibold text-brand-950 dark:border-brand-800 dark:text-brand-50">
                <span>Total</span>
                <span>₱{Number(order.revenue).toFixed(2)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
