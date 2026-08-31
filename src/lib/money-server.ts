import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What the shop actually earns.
 *
 * Gross profit — price minus ingredients — is the number the costing screens
 * give, and it is not earnings. Rent, kuryente, tubig and sweldo arrive on
 * the first of the month whether or not anyone bought a bowl. Until those are
 * in, every figure in HQ flatters the business.
 *
 * OE is applied per *day* rather than per order. Splitting a month's rent
 * across individual sales needs a rule for how — evenly? by revenue? — and
 * every rule is arbitrary, which makes any single order's "net profit" a
 * number with an argument inside it. Days are what fixed costs are actually
 * incurred in, so that is the level this works at.
 */

export type FixedCost = { id: string; label: string; amount: number; active: boolean };
export type Asset = { id: string; name: string; amount: number; boughtOn: string | null; note: string | null };
export type LedgerEntry = {
  id: string;
  date: string;
  type: "in" | "out";
  amount: number;
  category: string | null;
  note: string | null;
};
export type Receivable = {
  id: string;
  date: string;
  customer: string | null;
  phone: string | null;
  amount: number;
  collected: number;
  settled: boolean;
  note: string | null;
};

export type MoneyPicture = {
  fixedCosts: FixedCost[];
  monthlyFixed: number;
  openDays: number;
  dailyOE: number;

  /** Of every peso taken, how much is left after ingredients. */
  marginRatio: number | null;
  /** Waste and internal use, as a monthly rate — an ongoing cost to cover. */
  monthlyWasteRate: number;
  /** Sales a day needed to cover everything. Null when it can't be worked out. */
  breakEvenDaily: number | null;
  /** What the shop actually averages a day, over the same window. */
  avgDailyRevenue: number;

  /** Window the margin and averages were measured over. */
  windowDays: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  oeForWindow: number;
  wasteForWindow: number;
  netProfit: number;

  cash: { enabled: boolean; onHand: number; startedOn: string | null; startedWith: number };
  ledger: LedgerEntry[];
  receivables: Receivable[];
  owed: number;

  assets: Asset[];
  assetTotal: number;
  payback: { from: string | null; earned: number; pct: number; paidOff: boolean } | null;
};

const WINDOW_DAYS = 30;

export async function loadMoney(): Promise<MoneyPicture> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [
    { data: costs },
    { data: assetRows },
    { data: ledgerRows },
    { data: receivableRows },
    { data: settingsRow },
    { data: orderRows },
    { data: wasteRows },
  ] = await Promise.all([
    supabase.from("fixed_costs").select("*").order("amount", { ascending: false }),
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
    supabase.from("cash_ledger").select("*").order("date", { ascending: false }).limit(100),
    supabase.from("receivables").select("*").order("date", { ascending: false }).limit(100),
    supabase
      .from("settings")
      .select(
        "open_days_per_month, cash_balance_enabled, cash_balance_starting_amount, cash_balance_start_date, payback_from"
      )
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("date, revenue, cogs, status, payment_method")
      .gte("date", since),
    supabase.from("waste_log").select("date, total_cost").gte("date", since),
  ]);

  const fixedCosts: FixedCost[] = ((costs ?? []) as FixedCost[]).map((c) => ({
    ...c,
    amount: Number(c.amount) || 0,
  }));
  const monthlyFixed = fixedCosts
    .filter((c) => c.active)
    .reduce((s, c) => s + c.amount, 0);
  const openDays = Number(settingsRow?.open_days_per_month) || 26;
  const dailyOE = openDays > 0 ? monthlyFixed / openDays : 0;

  // Cancelled orders earned nothing and cost nothing.
  const live = ((orderRows ?? []) as {
    date: string;
    revenue: number;
    cogs: number;
    status: string;
    payment_method: string;
  }[]).filter((o) => o.status !== "cancelled");

  const revenue = live.reduce((s, o) => s + (Number(o.revenue) || 0), 0);
  const cogs = live.reduce((s, o) => s + (Number(o.cogs) || 0), 0);
  const grossProfit = revenue - cogs;

  // Days the shop actually traded, not calendar days. Averaging a week of
  // sales over thirty days understates the daily take by four times, and the
  // break-even comparison is only meaningful against a like-for-like number.
  const tradingDays = new Set(live.map((o) => o.date)).size;
  const windowDays = Math.max(1, tradingDays);
  const avgDailyRevenue = revenue / windowDays;

  const wasteForWindow = ((wasteRows ?? []) as { total_cost: number }[]).reduce(
    (s, w) => s + (Number(w.total_cost) || 0),
    0
  );
  // Scaled to a month, because spoilage is an ongoing cost to cover and not a
  // one-off — the same treatment rent gets.
  const monthlyWasteRate = (wasteForWindow / windowDays) * 30;

  const marginRatio = revenue > 0 ? grossProfit / revenue : null;
  const breakEvenDaily =
    marginRatio !== null && marginRatio > 0 && monthlyFixed > 0
      ? (monthlyFixed + monthlyWasteRate) / marginRatio / openDays
      : null;

  const oeForWindow = dailyOE * windowDays;
  const netProfit = grossProfit - oeForWindow - wasteForWindow;

  // ---- cash ------------------------------------------------------------
  const ledger: LedgerEntry[] = ((ledgerRows ?? []) as LedgerEntry[]).map((l) => ({
    ...l,
    amount: Number(l.amount) || 0,
  }));
  const cashEnabled = Boolean(settingsRow?.cash_balance_enabled);
  const startedOn = settingsRow?.cash_balance_start_date ?? null;
  const startedWith = Number(settingsRow?.cash_balance_starting_amount) || 0;

  let onHand = 0;
  if (cashEnabled && startedOn) {
    // Cash sales only. GCash never touched the drawer, so counting it here
    // would make the drawer look permanently over.
    const { data: cashSales } = await supabase
      .from("orders")
      .select("revenue")
      .gte("date", startedOn)
      .eq("payment_method", "cod")
      .neq("status", "cancelled");
    const takings = ((cashSales ?? []) as { revenue: number }[]).reduce(
      (s, o) => s + (Number(o.revenue) || 0),
      0
    );
    const { data: allLedger } = await supabase
      .from("cash_ledger")
      .select("type, amount")
      .gte("date", startedOn);
    const moved = ((allLedger ?? []) as { type: string; amount: number }[]).reduce(
      (s, l) => s + (l.type === "in" ? 1 : -1) * (Number(l.amount) || 0),
      0
    );
    onHand = startedWith + takings + moved;
  }

  // ---- utang -----------------------------------------------------------
  const receivables: Receivable[] = ((receivableRows ?? []) as {
    id: string;
    date: string;
    customer: string | null;
    phone: string | null;
    amount: number;
    amount_collected: number;
    collected: boolean;
    note: string | null;
  }[]).map((r) => ({
    id: r.id,
    date: r.date,
    customer: r.customer,
    phone: r.phone,
    amount: Number(r.amount) || 0,
    collected: Number(r.amount_collected) || 0,
    settled: r.collected,
    note: r.note,
  }));
  const owed = receivables
    .filter((r) => !r.settled)
    .reduce((s, r) => s + (r.amount - r.collected), 0);

  // ---- payback ---------------------------------------------------------
  const assets: Asset[] = ((assetRows ?? []) as {
    id: string;
    name: string;
    amount: number;
    bought_on: string | null;
    note: string | null;
  }[]).map((a) => ({
    id: a.id,
    name: a.name,
    amount: Number(a.amount) || 0,
    boughtOn: a.bought_on,
    note: a.note,
  }));
  const assetTotal = assets.reduce((s, a) => s + a.amount, 0);

  let payback: MoneyPicture["payback"] = null;
  const from = settingsRow?.payback_from ?? null;
  if (from && assetTotal > 0) {
    const [{ data: since0 }, { data: waste0 }] = await Promise.all([
      supabase
        .from("orders")
        .select("date, revenue, cogs")
        .gte("date", from)
        .neq("status", "cancelled"),
      supabase.from("waste_log").select("total_cost").gte("date", from),
    ]);
    const rows = (since0 ?? []) as { date: string; revenue: number; cogs: number }[];
    const gross = rows.reduce(
      (s, o) => s + (Number(o.revenue) || 0) - (Number(o.cogs) || 0),
      0
    );
    const days = new Set(rows.map((o) => o.date)).size;
    const w = ((waste0 ?? []) as { total_cost: number }[]).reduce(
      (s, x) => s + (Number(x.total_cost) || 0),
      0
    );
    const earned = gross - dailyOE * days - w;
    payback = {
      from,
      earned,
      pct: assetTotal > 0 ? Math.max(0, (earned / assetTotal) * 100) : 0,
      paidOff: earned >= assetTotal,
    };
  }

  return {
    fixedCosts,
    monthlyFixed,
    openDays,
    dailyOE,
    marginRatio,
    monthlyWasteRate,
    breakEvenDaily,
    avgDailyRevenue,
    windowDays,
    revenue,
    cogs,
    grossProfit,
    oeForWindow,
    wasteForWindow,
    netProfit,
    cash: { enabled: cashEnabled, onHand, startedOn, startedWith },
    ledger,
    receivables,
    owed,
    assets,
    assetTotal,
    payback,
  };
}
