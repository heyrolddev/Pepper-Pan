import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, getViewer } from "@/lib/auth";
import { openShiftFor } from "@/lib/shifts-server";
import { loadAvailability } from "@/lib/costing-server";
import { StaffToday, type ServiceOrder, type ShortDish } from "@/components/staff-today";
import { LOW_STOCK_SERVINGS } from "@/lib/costing";
import { ColumnChart, type Bar } from "@/components/admin-charts";
import { LiveOrdersBanner } from "@/components/live-orders-banner";
import { DateRangePicker } from "@/components/date-range-picker";
import { formatDateTime, shopToday } from "@/lib/format-date";
import { StatTile, Delta } from "@/components/stat-tile";
import { pesoRound } from "@/lib/costing";
import { hqTitle } from "@/lib/hq-theme";

// Shop-timezone day labels, so a bar is filed under the day the shop had,
// not the day the viewer's device thinks it was.
const dayLabel = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  day: "numeric",
});
const dayCaption = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
});

// Headline figures are whole pesos — see pesoRound. Exact amounts still show
// to the centavo where one is actually owed, which is what `peso` is for.
const peso = pesoRound;

type OrderRow = {
  id: string;
  created_at: string;
  date: string;
  status: string;
  fulfillment: string;
  revenue: number;
  cogs: number;
  delivery_fee: number | null;
  payment_status: string;
  payment_method: string;
  contact_name: string | null;
};

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();

  // Two different screens behind one route. The owner's Today is a money
  // screen; a shift's Today is a service screen. Splitting here rather than
  // hiding tiles further down, because they don't share a question — and
  // because everything below this line reads the margin.
  if (!can(viewer, "business")) {
    return <ServiceBoard viewer={viewer} />;
  }

  // The margin columns are revoked from every browser-side session in 0021,
  // so `cogs` has to come through the service role. The check above is what
  // stands in for the one RLS can no longer make here.
  const supabase = createAdminClient();

  const now = new Date();
  const todayStr = shopToday(now);
  const yesterdayStr = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  // The owner can look at any window they like; this month is only the
  // default because it's what they check most days.
  const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const rangeFrom = isDate(params.from) ? params.from! : monthStart;
  const rangeTo = isDate(params.to) ? params.to! : todayStr;
  // A backwards range is a slip, not an instruction — read it the way they meant.
  const [fromDate, toDate] =
    rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
  const customRange = fromDate !== monthStart || toDate !== todayStr;

  const [ordersRes, customersRes, leadsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, created_at, date, status, fulfillment, revenue, cogs, delivery_fee, payment_status, payment_method, contact_name"
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    // Chat leads waiting on a person. Errors (before migration 0011) count
    // as zero — a missing inbox shouldn't take the dashboard down with it.
    supabase
      .from("chat_threads")
      .select("id", { count: "exact", head: true })
      .eq("needs_human", true)
      .eq("handled", false),
  ]);

  const waitingLeads = leadsRes.error ? 0 : (leadsRes.count ?? 0);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  // Cancelled orders are excluded from every money figure — they earned nothing.
  const live = orders.filter((o) => o.status !== "cancelled");

  const sum = (rows: OrderRow[]) => rows.reduce((s, o) => s + Number(o.revenue || 0), 0);
  // What was left after ingredients. `cogs` is snapshotted onto each order at
  // the moment it's sold, so this is what the food actually cost that day and
  // not what the same recipe would cost at today's prices.
  const kept = (rows: OrderRow[]) =>
    rows.reduce((s, o) => s + Number(o.revenue || 0) - Number(o.cogs || 0), 0);
  // Orders that earned money but carry no cost. Every order placed before
  // costing existed is one of these, and so is any order of a dish with no
  // recipe — in both cases the profit above is a ceiling, not a figure. Said
  // out loud rather than quietly inflating the number.
  const uncosted = (rows: OrderRow[]) =>
    rows.filter((o) => Number(o.revenue || 0) > 0 && Number(o.cogs || 0) <= 0).length;
  const todays = live.filter((o) => o.date === todayStr);
  const yesterdays = live.filter((o) => o.date === yesterdayStr);
  const monthly = live.filter((o) => o.date >= monthStart);
  const inRange = live.filter((o) => o.date >= fromDate && o.date <= toDate);

  // The same length of window immediately before it, so the range carries a
  // comparison rather than a bare number.
  const spanDays =
    Math.round(
      (new Date(toDate + "T00:00:00Z").getTime() -
        new Date(fromDate + "T00:00:00Z").getTime()) /
        864e5
    ) + 1;
  const prevTo = new Date(new Date(fromDate + "T00:00:00Z").getTime() - 864e5)
    .toISOString()
    .slice(0, 10);
  const prevFrom = new Date(
    new Date(prevTo + "T00:00:00Z").getTime() - (spanDays - 1) * 864e5
  )
    .toISOString()
    .slice(0, 10);
  const inPrevRange = live.filter((o) => o.date >= prevFrom && o.date <= prevTo);
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
      label: dayLabel.format(d),
      caption: dayCaption.format(d),
      value,
    };
  });

  const delivery = live.filter((o) => o.fulfillment === "delivery").length;
  const dineIn = live.filter((o) => o.fulfillment === "dine_in").length;
  // Everything that isn't delivered or eaten here is collected at the stall.
  const pickup = live.length - delivery - dineIn;
  // Delivery fees are tracked apart from food sales, so "sales" never
  // silently includes money that goes straight back out to the rider.
  const deliveryFeesMonth = monthly.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);

  // GCash payments the customer says they sent but nobody has checked yet —
  // money the shop may be owed, so it gets its own alert tile.
  const awaitingPayment = orders.filter(
    (o) => o.payment_status === "submitted" && o.status !== "cancelled"
  );

  return (
    <div className="flex flex-col gap-10">
      <LiveOrdersBanner />

      {/* KPI row */}
      <section className="flex flex-col gap-4">
        <DateRangePicker from={fromDate} to={toDate} isDefault={!customRange} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Sales today"
            value={peso(sum(todays))}
            detail={`${todays.length} order${todays.length === 1 ? "" : "s"}`}
          >
            <Delta now={sum(todays)} before={sum(yesterdays)} label="yesterday" />
          </StatTile>

          <StatTile
            label={customRange ? "Sales in range" : "Sales this month"}
            value={peso(sum(inRange))}
            detail={`${inRange.length} order${inRange.length === 1 ? "" : "s"}`}
          >
            <Delta
              now={sum(inRange)}
              before={sum(inPrevRange)}
              label={`the ${spanDays} days before`}
            />
          </StatTile>
          <StatTile
            label={customRange ? "Kept in range" : "Kept this month"}
            value={peso(kept(inRange))}
            detail={
              uncosted(inRange) > 0
                ? `Best case — ${uncosted(inRange)} order${
                    uncosted(inRange) === 1 ? " has" : "s have"
                  } no cost recorded`
                : "After ingredients, before everything else"
            }
            tone={uncosted(inRange) > 0 ? "plain" : "good"}
          >
            <Delta
              now={kept(inRange)}
              before={kept(inPrevRange)}
              label={`the ${spanDays} days before`}
            />
          </StatTile>
          <StatTile
            label="Needs action"
            value={String(needsAction.length)}
            detail="Pending / confirmed / cooking"
            tone={needsAction.length > 0 ? "alert" : "plain"}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Average order"
            value={peso(avgOrder)}
            detail={`across ${completed.length} completed`}
          />
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
            label={dineIn > 0 ? "Take-out / delivery / dine in" : "Take-out / delivery"}
            value={dineIn > 0 ? `${pickup} / ${delivery} / ${dineIn}` : `${pickup} / ${delivery}`}
            detail={
              deliveryFeesMonth > 0
                ? `${peso(deliveryFeesMonth)} in fees this month`
                : "All time, excluding cancelled"
            }
          />
          <StatTile
            label="Payments to check"
            value={String(awaitingPayment.length)}
            detail="GCash refs awaiting your confirmation"
            tone={awaitingPayment.length > 0 ? "alert" : "plain"}
          />
          <StatTile
            label="Cancelled"
            value={`${cancelRate}%`}
            detail={`${cancelled.length} of ${orders.length} orders`}
          />
        </div>

        {waitingLeads > 0 && (
          <Link
            href="/admin/inbox"
            className="mt-4 mr-3 inline-block rounded-full bg-gold-400 px-6 py-3 text-sm font-bold text-ink-950 transition-transform hover:scale-105"
          >
            💬 {waitingLeads} customer{waitingLeads === 1 ? "" : "s"} waiting on a
            reply →
          </Link>
        )}

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
        <h2 className={hqTitle}>Sales trend</h2>
        <p className="mt-1 text-sm text-ink-800/60">
          Revenue per day, last 14 days · hover a bar for the exact figure
        </p>
        <div className="mt-5 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          <ColumnChart data={salesByDay} hue="money" format="peso" />
        </div>
      </section>

      {/* Best sellers and busiest hours used to sit here as well as on
          Insights → Analytics. Two pages showing the same chart makes the
          owner wonder which one is right; Today is now purely "what needs
          doing", and understanding the shop lives in one place. */}
      <Link
        href="/admin/analytics"
        className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream-100 px-5 py-4 ring-1 ring-ink-950/10 transition-colors hover:bg-cream-200"
      >
        <span className="text-lg">📈</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink-950">
            Best sellers, busiest hours, what&apos;s not moving
          </span>
          <span className="block text-sm text-ink-800/60">
            All of it lives in Insights, with a date range you can set.
          </span>
        </span>
        <span className="font-bold text-brand-600">Open Insights →</span>
      </Link>

      {/* Recent orders */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className={hqTitle}>Recent orders</h2>
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
{formatDateTime(o.created_at)}
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


/**
 * Today for a shift.
 *
 * Reads through the ordinary client on purpose: whatever comes back is what
 * this person is allowed to see, so a mistake here shows up as a missing
 * number rather than as a leak. `orders_for_staff` is the view without the
 * margin columns.
 */
async function ServiceBoard({
  viewer,
}: {
  viewer: Awaited<ReturnType<typeof getViewer>>;
}) {
  const supabase = await createClient();

  const [ordersRes, leadsRes, makeable, shift] = await Promise.all([
    supabase
      .from("orders_for_staff")
      .select("id, created_at, status, contact_name, scheduled_for")
      .in("status", ["pending", "confirmed", "preparing", "ready"])
      .order("created_at", { ascending: false }),
    supabase
      .from("chat_threads")
      .select("id", { count: "exact", head: true })
      .eq("needs_human", true)
      .eq("handled", false),
    loadAvailability(),
    viewer?.profile?.id ? openShiftFor(viewer.profile.id) : Promise.resolve(null),
  ]);

  // Names for the ids `loadAvailability` returns. Only the dishes actually on
  // the menu — a hidden dish running out is nobody's problem this shift.
  const { data: meals } = await supabase
    .from("meals")
    .select("id, name")
    .eq("is_public", true);
  const nameById = new Map(
    ((meals ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
  );

  const shortDishes: ShortDish[] = [...makeable.entries()]
    .filter(([id, n]) => nameById.has(id) && n <= LOW_STOCK_SERVINGS)
    .map(([id, n]) => ({ name: nameById.get(id)!, makeable: n }))
    .sort((a, b) => a.makeable - b.makeable || a.name.localeCompare(b.name));

  return (
    <StaffToday
      orders={(ordersRes.data ?? []) as ServiceOrder[]}
      waitingLeads={leadsRes.error ? 0 : (leadsRes.count ?? 0)}
      shortDishes={shortDishes}
      name={viewer?.profile?.full_name ?? viewer?.email ?? "there"}
      onShift={shift !== null}
    />
  );
}
