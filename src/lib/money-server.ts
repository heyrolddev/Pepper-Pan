import "server-only";
import { orderLabel } from "@/lib/tickets";
import { isVoided } from "@/lib/order-void";
import { createAdminClient } from "@/lib/supabase/admin";
import { newestFirst } from "@/lib/ledger-order";
import { shopToday } from "@/lib/format-date";
import { supplyLife, type ItemLife } from "@/lib/supply-life";
import {
  monthlyRunningRate,
  tankLife,
  type RunningCost,
  type SpendKind,
  type TankLife,
} from "@/lib/spending";
import { isAccount, type Account } from "@/lib/money-accounts";
import {
  billLines,
  isBillKind,
  monthOf,
  monthTotals,
  monthlyTotal,
  shiftMonth,
  type Bill,
  type BillLine,
  type BillMonth,
  type MonthAmount,
} from "@/lib/monthly-bills";

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

/**
 * A recurring bill, as the screen that manages the LIST sees it.
 *
 * `amount` is no longer what the bill is — migration 0058 turned it into the
 * figure to assume until a real month is recorded against it. Everything that
 * reports a bill reads `bills` below instead, which carries the months.
 */
export type FixedCost = {
  id: string;
  label: string;
  amount: number;
  active: boolean;
  kind: string;
};
export type Asset = { id: string; name: string; amount: number; boughtOn: string | null; note: string | null };
export type LedgerEntry = {
  id: string;
  date: string;
  /**
   * `void` moved nothing. See `Movement` in lib/pot-history.ts for the bug
   * that put it here: a cancelled cash sale was listed as an "out" for its
   * full value, so a day with two cancellations and no trade read "In ₱0 ·
   * Out ₱269 · −₱269" against a drawer that had not moved.
   */
  type: "in" | "out" | "void";
  amount: number;
  category: string | null;
  note: string | null;
  /**
   * Which pot the line moved.
   *
   * `cash_ledger` gained this column in 0042 and every balance has filtered
   * on it since — but the list read for the HISTORY never did, so a GCash
   * transfer appeared in the drawer's own history while being correctly left
   * out of the drawer's total. The one list in HQ whose whole job is to
   * explain a balance was showing lines that balance does not contain.
   */
  account: Account;
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
  /** Every recurring bill, with its recorded months, its trend and its figure. */
  bills: BillLine[];
  /** What the bills came to each of the last `BILL_HISTORY_MONTHS` months. */
  billHistory: MonthAmount[];
  /** The month the screen opens on — the first of the current one. */
  thisMonth: string;
  /**
   * The shop's today, as the database files a day.
   *
   * Sent from the server rather than read from the browser clock. The pot
   * histories open on today, and a client that works it out itself opens on
   * the wrong day for the first eight hours of every Manila morning — see
   * `shopToday` for why the boundary is where it is.
   */
  today: string;
  /**
   * The bills as one monthly figure, for break-even.
   *
   * Since 0058 this is a sum of per-bill averages rather than a sum of typed
   * figures — see `lib/monthly-bills.ts` for why it cannot be a calendar
   * column without falling every time somebody does the bookkeeping.
   */
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
  /** Every supply the shop buys, and what its own history says it lasts. */
  supplies: ItemLife[];
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

/**
 * How many months of bill history the page draws.
 *
 * Twelve, because the thing an owner is actually looking for in a utility
 * bill is the season — kuryente in April is not kuryente in November, and a
 * six-month window makes a perfectly normal summer look like a crisis.
 */
export const BILL_HISTORY_MONTHS = 12;

export async function loadMoney(): Promise<MoneyPicture> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const gasSince = new Date(Date.now() - GAS_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  /* The shop's day, not the server's.

     This one reaches further than it looks: `today` is what `tankLife` counts
     days-to-go from, and what `billLines` calls the current month. Eight
     hours out at a month boundary means the panel opens on the wrong month
     and reports last month's bills as "not entered yet". */
  const today = shopToday();

  const [
    { data: costs },
    { data: billRows },
    { data: assetRows },
    { data: ledgerRows },
    { data: receivableRows },
    { data: settingsRow },
    { data: orderRows },
    { data: wasteRows },
    { data: runningRows },
    { data: gasRows },
    { data: supplyRows },
    { data: debtRows },
  ] = await Promise.all([
    supabase.from("fixed_costs").select("*").order("amount", { ascending: false }),
    // Far enough back that a year-on-year comparison has something to stand
    // on, and cheap: one row per bill per month is a few hundred rows for a
    // stall that has been open a decade.
    supabase
      .from("monthly_bills")
      .select("id, fixed_cost_id, month, amount, note")
      .gte("month", shiftMonth(monthOf(today), -(BILL_HISTORY_MONTHS + 12)))
      .order("month", { ascending: false }),
    supabase.from("assets").select("*").order("created_at", { ascending: false }),
    // 250, not 100. Since the pots each got their own history this one list
    // is sliced three ways, so a hundred rows could be a hundred drawer
    // entries and nothing at all for GCash — a pot's history going empty
    // because a DIFFERENT pot was busy.
    supabase
      .from("cash_ledger")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250),
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
      .select("id, label, kind, amount, qty, size_label, spent_on, ran_out_on, note, ledger_id, suppliers(name)")
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
    /* How long things last reaches back over EVERYTHING, with no window at
       all, and that is the point of it. A pack of tissue bought in March and
       finished in September is one observation the shop waited six months to
       earn; a thirty-day window would throw it away the moment it became
       worth something. A mop still in use after two years is the same row
       the reorder warning is about. */
    supabase
      .from("running_costs")
      .select("id, label, amount, qty, size_label, spent_on, ran_out_on")
      .order("spent_on", { ascending: false })
      .limit(500),
    supabase
      .from("supplier_debts")
      .select("id, supplier_name, description, amount, paid, incurred_on, source, note")
      .order("incurred_on", { ascending: false })
      .limit(100),
  ]);

  /**
   * The bills, and what each of them actually came to.
   *
   * `fixed_costs` is the list; `monthly_bills` is the history. Adding them up
   * is not a `reduce` any more, because a bill with no entry this month must
   * not contribute a zero — `billLines` in `lib/monthly-bills.ts` carries the
   * whole argument and the tests that hold it in place.
   */
  const billList: Bill[] = ((costs ?? []) as FixedCost[]).map((c) => ({
    id: c.id,
    label: c.label,
    // Rows written before 0058 have the column default, and `isBillKind`
    // keeps a hand-edited value out of a Record lookup.
    kind: isBillKind(c.kind) ? c.kind : "overhead",
    estimate: Number(c.amount) || 0,
    active: c.active,
  }));
  const billMonths: BillMonth[] = ((billRows ?? []) as {
    id: string;
    fixed_cost_id: string;
    month: string;
    amount: number;
    note: string | null;
  }[]).map((b) => ({
    id: b.id,
    billId: b.fixed_cost_id,
    month: b.month,
    amount: Number(b.amount) || 0,
    note: b.note,
  }));

  const bills = billLines(billList, billMonths, today);
  const monthlyFixed = monthlyTotal(bills);
  const billHistory = monthTotals(billMonths, BILL_HISTORY_MONTHS, today);
  const thisMonth = monthOf(today);
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
      qty: number | null;
      size_label: string | null;
      spent_on: string;
      ran_out_on: string | null;
      note: string | null;
      ledger_id: string | null;
      suppliers: { name: string } | { name: string }[] | null;
    }[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind as SpendKind,
    amount: Number(r.amount) || 0,
    // Coalesced rather than trusted: a row written before 0065 read through
    // an older cached schema comes back without the column, and a qty of
    // undefined would divide a lifespan into NaN.
    qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
    sizeLabel: r.size_label,
    spentOn: r.spent_on,
    ranOutOn: r.ran_out_on ?? null,
    supplierName: Array.isArray(r.suppliers)
      ? (r.suppliers[0]?.name ?? null)
      : (r.suppliers?.name ?? null),
    note: r.note,
    ledgerId: r.ledger_id,
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
      qty: 1,
      sizeLabel: r.size_label,
      spentOn: r.spent_on,
      ranOutOn: null,
      supplierName: null,
      note: null,
      // The gas window reads fewer columns than the break-even one, because
      // `tankLife` only needs the dates and the sizes. No undo happens from
      // here, so the link is not fetched.
      ledgerId: null,
    })),
    today
  );

  /**
   * How long each thing the shop buys actually lasts.
   *
   * Unlike `tanks` above, none of this is inferred from the gaps between
   * purchases: it comes from the end dates the owner fills in when something
   * runs out. That is why it works for a pack of tissue bought three at a
   * time and for a bottle of Joy opened a month after it was bought, neither
   * of which a gap can describe.
   */
  const supplies = supplyLife(
    ((supplyRows ?? []) as {
      id: string;
      label: string;
      amount: number;
      qty: number | null;
      size_label: string | null;
      spent_on: string;
      ran_out_on: string | null;
    }[]).map((r) => ({
      id: r.id,
      label: r.label,
      sizeLabel: r.size_label,
      amount: Number(r.amount) || 0,
      qty: Number(r.qty) > 0 ? Number(r.qty) : 1,
      spentOn: r.spent_on,
      ranOutOn: r.ran_out_on ?? null,
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
    // Rows written before 0042 were all the drawer, which is what the
    // column's default backfilled — so a missing value can only mean cash.
    account: isAccount(l.account) ? l.account : "cash",
    // Migration 0045. Null on every row written before it, which sorts those
    // last within their day rather than wrongly first.
    at: l.created_at ?? null,
  }));
  /**
   * The three pot balances, in one round trip instead of six.
   *
   * This was six `await`s in a row — sales then ledger, for the drawer, then
   * for GCash, then for the bank — each waiting on the one before it for no
   * reason at all: a pot's arithmetic needs nothing from any other pot. On a
   * page the owner opens every day that is five round trips of pure waiting.
   *
   * The arithmetic itself is untouched, and the two rules that were written
   * out three times each still hold, now in one place:
   *
   *   A POT COUNTS ONLY ITS OWN SALES. Cash counts `cod`, GCash counts
   *   `gcash`, the bank counts `bank`. Count them together and the drawer
   *   reads permanently over by every GCash sale the shop ever took.
   *
   *   A POT COUNTS ONLY ITS OWN LEDGER LINES. `.eq("account", …)` is
   *   load-bearing, not tidiness: restocking paid by GCash writes a line, and
   *   unfiltered that spend would come out of the DRAWER — money that never
   *   left it.
   */
  const POTS_TO_COUNT = [
    {
      key: "cash" as const,
      method: "cod",
      enabled: Boolean(settingsRow?.cash_balance_enabled),
      from: settingsRow?.cash_balance_start_date ?? null,
      opening: Number(settingsRow?.cash_balance_starting_amount) || 0,
    },
    {
      key: "gcash" as const,
      method: "gcash",
      /**
       * Off until the owner says what was in it and from when, for the same
       * reason the drawer is: without a starting point this would be every
       * GCash sale since the shop opened, which is not a balance — it is a
       * total, and it would only ever climb.
       */
      enabled: Boolean(settingsRow?.gcash_balance_enabled),
      from: settingsRow?.gcash_balance_start_date ?? null,
      opening: Number(settingsRow?.gcash_balance_starting_amount) || 0,
    },
    {
      key: "bank" as const,
      method: "bank",
      // Bank transfers ARE a thing now — the till takes them — so this counts
      // sales the same way the other two pots do. It did not when the pot was
      // added, because there was no way to record one.
      enabled: Boolean(settingsRow?.bank_balance_enabled),
      from: settingsRow?.bank_balance_start_date ?? null,
      opening: Number(settingsRow?.bank_balance_starting_amount) || 0,
    },
  ];

  const potBalances = await Promise.all(
    POTS_TO_COUNT.map(async (pot) => {
      if (!pot.enabled || !pot.from) return 0;
      const [{ data: sales }, { data: ledger }] = await Promise.all([
        supabase
          .from("orders")
          .select("revenue")
          .gte("date", pot.from)
          .eq("payment_method", pot.method)
          .neq("status", "cancelled"),
        supabase
          .from("cash_ledger")
          .select("type, amount")
          .eq("account", pot.key)
          .gte("date", pot.from),
      ]);
      const takings = ((sales ?? []) as { revenue: number }[]).reduce(
        (s, o) => s + (Number(o.revenue) || 0),
        0
      );
      const moved = ((ledger ?? []) as { type: string; amount: number }[]).reduce(
        (s, l) => s + (l.type === "in" ? 1 : -1) * (Number(l.amount) || 0),
        0
      );
      return pot.opening + takings + moved;
    })
  );

  const [cashPot, gcashPot, bankPot] = POTS_TO_COUNT;
  const cashEnabled = cashPot.enabled;
  const startedOn = cashPot.from;
  const startedWith = cashPot.opening;
  const onHand = potBalances[0];

  const gcashEnabled = gcashPot.enabled;
  const gcashStartedOn = gcashPot.from;
  const gcashStartedWith = gcashPot.opening;
  const gcashOnHand = potBalances[1];

  const bankEnabled = bankPot.enabled;
  const bankStartedOn = bankPot.from;
  const bankStartedWith = bankPot.opening;
  const bankOnHand = potBalances[2];

  /**
   * Every sale, and every cancelled sale, as lines in the history — on all
   * three pots, not just the drawer.
   *
   * This block used to hard-code `payment_method = "cod"` and `account:
   * "cash"`. The balances had filtered by pot correctly since 0042, so the
   * GCash figure counted every GCash sale — and the HISTORY listed none of
   * them. The one screen whose job is to explain a balance could not name a
   * single peso of it, and an owner reconciling GCash had nothing to
   * reconcile against. That is the same bug the drawer had before sales were
   * derived at all; it simply survived in the other two pots.
   *
   * Still display only — the arithmetic above is untouched — which is what
   * makes it safe: nothing is double-counted, nothing needs backfilling, and
   * orders from before today show up straight away.
   *
   * A cancelled sale is listed rather than left off, but as a `void` — a
   * line that moved nothing. Leaving it off entirely is technically
   * consistent, since the balances exclude cancelled rows, but then a sale
   * somebody remembers ringing up is simply absent and nobody can tell a
   * cancellation from a lost ticket. Listing it as an "out" was the other
   * mistake, and the one that shipped: nothing was ever collected on a
   * cancelled cash order, so there was nothing to pay back out. The owner met
   * it on a day with no trade at all — two cancellations, and the day read
   * "In ₱0 · Out ₱269 · −₱269" for a drawer that had not moved a centavo.
   *
   * So the line is kept, dated and attributed, and it adds nothing to either
   * column. This has always been display only; now the display agrees with
   * the balance it sits under.
   */
  const derivedLines: LedgerEntry[] = [];

  /** Which sales land in which pot. `cod` is the word the database uses. */
  const SALES_INTO: { account: Account; method: string; enabled: boolean; from: string | null }[] = [
    { account: "cash", method: "cod", enabled: cashEnabled, from: startedOn },
    { account: "gcash", method: "gcash", enabled: gcashEnabled, from: gcashStartedOn },
    { account: "bank", method: "bank", enabled: bankEnabled, from: bankStartedOn },
  ];

  /**
   * Fetched per pot rather than in one query, and the limit is why.
   *
   * One `.in("payment_method", [...])` with `.limit(200)` gives 200 rows
   * across all three — so a busy week of cash sales would push GCash out of
   * its own history entirely, and the pot with the least activity would be
   * the one that disappeared. A limit per pot is a limit per question asked.
   */
  const orderSets = await Promise.all(
    SALES_INTO.map((pot) =>
      pot.enabled && pot.from
        ? supabase
            .from("orders")
            .select(
              "id, ticket, date, revenue, status, contact_name, logged_by, tag, cancelled_by, voided_at, created_at"
            )
            .gte("date", pot.from)
            .eq("payment_method", pot.method)
            .order("date", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as unknown[] })
    )
  );

  type SaleRow = {
    id: string;
    ticket: number | null;
    date: string;
    revenue: number;
    status: string;
    contact_name: string | null;
    logged_by: string | null;
    tag: string | null;
    cancelled_by: string | null;
    voided_at: string | null;
    created_at: string;
  };

  const saleRows: { account: Account; row: SaleRow }[] = [];
  orderSets.forEach((set, i) => {
    for (const row of ((set.data ?? []) as SaleRow[])) {
      saleRows.push({ account: SALES_INTO[i].account, row });
    }
  });

  // Who cancelled, by name. `cancelled_by` is stamped at the moment of
  // cancelling — unlike `logged_by`, which says who rang the sale up — so
  // this is the one attribution a reversal can carry honestly. Looked up once
  // for all three pots; the same person cancels on more than one of them.
  const cancellerIds = [
    ...new Set(saleRows.map((s) => s.row.cancelled_by).filter(Boolean)),
  ] as string[];
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

  for (const { account, row: o } of saleRows) {
    const amount = Number(o.revenue) || 0;
    if (amount === 0) continue;
    const who = o.logged_by?.trim() || null;
    const what = `${o.tag === "walk-in" ? "Counter sale" : "Order"} ${orderLabel(o.ticket, o.contact_name)}`;
    derivedLines.push(
      o.status === "cancelled"
        ? {
            id: `order-void-${o.id}`,
            date: o.date,
            type: "void",
            amount,
            account,
            category: "sale",
            /**
             * Named from `cancelled_by`, and only from `cancelled_by`.
             *
             * It briefly used `logged_by`, which is stamped when the sale is
             * RUNG UP — so it put the cancellation on whoever was on the till
             * at the time, very often not the person who cancelled it. A
             * confident wrong name is worse than no name: it sends the owner
             * to ask the wrong person about missing money. Orders cancelled
             * before this column existed simply have no name, and say nothing
             * rather than guessing.
             */
            /* "cancelled — nothing collected" rather than "cancelled",
               because the number beside it is the order's value and the one
               thing the reader must not conclude is that it left the pot. */
            /* A void says so, because the two are read differently at
               closing. "Cancelled" invites the owner to ask what happened
               to a customer; "voided" says the till was corrected and
               there is nobody to ask about. */
            note:
              `${what} ${isVoided(o) ? "voided" : "cancelled"}` +
              (o.cancelled_by && cancellerName.has(o.cancelled_by)
                ? ` by ${cancellerName.get(o.cancelled_by)}`
                : "") +
              " — nothing collected",
            derived: true,
            by: o.cancelled_by ? (cancellerName.get(o.cancelled_by) ?? null) : null,
            at: o.created_at,
          }
        : {
            id: `order-${o.id}`,
            date: o.date,
            type: "in",
            amount,
            account,
            category: "sale",
            // Safe on the sale line: `logged_by` is exactly who took it.
            note: `${what}${who ? ` · took by ${who}` : ""}`,
            derived: true,
            by: who,
            at: o.created_at,
          }
    );
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
    bills,
    billHistory,
    thisMonth,
    today,
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
    supplies,
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
