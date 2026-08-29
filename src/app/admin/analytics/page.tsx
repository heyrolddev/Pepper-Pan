import { ColumnChart, RankedBars, type Bar } from "@/components/admin-charts";
import { AnalysisPanel } from "@/components/analysis-panel";
import { analystConfigured } from "@/lib/marketing-analyst";
import { buildSnapshot } from "./snapshot";

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hourCaption(h: number) {
  const label = h % 12 === 0 ? 12 : h % 12;
  return `${label}${h < 12 ? "am" : "pm"}`;
}

export default async function AdminAnalyticsPage() {
  const snapshot = await buildSnapshot();

  const weekday: Bar[] = snapshot.byWeekday.map((d) => ({
    label: d.day,
    value: d.revenue,
    caption: `${d.orders} order${d.orders === 1 ? "" : "s"}`,
  }));

  const hours: Bar[] = snapshot.byHour.map((h) => ({
    label: String(h.hour % 12 === 0 ? 12 : h.hour % 12),
    value: h.orders,
    caption: hourCaption(h.hour),
  }));

  const sellers: Bar[] = snapshot.bestSellers.map((s) => ({
    label: s.name,
    value: s.qty,
    caption: peso(s.revenue),
  }));

  const growth =
    snapshot.revenue.prior30 > 0
      ? Math.round(
          ((snapshot.revenue.last30 - snapshot.revenue.prior30) / snapshot.revenue.prior30) * 100
        )
      : null;

  const repeatRate =
    snapshot.customers.total > 0
      ? Math.round((snapshot.customers.repeat / snapshot.customers.total) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Analytics</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          What your last 30 days actually say — and, when you ask for it, what
          to post, boost and promote because of it.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile
          label="Sales, 30 days"
          value={peso(snapshot.revenue.last30)}
          detail={
            growth === null
              ? `${snapshot.orders.last30} orders`
              : `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth)}% vs the 30 before`
          }
          tone={growth !== null && growth < 0 ? "alert" : "plain"}
        />
        <Tile
          label="Average order"
          value={peso(snapshot.revenue.avgOrder)}
          detail={`${snapshot.orders.last30} orders in the window`}
        />
        <Tile
          label="Repeat customers"
          value={`${repeatRate}%`}
          detail={`${snapshot.customers.repeat} of ${snapshot.customers.total} have ordered twice+`}
          tone={repeatRate >= 30 ? "good" : "plain"}
        />
        <Tile
          label="Rating"
          value={snapshot.reviews.count > 0 ? snapshot.reviews.average.toFixed(1) : "—"}
          detail={`${snapshot.reviews.count} review${snapshot.reviews.count === 1 ? "" : "s"}`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Which day earns"
          note="Sales by day of week, last 30 days, Manila time."
        >
          <ColumnChart data={weekday} hue="money" format="peso" />
        </Panel>
        <Panel title="When they order" note="Orders by hour, last 30 days.">
          <ColumnChart
            data={hours}
            hue="count"
            format="plain"
            emptyLabel="No orders in this window yet."
          />
        </Panel>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Best sellers" note="By quantity sold in the last 30 days.">
          <RankedBars data={sellers} hue="count" format="plain" suffix={(row) => ` sold · ${row.caption ?? ""}`} />
        </Panel>
        <Panel
          title="Not moving"
          note="On the menu, barely ordered — worth a promo, a photo, or a rest."
        >
          {snapshot.slowMovers.length === 0 ? (
            <p className="text-sm text-ink-800/60">Nothing on the menu yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {snapshot.slowMovers.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center justify-between gap-3 rounded-xl bg-cream-50 px-4 py-2.5 text-sm ring-1 ring-ink-950/10"
                >
                  <span className="min-w-0 truncate font-semibold text-ink-950">
                    {m.name}
                  </span>
                  <span className="shrink-0 text-ink-800/60">
                    {m.qty === 0 ? "none sold" : `${m.qty} sold`} · {peso(m.price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <AnalysisPanel configured={analystConfigured()} />
    </div>
  );
}

function Tile({
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

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
      <h3 className="font-display text-lg font-black text-ink-950">{title}</h3>
      <p className="mb-4 mt-0.5 text-xs text-ink-800/55">{note}</p>
      {children}
    </div>
  );
}
