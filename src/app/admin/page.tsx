import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type OrderRow = {
  id: string;
  created_at: string;
  date: string;
  status: string;
  revenue: number;
  contact_name: string | null;
};

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-black text-ink-950">{value}</p>
      {detail && <p className="mt-1 text-sm text-ink-800/60">{detail}</p>}
    </div>
  );
}

export default async function AdminDashboard() {
  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const last30 = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);

  const [ordersRes, linesRes, customersRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, created_at, date, status, revenue, contact_name")
      .order("created_at", { ascending: false }),
    supabase
      .from("order_lines")
      .select("qty, price_at_sale, meals(name), orders!inner(date)")
      .gte("orders.date", last30),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  const live = orders.filter((o) => o.status !== "cancelled");

  const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + Number(o.revenue || 0), 0);
  const todays = live.filter((o) => o.date === todayStr);
  const monthly = live.filter((o) => o.date >= monthStart);
  const needsAction = orders.filter((o) =>
    ["pending", "confirmed", "preparing"].includes(o.status)
  );

  // Rank menu items by units sold over the last 30 days. Aggregating in JS
  // because PostgREST can't GROUP BY, and the row count here is small.
  type Line = { qty: number; price_at_sale: number; meals: { name: string } | null };
  const tally = new Map<string, { qty: number; revenue: number }>();
  for (const line of (linesRes.data ?? []) as unknown as Line[]) {
    const name = line.meals?.name ?? "Unknown item";
    const cur = tally.get(name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(line.qty);
    cur.revenue += Number(line.qty) * Number(line.price_at_sale);
    tally.set(name, cur);
  }
  const topItems = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);
  const maxQty = topItems[0]?.qty ?? 1;

  return (
    <div className="flex flex-col gap-10">
      {/* KPI row */}
      <section>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Sales today"
            value={peso(sum(todays))}
            detail={`${todays.length} order${todays.length === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Sales this month"
            value={peso(sum(monthly))}
            detail={`${monthly.length} order${monthly.length === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Needs action"
            value={String(needsAction.length)}
            detail="Pending / preparing"
          />
          <StatTile
            label="Customers"
            value={String(customersRes.count ?? 0)}
            detail="Registered accounts"
          />
        </div>
        {needsAction.length > 0 && (
          <Link
            href="/admin/orders"
            className="mt-4 inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Process {needsAction.length} open order
            {needsAction.length === 1 ? "" : "s"} →
          </Link>
        )}
      </section>

      {/* Best sellers — single measure, single hue, direct-labelled */}
      <section>
        <h2 className="font-display text-2xl font-black text-ink-950">
          Best sellers
        </h2>
        <p className="mt-1 text-sm text-ink-800/60">Units sold, last 30 days</p>

        {topItems.length === 0 ? (
          <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            No sales recorded in the last 30 days yet.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {topItems.map((item) => (
              <li key={item.name} className="flex items-center gap-4">
                <span className="w-44 shrink-0 truncate text-sm font-semibold text-ink-950 sm:w-64">
                  {item.name}
                </span>
                <span className="flex h-6 flex-1 items-center">
                  <span
                    className="h-full rounded-r bg-brand-600"
                    style={{ width: `${Math.max((item.qty / maxQty) * 100, 2)}%` }}
                  />
                  <span className="ml-3 whitespace-nowrap text-sm font-bold text-ink-950">
                    {item.qty}
                  </span>
                  <span className="ml-2 whitespace-nowrap text-xs text-ink-800/55">
                    {peso(item.revenue)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent orders */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-black text-ink-950">
            Recent orders
          </h2>
          <Link href="/admin/orders" className="text-sm font-bold text-brand-600 hover:underline">
            View all →
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            No orders yet.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {orders.slice(0, 8).map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-4 rounded-2xl bg-cream-100 px-5 py-3 ring-1 ring-ink-950/10"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-950">
                    {o.contact_name || "Walk-in"}
                  </span>
                  <span className="text-xs text-ink-800/55">
                    {new Date(o.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-800/70">
                    {o.status}
                  </span>
                  <span className="font-display font-black text-ink-950">
                    {peso(Number(o.revenue))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
