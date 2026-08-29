import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ColumnChart, RankedBars, type Bar } from "@/components/admin-charts";
import { LiveOrdersBanner } from "@/components/live-orders-banner";

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type OrderRow = {
  id: string;
  created_at: string;
  date: string;
  status: string;
  fulfillment: string;
  revenue: number;
  contact_name: string | null;
};

function StatTile({
  label,
  value,
  detail,
  tone = "plain",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "plain" | "alert" | "good";
}) {
  const ring =
    tone === "alert"
      ? "ring-2 ring-brand-600"
      : tone === "good"
        ? "ring-2 ring-jade-600"
        : "ring-1 ring-ink-950/10";
  return (
    <div className={`rounded-2xl bg-cream-100 p-5 ${ring}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">{label}</p>
      <p className="mt-2 font-display text-3xl font-black text-ink-950">{value}</p>
      {detail && <p className="mt-1 text-sm text-ink-800/60">{detail}</p>}
    </div>
  );
}

/** Trend against the previous comparable period, stated in words not just colour. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (!Number.isFinite(pct) || pct === 0) return null;
  const up = pct > 0;
  return (
    <p
      className={`mt-1 text-sm font-bold ${up ? "text-jade-700" : "text-brand-700"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(pct)}% {up ? "up from" : "down from"} {label}
    </p>
  );
}

export default async function AdminDashboard() {
  const supabase = await createClient();

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const last30 = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);

  const [ordersRes, linesRes, customersRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, created_at, date, status, fulfillment, revenue, contact_name")
      .order("created_at", { ascending: false }),
    supabase
      .from("order_lines")
      .select("qty, price_at_sale, meals(name), orders!inner(date)")
      .gte("orders.date", last30),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  // Cancelled orders are excluded from every money figure — they earned nothing.
  const live = orders.filter((o) => o.status !== "cancelled");

  const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + Number(o.revenue || 0), 0);
  const todays = live.filter((o) => o.date === todayStr);
  const yesterdays = live.filter((o) => o.date === yesterdayStr);
  const monthly = live.filter((o) => o.date >= monthStart);
  const needsAction = orders.filter((o) =>
    ["pending", "confirmed", "preparing"].includes(o.status)
  );
  const readyNow = orders.filter((o) => o.status === "ready");

  const completed = live.filter((o) => o.status === "completed");
  const avgOrder = completed.length > 0 ? sum(completed) / completed.length : 0;

  const cancelled = orders.filter((o) => o.status === "cancelled");
  const cancelRate =
    orders.length > 0 ? Math.round((cancelled.length / orders.length) * 100) : 0;

  // --- Sales, last 14 days -------------------------------------------------
  const salesByDay: Bar[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    const value = sum(live.filter((o) => o.date === key));
    return {
      label: d.toLocaleDateString(undefined, { day: "numeric" }),
      caption: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value,
    };
  });

  // --- Busiest hours (last 30 days) ---------------------------------------
  const hourTally = new Array(24).fill(0);
  for (const o of live) {
    if (o.date >= last30) hourTally[new Date(o.created_at).getHours()] += 1;
  }
  // Trim to trading hours so 3am dead space doesn't squash the real bars.
  const firstHour = Math.max(0, hourTally.findIndex((v) => v > 0));
  const lastHour = 23 - [...hourTally].reverse().findIndex((v) => v > 0);
  const hours: Bar[] =
    firstHour >= 0 && lastHour >= firstHour
      ? hourTally.slice(firstHour, lastHour + 1).map((value, i) => {
          const h = firstHour + i;
          const label = h % 12 === 0 ? 12 : h % 12;
          return {
            label: String(label),
            caption: `${label}${h < 12 ? "am" : "pm"}`,
            value,
          };
        })
      : [];

  // --- Best sellers (last 30 days) ----------------------------------------
  type Line = { qty: number; price_at_sale: number; meals: { name: string } | null };
  const tally = new Map<string, { qty: number; revenue: number }>();
  for (const line of (linesRes.data ?? []) as unknown as Line[]) {
    const name = line.meals?.name ?? "Unknown item";
    const cur = tally.get(name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(line.qty);
    cur.revenue += Number(line.qty) * Number(line.price_at_sale);
    tally.set(name, cur);
  }
  const ranked = [...tally.entries()].map(([name, v]) => ({ name, ...v }));
  const topItems: Bar[] = ranked
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 7)
    .map((r) => ({ label: r.name, value: r.qty, caption: peso(r.revenue) }));

  const pickup = live.filter((o) => o.fulfillment === "pickup").length;
  const delivery = live.filter((o) => o.fulfillment === "delivery").length;

  return (
    <div className="flex flex-col gap-10">
      <LiveOrdersBanner />

      {/* KPI row */}
      <section>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
              Sales today
            </p>
            <p className="mt-2 font-display text-3xl font-black text-ink-950">
              {peso(sum(todays))}
            </p>
            <p className="mt-1 text-sm text-ink-800/60">
              {todays.length} order{todays.length === 1 ? "" : "s"}
            </p>
            <Delta now={sum(todays)} before={sum(yesterdays)} label="yesterday" />
          </div>

          <StatTile
            label="Sales this month"
            value={peso(sum(monthly))}
            detail={`${monthly.length} order${monthly.length === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Average order"
            value={peso(avgOrder)}
            detail={`across ${completed.length} completed`}
          />
          <StatTile
            label="Needs action"
            value={String(needsAction.length)}
            detail="Pending / confirmed / cooking"
            tone={needsAction.length > 0 ? "alert" : "plain"}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Ready to hand over"
            value={String(readyNow.length)}
            detail="Waiting for the customer"
            tone={readyNow.length > 0 ? "good" : "plain"}
          />
          <StatTile
            label="Customers"
            value={String(customersRes.count ?? 0)}
            detail="Registered accounts"
          />
          <StatTile
            label="Pickup / delivery"
            value={`${pickup} / ${delivery}`}
            detail="All time, excluding cancelled"
          />
          <StatTile
            label="Cancelled"
            value={`${cancelRate}%`}
            detail={`${cancelled.length} of ${orders.length} orders`}
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

      {/* Sales trend */}
      <section>
        <h2 className="font-display text-2xl font-black text-ink-950">Sales trend</h2>
        <p className="mt-1 text-sm text-ink-800/60">
          Revenue per day, last 14 days · hover a bar for the exact figure
        </p>
        <div className="mt-5 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          <ColumnChart data={salesByDay} hue="money" format="peso" />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Best sellers */}
        <section>
          <h2 className="font-display text-2xl font-black text-ink-950">Best sellers</h2>
          <p className="mt-1 text-sm text-ink-800/60">Units sold, last 30 days</p>
          {topItems.length === 0 ? (
            <p className="mt-5 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              No sales recorded in the last 30 days yet.
            </p>
          ) : (
            <div className="mt-5 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
              <RankedBars data={topItems} hue="count" suffix={(r) => r.caption ?? ""} />
            </div>
          )}
        </section>

        {/* Busiest hours */}
        <section>
          <h2 className="font-display text-2xl font-black text-ink-950">Busiest hours</h2>
          <p className="mt-1 text-sm text-ink-800/60">
            Orders by hour of day, last 30 days — plan your prep around these
          </p>
          <div className="mt-5 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
            <ColumnChart
              data={hours}
              hue="count"
              format="plain"
              emptyLabel="Not enough orders yet to show a pattern."
            />
          </div>
        </section>
      </div>

      {/* Recent orders */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-black text-ink-950">Recent orders</h2>
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
                    {new Date(o.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
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
