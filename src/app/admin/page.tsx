import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, getViewer } from "@/lib/auth";
import { wasCalledOff } from "@/lib/order-void";
import { openShiftFor } from "@/lib/shifts-server";
import { loadAvailability } from "@/lib/costing-server";
import { StaffToday, type ServiceOrder, type ShortDish } from "@/components/staff-today";
import { LOW_STOCK_SERVINGS } from "@/lib/costing";
import { ColumnChart, type Bar } from "@/components/admin-charts";
import { LiveOrdersBanner } from "@/components/live-orders-banner";
import { DateRangePicker } from "@/components/date-range-picker";
import { middayOf, shopDay, shopMonthStart, shopToday } from "@/lib/format-date";
import { StatTile, Delta } from "@/components/stat-tile";
import { Explain } from "@/components/explain";
import { SectionHead } from "@/components/hq-kit";
import { TodayBand } from "@/components/today-band";
import { RecentOrders } from "@/components/recent-orders";
import { pesoRound } from "@/lib/peso";
import { ErrorLogPanel } from "@/components/error-log-panel";
import { BlindDishesPanel } from "@/components/blind-dishes-panel";
import { dishesWithoutRecipe, type Component, type MenuDish } from "@/lib/menu-health";
import { listErrors } from "@/lib/error-log";

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
/** For the band at the top — the shop's own day, named. */
const bandDate = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Headline figures are whole pesos — see pesoRound. Exact amounts still show
// to the centavo where one is actually owed, which is what `peso` is for.
const peso = pesoRound;

type OrderRow = {
  id: string;
  created_at: string;
  date: string;
  status: string;
  /** Struck out as a wrong entry. Not a cancellation — see `lib/order-void`. */
  voided_at: string | null;
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
  /**
   * Three days, all of them the shop's rather than the server's.
   *
   * Every one of these was worked out in UTC while the headings beside them
   * were formatted in Manila, so for the first eight hours of every day the
   * page compared a Manila date against a UTC one — which is how a Sunday
   * morning came to read "₱2,061, 8 orders today" over Saturday's trade.
   * `monthStart` was worse again: `getFullYear`/`getMonth` are the SERVER's
   * local time, which on this deployment is UTC and on a laptop is not.
   */
  const todayStr = shopToday(now);
  const yesterdayStr = shopDay(-1, now);
  const monthStart = shopMonthStart(now);

  // The owner can look at any window they like; this month is only the
  // default because it's what they check most days.
  const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const rangeFrom = isDate(params.from) ? params.from! : monthStart;
  const rangeTo = isDate(params.to) ? params.to! : todayStr;
  // A backwards range is a slip, not an instruction — read it the way they meant.
  const [fromDate, toDate] =
    rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
  const customRange = fromDate !== monthStart || toDate !== todayStr;

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

  /**
   * How far back this page actually has to read.
   *
   * It used to read the WHOLE orders table — no limit, no date bound — and
   * then filter it in JavaScript. That works beautifully on the day the shop
   * opens and gets slower every single day it trades, because the cost of
   * loading Today grows with the shop's entire history. It is the reason HQ
   * feels heavier now than it did a month ago, and it would have gone on
   * feeling heavier forever.
   *
   * Everything row-level on this page lives inside one of four windows: the
   * range the owner picked, the equal-length window before it (for the
   * comparison), the fortnight the chart draws, and yesterday. The earliest
   * of those is the only date this query needs.
   */
  const earliest = [fromDate, prevFrom, shopDay(-13, now), yesterdayStr].sort()[0];

  const [ordersRes, openRes, customersRes, leadsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, created_at, date, status, voided_at, fulfillment, revenue, cogs, delivery_fee, payment_status, payment_method, contact_name"
      )
      .gte("date", earliest)
      .order("created_at", { ascending: false }),
    /**
     * Open orders, whatever day they are from.
     *
     * Deliberately outside the window above. An order left `pending` three
     * weeks ago is still work — it is on the board, it is in "to cook now" —
     * and a date bound would drop it off the one screen whose job is to say
     * what needs doing. Small by definition: if this list is ever long, that
     * is itself the thing to look at.
     */
    supabase
      .from("orders")
      .select(
        "id, created_at, date, status, voided_at, fulfillment, revenue, cogs, delivery_fee, payment_status, payment_method, contact_name"
      )
      .in("status", ["pending", "confirmed", "preparing", "ready"])
      .lt("date", earliest),
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

  /**
   * The window's orders, plus any older one still open.
   *
   * Merged rather than concatenated blindly: the two queries cannot overlap —
   * one is `date >= earliest` and the other `date < earliest` — so a plain
   * concat is right, and the sort keeps the newest-first order the second
   * query would otherwise break.
   */
  const orders = ([
    ...((ordersRes.data ?? []) as OrderRow[]),
    ...((openRes.data ?? []) as OrderRow[]),
  ] as OrderRow[]).sort((a, z) => (a.created_at < z.created_at ? 1 : -1));
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
  // What the food cost, on its own. Only needed so the Kept tile can show its
  // working — "revenue minus ingredients" is a sum the owner should be able
  // to see both halves of.
  const cogsOf = (rows: OrderRow[]) => rows.reduce((s, o) => s + Number(o.cogs || 0), 0);
  const todays = live.filter((o) => o.date === todayStr);
  const yesterdays = live.filter((o) => o.date === yesterdayStr);
  const monthly = live.filter((o) => o.date >= monthStart);
  const inRange = live.filter((o) => o.date >= fromDate && o.date <= toDate);

  const inPrevRange = live.filter((o) => o.date >= prevFrom && o.date <= prevTo);
  const needsAction = orders.filter((o) =>
    ["pending", "confirmed", "preparing"].includes(o.status)
  );
  const readyNow = orders.filter((o) => o.status === "ready");

  /**
   * Three figures that used to say "all time" and no longer can.
   *
   * They were computed over every order the shop had ever taken, which is
   * what forced this page to download its whole history. They now follow the
   * dates at the top — which is not a compromise but the better reading:
   * every one of them sits under a date picker, and "average order since the
   * shop opened" answers a question nobody standing at that picker is asking.
   * The tiles say which window they mean.
   */
  const completed = inRange.filter((o) => o.status === "completed");
  const avgOrder = completed.length > 0 ? sum(completed) / completed.length : 0;

  /* Voids are not orders, so they are in neither half of this rate.
     
     A ticket punched twice is the till being wrong, and the shop reads this
     figure to ask how often it let a customer down. */
  const rangeAll = orders.filter(
    (o) => o.date >= fromDate && o.date <= toDate && !o.voided_at
  );
  const cancelled = rangeAll.filter(wasCalledOff);
  const cancelRate =
    rangeAll.length > 0 ? Math.round((cancelled.length / rangeAll.length) * 100) : 0;

  // --- Sales, last 14 days -------------------------------------------------
  const salesByDay: Bar[] = Array.from({ length: 14 }, (_, i) => {
    const key = shopDay(i - 13, now);
    // The label is formatted FROM the key rather than from its own Date, so
    // a bar cannot be labelled one day and filled from another — which is
    // exactly what it did: the key was UTC and the label was Manila, so
    // every bar on the chart was mislabelled for eight hours a day.
    const at = middayOf(key);
    return {
      label: dayLabel.format(at),
      caption: dayCaption.format(at),
      value: sum(live.filter((o) => o.date === key)),
    };
  });

  const delivery = inRange.filter((o) => o.fulfillment === "delivery").length;
  const dineIn = inRange.filter((o) => o.fulfillment === "dine_in").length;
  // Everything that isn't delivered or eaten here is collected at the stall.
  const pickup = inRange.length - delivery - dineIn;
  // Delivery fees are tracked apart from food sales, so "sales" never
  // silently includes money that goes straight back out to the rider.
  const deliveryFeesMonth = monthly.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);

  // GCash payments the customer says they sent but nobody has checked yet —
  // money the shop may be owed, so it gets its own alert tile.
  const awaitingPayment = orders.filter(
    (o) => o.payment_status === "submitted" && o.status !== "cancelled"
  );

  // Read here rather than inside the panel: this is the owner's dashboard and
  // it is already a server component, so one more query costs a round trip
  // and no client bundle. `listErrors` returns [] rather than throwing, so a
  // broken error log cannot break the page about broken things.
  const errors = await listErrors();

  /**
   * Dishes that sell for money and cost nothing.
   *
   * Three small reads, run together, and they answer the question the owner
   * actually arrived with: "why is my stock not going down". A dish with no
   * recipe takes nothing off the shelf and books ₱0 — silently, which is what
   * makes it a mystery rather than a to-do. Migration 0060 makes the SALE say
   * it; this says it before the sale, which is the half that can still be
   * acted on.
   */
  const [mealsRes, recipeRes, componentRes] = await Promise.all([
    supabase.from("meals").select("id, name, is_public"),
    supabase.from("meal_ingredients").select("meal_id"),
    supabase.from("meal_components").select("meal_id, component_meal_id"),
  ]);
  const blindDishes = dishesWithoutRecipe(
    ((mealsRes.data ?? []) as { id: string; name: string; is_public: boolean }[]).map(
      (m): MenuDish => ({ id: m.id, name: m.name, isPublic: m.is_public })
    ),
    new Set(((recipeRes.data ?? []) as { meal_id: string }[]).map((r) => r.meal_id)),
    ((componentRes.data ?? []) as { meal_id: string; component_meal_id: string }[]).map(
      (c): Component => ({ mealId: c.meal_id, componentMealId: c.component_meal_id })
    )
  );

  return (
    <div className="flex flex-col gap-10">
      <LiveOrdersBanner />

      {/* Above the takings on purpose. Money is what the owner came to look
          at; a broken checkout is why the money is wrong. */}
      <ErrorLogPanel errors={errors} />

      {/* Under the errors and above the money, in that order on purpose: a
          broken checkout is why there is no money, and this is why the money
          there is reads too high. */}
      <BlindDishesPanel dishes={blindDishes} />

      {/* ---- the day itself ----

          Today's takings used to be one tile in a grid of ten, all the same
          size, all the same cream. The page is called Today and the first
          thing on it was a date picker for a different window — so the one
          figure the owner opens HQ for was the same weight as the count of
          registered customers.

          It is the band now, with the fortnight behind it and the work in
          front of it, because "₱4,100" is a fact and "₱4,100, up a fifth on
          yesterday, and three orders still to cook" is a shift. */}
      <TodayBand
        // Formatted from `todayStr`, not from `now`. They agree today because
        // both are Manila's — and formatting the label off a separate clock
        // is precisely how they came apart in the first place.
        dateLabel={bandDate.format(middayOf(todayStr))}
        takings={sum(todays)}
        yesterday={sum(yesterdays)}
        orderCount={todays.length}
        cancelledToday={
          orders.filter((o) => o.date === todayStr && wasCalledOff(o)).length
        }
        spark={salesByDay.map((d) => d.value)}
        toCook={needsAction.length}
        ready={readyNow.length}
        toCheck={awaitingPayment.length}
        waitingLeads={waitingLeads}
      />

      {/* ---- the window ---- */}
      <section className="flex flex-col gap-5">
        <SectionHead
          eyebrow="The window"
          title={customRange ? "The range you picked" : "This month so far"}
          hint="Every figure below follows the dates on the right, and each one is compared against the same number of days immediately before it."
          action={<DateRangePicker from={fromDate} to={toDate} isDefault={!customRange} />}
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Explain
            title={customRange ? "Sales in range" : "Sales this month"}
            what={
              customRange
                ? `Everything the shop took between ${fromDate} and ${toDate}.`
                : "Everything the shop has taken since the first of the month."
            }
            lines={[
              {
                label: `${inRange.length} order${inRange.length === 1 ? "" : "s"}, ${fromDate} to ${toDate}`,
                value: peso(sum(inRange)),
              },
              {
                label: `The ${spanDays} day${spanDays === 1 ? "" : "s"} before that`,
                value: peso(sum(inPrevRange)),
                note: `${prevFrom} to ${prevTo} — the same length of window, so the comparison is fair.`,
              },
              {
                label: "Difference",
                value: peso(sum(inRange) - sum(inPrevRange)),
              },
              { label: "= Taken in this window", value: peso(sum(inRange)), total: true },
            ]}
            why="The comparison is always against the SAME NUMBER OF DAYS immediately before, not against last month — otherwise a range of five days would always look terrible beside a full month, and a range of forty would always look wonderful."
          >
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
          </Explain>

          <Explain
            title={customRange ? "Kept in range" : "Kept this month"}
            what="What was left of the sales after the ingredients that went into them — and before rent, kuryente, sweldo or anything else."
            lines={[
              { label: "Taken in this window", value: peso(sum(inRange)) },
              {
                label: "− what the ingredients cost",
                value: peso(cogsOf(inRange)),
                note: "Frozen onto each order when it was sold, so this is what the food cost that day — not what the same recipe would cost at today's prices.",
              },
              {
                label: "= Kept",
                value: peso(kept(inRange)),
                total: true,
              },
              {
                label: "Of every ₱100 taken, kept",
                value:
                  sum(inRange) > 0
                    ? `₱${((kept(inRange) / sum(inRange)) * 100).toFixed(0)}`
                    : "—",
              },
              ...(uncosted(inRange) > 0
                ? [
                    {
                      label: `${uncosted(inRange)} order${uncosted(inRange) === 1 ? "" : "s"} with no cost recorded`,
                      value: "counted as free",
                      note: "An order of a dish with no recipe, or one placed before costing existed. Its ingredients are missing from the sum, so the figure above is a ceiling rather than a number.",
                    },
                  ]
                : []),
            ]}
            why={
              uncosted(inRange) > 0
                ? "Give every dish a recipe on the Dish costs page and this becomes exact. Until then it is the best case — the real figure is lower."
                : "This is gross profit. It is not what the shop made: rent, kuryente, sweldo and spoilage still come out of it. The Money page takes it the rest of the way to break-even."
            }
          >
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
          </Explain>
          {/* One grid, not two.

              "Needs action", "Ready to hand over" and "Payments to check" all
              moved onto the band, where they are work rather than statistics.
              What is left belongs to the window the dates above choose, and a
              second grid under the first only ever meant "these six are less
              important", which a heading says better than a gap does. */}
          <StatTile
            label="Average order"
            value={peso(avgOrder)}
            detail={`across ${completed.length} completed`}
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
                : "In this window, excluding cancelled"
            }
          />
          <StatTile
            label="Cancelled"
            value={`${cancelRate}%`}
            detail={`${cancelled.length} of ${rangeAll.length} in this window`}
          />
        </div>

      </section>

      {/* Sales trend */}
      <section className="flex flex-col gap-5">
        <SectionHead
          eyebrow="The shape of it"
          title="Sales trend"
          hint="Revenue per day, last 14 days — the same fortnight the band at the top draws small. This one has the figures on it."
        />
        <div className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
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
      <section className="flex flex-col gap-5">
        <SectionHead
          eyebrow="Just happened"
          title="Recent orders"
          action={
            <Link
              href="/admin/orders"
              className="rounded-full bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
            >
              View all →
            </Link>
          }
        />
        <RecentOrders orders={orders.slice(0, 8)} />
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
