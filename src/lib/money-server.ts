import "server-only";
import { orderLabel } from "@/lib/tickets";
import { createAdminClient } from "@/lib/supabase/admin";
import { newestFirst } from "@/lib/ledger-order";
import {
  monthlyRunningRate,
  tankLife,
  type RunningCost,
  type SpendKind,
  type TankLife,
} from "@/lib/spending";

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
  /**
   * Whether this line was typed in or worked out from a sale.
   *
   * The balance always counted cash sales — see `onHand` below — but the
   * history only ever listed `cash_ledger`, the rows somebody entered by
   * hand. So the number moved and nothing on screen said why, which is the
   * exact shape of a figure nobody trusts.
   *
   * Sales are not written into `cash_ledger` to fix that. They are derived at
   * read time, because a sale is already a row in `orders` and copying it
   * would mean two sources of truth for the same peso — and the balance would
   * count it twice the moment anything went slightly wrong.
   */
  derived?: boolean;
  /** Who was on the till. Only ever set on a derived line. */
  by?: string | null;
  /**
   * When it was written, to the second.
   *
   * Only ever a tie-breaker for reading order inside one day — `date` remains
   * the accounting day and every balance is computed from that. Absent on
   * rows written before migration 0045, which sort last within their day
   * rather than wrongly first.
   */
  at?: string | null;
};
/** A delivery or a purchase taken on utang, and how much of it is still owed. */
export type Debt = {
  id: string;
  supplierName: string | null;
  description: string;
  amount: number;
  paid: number;
  incurredOn: string;
  source: string;
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
  /**
   * Supplies, gas and repairs, as a monthly rate.
   *
   * Break-even was computed from fixed costs and spoilage alone, which left
   * everything the shop consumes but does not cook out of the sum entirely —
   * paper towels, alcohol, a gas refill, a wok repair. The figure was
   * therefore too low, every day, and nothing on screen could have shown it
   * because the sum it appeared in was self-consistent.
   */
  monthlyRunningRate: number;
  runningCosts: RunningCost[];
  runningForWindow: number;
  /** How long each size of gas tank actually lasts this shop. */
  tanks: TankLife[];
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
  /**
   * The e-wallet, counted the same way as the drawer and kept apart from it.
   *
   * Separate on purpose: the drawer's value is that it can be checked against
   * a physical count, and folding in a balance nobody can count would destroy
   * that. `total` is what the shop holds across both.
   */
  gcash: { enabled: boolean; onHand: number; startedOn: string | null; startedWith: number };
  /**
   * The bank, if the shop has one. Counted exactly like the other two:
   * opening figure, plus transfers taken at the till, plus what the owner
   * records moving.
   */
  bank: { enabled: boolean; onHand: number; startedOn: string | null; startedWith: number };
  /** Every pot that is actually being counted, added together. */
  totalHeld: number;
  ledger: LedgerEntry[];
  receivables: Receivable[];
  owed: number;

  /**
   * What the shop owes its suppliers — the opposite direction to `owed`.
   *
   * `totalHeld` does not subtract it, deliberately: the pesos really are in
   * the drawer, and a balance that quietly nets off a debt can no longer be
   * checked against a physical count. The screen shows both figures and the
   * subtraction, so the owner sees what is there and what is actually theirs.
   */
  debts: Debt[];
  owedToSuppliers: number;

  assets: Asset[];
  assetTotal: number;
  payback: { from: string | null; earned: number; pct: number; paidOff: boolean } | null;
};

const WINDOW_DAYS = 30;

/**
 * How far back to read gas refills.
 *
 * Longer than the break-even window because the two answer different
 * questions. Break-even wants recent spending; "how long does a tank last"
 * wants enough refills to have an interval at all, and at roughly three
 * weeks a tank, thirty days is barely more than one.
 */
const GAS_WINDOW_DAYS = 180;

export async function loadMoney(): Promise<MoneyPicture> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const gasSince = new Date(Date.now() - GAS_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: costs },
    { data: assetRows },
    { data: ledgerRows },
    { data: receivableRows },
    { data: settingsRow },
    { data: orderRows },
    { data: wasteRows },
    { data: runningRows },
    { data: gasRows },
    { data: debtRows },
  ] = await Promise.all([
    supabase.from("fixed_costs").select("*").order("amount", { ascending: false }),
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
    supabase
      .from("cash_ledger")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("receivables").select("*").order("date", { ascending: false }).limit(100),
    supabase
      .from("settings")
      .select(
        "open_days_per_month, cash_balance_enabled, cash_balance_starting_amount, cash_balance_start_date, gcash_balance_enabled, gcash_balance_starting_amount, gcash_balance_start_date, bank_balance_enabled, bank_balance_starting_amount, bank_balance_start_date, payback_from"
      )
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("date, revenue, cogs, status, payment_method")
      .gte("date", since),
    supabase.from("waste_log").select("date, total_cost").gte("date", since),
    // Supplies, gas and repairs over the same window the margin is measured
    // in, so break-even adds like-for-like figures.
    supabase
      .from("running_costs")
      .select("id, label, kind, amount, size_label, spent_on, note, suppliers(name)")
      .gte("spent_on", since)
      .order("spent_on", { ascending: false }),
    // Gas goes back further than the break-even window on purpose: two
    // refills is the minimum that says anything about how long a tank lasts,
    // and at three weeks a tank that is barely two windows old.
    supabase
      .from("running_costs")
      .select("id, label, kind, amount, size_label, spent_on")
      .eq("kind", "gas")
      .gte("spent_on", gasSince)
      .order("spent_on", { ascending: false }),
    supabase
      .from("supplier_debts")
      .select("id, supplier_name, description, amount, paid, incurred_on, source, note")
      .order("incurred_on", { ascending: false })
      .limit(100),
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

  /**
   * Supplies, gas and repairs — the third thing break-even has to cover.
   *
   * Mapped out of the join shape Supabase returns rather than used raw, so
   * `tankLife` and everything downstream see one flat type whatever the query
   * happens to look like.
   */
  const runningCosts: RunningCost[] = (
    (runningRows ?? []) as {
      id: string;
      label: string;
      kind: string;
      amount: number;
      size_label: string | null;
      spent_on: string;
      note: string | null;
      suppliers: { name: string } | { name: string }[] | null;
    }[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind as SpendKind,
    amount: Number(r.amount) || 0,
    sizeLabel: r.size_label,
    spentOn: r.spent_on,
    supplierName: Array.isArray(r.suppliers)
      ? (r.suppliers[0]?.name ?? null)
      : (r.suppliers?.name ?? null),
    note: r.note,
  }));
  const runningForWindow = runningCosts.reduce((s, r) => s + r.amount, 0);
  // Scaled by the calendar window it was measured over, not by trading days —
  // see `monthlyRunningRate` for why these two differ from spoilage.
  const monthlyRunning = monthlyRunningRate(runningCosts, WINDOW_DAYS);

  const tanks = tankLife(
    ((gasRows ?? []) as {
      id: string;
      label: string;
      kind: string;
      amount: number;
      size_label: string | null;
      spent_on: string;
    }[]).map((r) => ({
      id: r.id,
      label: r.label,
      kind: "gas" as const,
      amount: Number(r.amount) || 0,
      sizeLabel: r.size_label,
      spentOn: r.spent_on,
      supplierName: null,
      note: null,
    })),
    today
  );

  const marginRatio = revenue > 0 ? grossProfit / revenue : null;
  // Three things to cover now, not two. Running costs were missing entirely,
  // which made this figure lower than the truth every single day — and
  // invisibly so, because the sum was internally consistent.
  const breakEvenDaily =
    marginRatio !== null && marginRatio > 0 && monthlyFixed > 0
      ? (monthlyFixed + monthlyWasteRate + monthlyRunning) / marginRatio / openDays
      : null;

  const oeForWindow = dailyOE * windowDays;
  // Running costs come out here as well. They were spent in this window and
  // nothing was left of them, which is exactly what a cost is.
  const netProfit = grossProfit - oeForWindow - wasteForWindow - runningForWindow;

  // ---- cash ------------------------------------------------------------
  const typedIn: LedgerEntry[] = (
    (ledgerRows ?? []) as (LedgerEntry & { created_at?: string })[]
  ).map((l) => ({
    ...l,
    amount: Number(l.amount) || 0,
    // Migration 0045. Null on every row written before it, which sorts those
    // last within their day rather than wrongly first.
    at: l.created_at ?? null,
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
    // `.eq("account", "cash")` is load-bearing, not tidiness. Since migration
    // 0042 a ledger line says which pot it moved, and restocking paid by
    // GCash writes one — unfiltered, that spend would come straight out of
    // the drawer figure, which is money that never left the drawer.
    const { data: allLedger } = await supabase
      .from("cash_ledger")
      .select("type, amount")
      .eq("account", "cash")
      .gte("date", startedOn);
    const moved = ((allLedger ?? []) as { type: string; amount: number }[]).reduce(
      (s, l) => s + (l.type === "in" ? 1 : -1) * (Number(l.amount) || 0),
      0
    );
    onHand = startedWith + takings + moved;
  }

  // ---- the e-wallet ----------------------------------------------------
  /**
   * The same arithmetic as the drawer, on the other pot.
   *
   * Off until the owner says what was in it and from when, for the same
   * reason the drawer is: without a starting point this would be every GCash
   * sale since the shop opened, which is not a balance — it is a total, and
   * it would only ever climb.
   */
  const gcashEnabled = Boolean(settingsRow?.gcash_balance_enabled);
  const gcashStartedOn = settingsRow?.gcash_balance_start_date ?? null;
  const gcashStartedWith = Number(settingsRow?.gcash_balance_starting_amount) || 0;

  let gcashOnHand = 0;
  if (gcashEnabled && gcashStartedOn) {
    const { data: gcashSales } = await supabase
      .from("orders")
      .select("revenue")
      .gte("date", gcashStartedOn)
      .eq("payment_method", "gcash")
      .neq("status", "cancelled");
    const takings = ((gcashSales ?? []) as { revenue: number }[]).reduce(
      (s, o) => s + (Number(o.revenue) || 0),
      0
    );
    const { data: gcashLedger } = await supabase
      .from("cash_ledger")
      .select("type, amount")
      .eq("account", "gcash")
      .gte("date", gcashStartedOn);
    const moved = ((gcashLedger ?? []) as { type: string; amount: number }[]).reduce(
      (s, l) => s + (l.type === "in" ? 1 : -1) * (Number(l.amount) || 0),
      0
    );
    gcashOnHand = gcashStartedWith + takings + moved;
  }

  // ---- the bank --------------------------------------------------------
  const bankEnabled = Boolean(settingsRow?.bank_balance_enabled);
  const bankStartedOn = settingsRow?.bank_balance_start_date ?? null;
  const bankStartedWith = Number(settingsRow?.bank_balance_starting_amount) || 0;

  let bankOnHand = 0;
  if (bankEnabled && bankStartedOn) {
    // Bank transfers ARE a thing now — the till takes them — so this counts
    // sales the same way the other two pots do. It did not when the pot was
    // added, because there was no way to record one.
    const { data: bankSales } = await supabase
      .from("orders")
      .select("revenue")
      .gte("date", bankStartedOn)
      .eq("payment_method", "bank")
      .neq("status", "cancelled");
    const takings = ((bankSales ?? []) as { revenue: number }[]).reduce(
      (s, o) => s + (Number(o.revenue) || 0),
      0
    );
    const { data: bankLedger } = await supabase
      .from("cash_ledger")
      .select("type, amount")
      .eq("account", "bank")
      .gte("date", bankStartedOn);
    const moved = ((bankLedger ?? []) as { type: string; amount: number }[]).reduce(
      (s, l) => s + (l.type === "in" ? 1 : -1) * (Number(l.amount) || 0),
      0
    );
    bankOnHand = bankStartedWith + takings + moved;
  }

  /**
   * Every cash sale and every cancelled cash sale, as lines in the history.
   *
   * This is display only — the arithmetic above is untouched — which is what
   * makes it safe: nothing is double-counted, nothing needs backfilling, and
   * orders from before today show up straight away.
   *
   * A cancelled cash order gets an "out" line rather than being left off.
   * Leaving it off is technically consistent — `onHand` excludes it because
   * the query filters cancelled rows — but it means money appears in the
   * drawer one day and is silently gone the next. An owner looking for a
   * shortfall needs to see the reversal and whose till it was on.
   */
  const derivedLines: LedgerEntry[] = [];
  if (cashEnabled && startedOn) {
    const { data: cashOrders } = await supabase
      .from("orders")
      .select(
        "id, ticket, date, revenue, status, contact_name, logged_by, tag, cancelled_by, created_at"
      )
      .gte("date", startedOn)
      .eq("payment_method", "cod")
      .order("date", { ascending: false })
      .limit(200);

    const rows = (cashOrders ?? []) as {
      id: string;
      ticket: number | null;
      date: string;
      revenue: number;
      status: string;
      contact_name: string | null;
      logged_by: string | null;
      tag: string | null;
      cancelled_by: string | null;
      created_at: string;
    }[];

    // Who cancelled, by name. `cancelled_by` is stamped at the moment of
    // cancelling — unlike `logged_by`, which says who rang the sale up — so
    // this is the one attribution a reversal can carry honestly.
    const cancellerIds = [...new Set(rows.map((o) => o.cancelled_by).filter(Boolean))] as string[];
    const cancellerName = new Map<string, string>();
    if (cancellerIds.length > 0) {
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", cancellerIds);
      for (const p of (people ?? []) as { id: string; full_name: string | null }[]) {
        if (p.full_name?.trim()) cancellerName.set(p.id, p.full_name.trim());
      }
    }

    for (const o of rows) {
      const amount = Number(o.revenue) || 0;
      if (amount === 0) continue;
      const who = o.logged_by?.trim() || null;
      const what = `${o.tag === "walk-in" ? "Counter sale" : "Order"} ${orderLabel(o.ticket, o.contact_name)}`;
      derivedLines.push(
        o.status === "cancelled"
          ? {
              id: `order-void-${o.id}`,
              date: o.date,
              type: "out",
              amount,
              category: "sale",
              /**
               * Named from `cancelled_by`, and only from `cancelled_by`.
               *
               * It briefly used `logged_by`, which is stamped when the sale is
               * RUNG UP — so it put the cancellation on whoever was on the
               * till at the time, very often not the person who cancelled it.
               * A confident wrong name is worse than no name: it sends the
               * owner to ask the wrong person about missing money. Orders
               * cancelled before this column existed simply have no name, and
               * say nothing rather than guessing.
               */
              note:
                `${what} cancelled` +
                (o.cancelled_by && cancellerName.has(o.cancelled_by)
                  ? ` by ${cancellerName.get(o.cancelled_by)}`
                  : ""),
              derived: true,
              by: o.cancelled_by ? (cancellerName.get(o.cancelled_by) ?? null) : null,
              at: o.created_at,
            }
          : {
              id: `order-${o.id}`,
              date: o.date,
              type: "in",
              amount,
              category: "sale",
              // Safe on the sale line: `logged_by` is exactly who took it.
              note: `${what}${who ? ` · took by ${who}` : ""}`,
              derived: true,
              by: who,
              at: o.created_at,
            }
      );
    }
  }

  /**
   * Newest first — and within a day, newest first too.
   *
   * `newestFirst` and its reasoning live in `lib/ledger-order.ts` so the
   * comparator that got this wrong can be tested on its own. The short of it:
   * sorting on `date` alone tied every line written on the same day, and a
   * stable sort then read them back in assembly order — every typed row
   * first, every sale second, whatever time either happened.
   */
  const ledger: LedgerEntry[] = [...typedIn, ...derivedLines].sort(newestFirst);

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

  // ---- what the shop owes ----------------------------------------------
  const debts: Debt[] = ((debtRows ?? []) as {
    id: string;
    supplier_name: string | null;
    description: string;
    amount: number;
    paid: number;
    incurred_on: string;
    source: string;
    note: string | null;
  }[]).map((d) => ({
    id: d.id,
    supplierName: d.supplier_name,
    description: d.description,
    amount: Number(d.amount) || 0,
    paid: Number(d.paid) || 0,
    incurredOn: d.incurred_on,
    source: d.source,
    note: d.note,
  }));
  const owedToSuppliers = debts.reduce((s, d) => s + Math.max(0, d.amount - d.paid), 0);

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
    gcash: {
      enabled: gcashEnabled,
      onHand: gcashOnHand,
      startedOn: gcashStartedOn,
      startedWith: gcashStartedWith,
    },
    // Only pots that are switched on. A zero from a pot nobody is counting is
    // not a balance of nothing, it is the absence of an answer, and adding it
    // in would present a guess as a total.
    bank: {
      enabled: bankEnabled,
      onHand: bankOnHand,
      startedOn: bankStartedOn,
      startedWith: bankStartedWith,
    },
    totalHeld:
      (cashEnabled ? onHand : 0) +
      (gcashEnabled ? gcashOnHand : 0) +
      (bankEnabled ? bankOnHand : 0),
    monthlyRunningRate: monthlyRunning,
    runningCosts,
    runningForWindow,
    tanks,
    ledger,
    receivables,
    owed,
    debts,
    owedToSuppliers,
    assets,
    assetTotal,
    payback,
  };
}
