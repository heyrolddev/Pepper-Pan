/**
 * Bills that move, and the arithmetic that lets break-even survive them.
 *
 * A recurring bill used to be one number. Kuryente: ₱2,000. That number is
 * wrong eleven months of the year and nobody can tell which eleven, because
 * the screen holding it has no memory — editing it destroys the only evidence
 * that it ever said anything else.
 *
 * Recording a figure per month fixes the history, and immediately breaks
 * break-even, which needs ONE monthly number to divide by the trading days.
 * Which month? The owner picked the average of the last three recorded, and
 * the reason is worth keeping: a single month makes the daily target lurch
 * every time a bill lands, and a shop that re-learns its own break-even every
 * thirty days has effectively been told nothing.
 *
 * ── The trap in "the last three months" ──────────────────────────────────
 *
 * The obvious reading is the last three CALENDAR months, summed. It is wrong
 * in a way that gets worse the better the shop is at recording: on the 3rd of
 * September, kuryente has arrived and tubig has not. Summing by calendar
 * month puts a zero where tubig should be, so break-even drops on the day the
 * owner does the bookkeeping — the number falls because MORE was recorded.
 *
 * So the average is taken per bill, over that bill's OWN last three recorded
 * months. A missing September for tubig means tubig averages June–August and
 * says so; it never contributes a zero it has no evidence for. The totals
 * below are sums of those per-bill figures, never of a calendar column.
 *
 * ── And a bill with no history at all ────────────────────────────────────
 *
 * Falls back to `fixed_costs.amount`, marked `estimate`. Nothing is
 * backfilled into `monthly_bills` (see migration 0058), so a shop that has
 * only ever typed flat figures keeps exactly the break-even it had, and each
 * bill upgrades itself to `average` the first month somebody records a real
 * one.
 */

/** How many recorded months the break-even figure averages over. */
export const AVERAGE_MONTHS = 3;

/** The bills themselves — one row per thing that arrives every month. */
export const BILL_KINDS = ["utility", "rent", "wage", "overhead", "misc"] as const;
export type BillKindName = (typeof BILL_KINDS)[number];

export const BILL_KIND_LABEL: Record<BillKindName, string> = {
  utility: "Utility",
  rent: "Rent",
  wage: "Sweldo",
  overhead: "Overhead",
  misc: "Miscellaneous",
};

export const BILL_KIND_HINT: Record<BillKindName, string> = {
  utility: "Kuryente, tubig, wifi — the ones that move with how much you use.",
  rent: "The space. Usually the same every month, which is why a jump matters.",
  wage: "Sweldo and allowances that arrive monthly.",
  overhead: "Permits, insurance, subscriptions — regular, not consumption.",
  misc: "Anything else that comes every month and fits nowhere above.",
};

export function isBillKind(v: unknown): v is BillKindName {
  return typeof v === "string" && (BILL_KINDS as readonly string[]).includes(v);
}

/** A recurring bill: the thing, not the amount. */
export type Bill = {
  id: string;
  label: string;
  kind: BillKindName;
  /** What to assume until a real month is recorded. See migration 0058. */
  estimate: number;
  active: boolean;
};

/** What one bill actually came to in one month. */
export type BillMonth = {
  id: string;
  billId: string;
  /** Always the first of the month, per the check constraint in 0058. */
  month: string;
  amount: number;
  note: string | null;
};

export type MonthAmount = { month: string; amount: number };
/** A recorded month, carrying the row id so the screen can correct or remove it. */
export type RecordedMonth = MonthAmount & { id: string };

export type BillLine = {
  id: string;
  label: string;
  kind: BillKindName;
  active: boolean;
  /** The figure break-even uses. */
  monthly: number;
  /** Where `monthly` came from — an estimate says so out loud. */
  basis: "average" | "estimate";
  /** Recorded months that went into the average. 0 when estimating. */
  monthsAveraged: number;
  /** Every recorded month, newest first. The history. */
  history: RecordedMonth[];
  /** This calendar month's entry, or null if nothing is recorded for it yet. */
  thisMonth: number | null;
  /**
   * Movement between the two most recent RECORDED months, as a ratio.
   *
   * Recorded, not calendar: on the 3rd of the month most bills have not
   * arrived, and comparing an empty September against August would report
   * every bill as down 100% — an alarming, confident, meaningless figure.
   * Null when there is nothing honest to compare.
   */
  change: number | null;
  /** The month `change` compares against, for a label that names it. */
  changeFrom: string | null;
};

// ---- months as strings ---------------------------------------------------
//
// Deliberately not `Date`. A date-only string parsed by `new Date()` is UTC
// midnight, and in Manila that is 8am the same day — but the reverse trip
// through any local-time formatter lands on the day BEFORE for anyone west of
// Greenwich. Month arithmetic on a billing period has no business being
// timezone-sensitive, so none of it goes near a Date.

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The first of the month an ISO date falls in: "2026-09-14" → "2026-09-01". */
export function monthOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Months forward (or, negative, back). Handles the year boundary. */
export function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const total = year * 12 + index + by;
  // Floor, not truncation: `-1 / 12` truncates to 0 and would put December
  // of 1 BC in the year 0.
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

/** "2026-09-01" → "September 2026". */
export function monthLabel(month: string): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  return name ? `${name} ${month.slice(0, 4)}` : month;
}

/** "2026-09-01" → "Sep 2026", for a row that has to fit on a phone. */
export function shortMonth(month: string): string {
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  return name ? `${name.slice(0, 3)} ${month.slice(0, 4)}` : month;
}

// ---- the lines -----------------------------------------------------------

function cleanAmount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * One line per bill, with its history, its trend, and the figure break-even
 * should use for it.
 *
 * `today` is passed in rather than read from the clock so this is testable
 * and so a server render and a client render of the same page cannot
 * disagree about what month it is.
 */
export function billLines(bills: Bill[], months: BillMonth[], today: string): BillLine[] {
  const now = monthOf(today);
  const byBill = new Map<string, RecordedMonth[]>();
  for (const m of months) {
    const list = byBill.get(m.billId);
    const entry = { id: m.id, month: m.month, amount: cleanAmount(Number(m.amount)) };
    if (list) list.push(entry);
    else byBill.set(m.billId, [entry]);
  }

  return bills.map((b) => {
    const history = (byBill.get(b.id) ?? [])
      .slice()
      .sort((a, z) => (a.month < z.month ? 1 : a.month > z.month ? -1 : 0));

    const window = history.slice(0, AVERAGE_MONTHS);
    const estimate = cleanAmount(Number(b.estimate));
    const monthly =
      window.length > 0
        ? window.reduce((s, m) => s + m.amount, 0) / window.length
        : estimate;

    // Two recorded months, and the older one has to be above zero — a rise
    // from ₱0 is division by zero, and "up ∞%" helps nobody.
    const [newest, before] = history;
    const comparable = history.length >= 2 && before.amount > 0;

    return {
      id: b.id,
      label: b.label,
      kind: b.kind,
      active: b.active,
      monthly,
      basis: window.length > 0 ? "average" : "estimate",
      monthsAveraged: window.length,
      history,
      thisMonth: history.find((m) => m.month === now)?.amount ?? null,
      change: comparable ? (newest.amount - before.amount) / before.amount : null,
      changeFrom: comparable ? before.month : null,
    };
  });
}

/** What the bills come to in a month — the figure break-even divides. */
export function monthlyTotal(lines: BillLine[]): number {
  return lines.filter((l) => l.active).reduce((s, l) => s + l.monthly, 0);
}

/**
 * The bill total for each of the last `count` calendar months, newest first.
 *
 * This one IS a calendar column, and it is allowed to be: it is the history
 * chart, which is asking "what did the shop actually pay in August" — a
 * question a missing entry answers honestly by making the bar shorter. It is
 * never used for break-even, where the same gap would be a lie.
 */
export function monthTotals(months: BillMonth[], count: number, today: string): MonthAmount[] {
  const now = monthOf(today);
  const sum = new Map<string, number>();
  for (const m of months) {
    sum.set(m.month, (sum.get(m.month) ?? 0) + cleanAmount(Number(m.amount)));
  }
  const out: MonthAmount[] = [];
  for (let i = 0; i < Math.max(0, count); i += 1) {
    const month = shiftMonth(now, -i);
    out.push({ month, amount: sum.get(month) ?? 0 });
  }
  return out;
}

/**
 * Which bills have nothing recorded for a given month.
 *
 * The one thing a per-month system has that a flat figure did not: it can
 * tell you what you have not entered yet. Without this the screen looks
 * complete the moment one bill is typed in.
 */
export function missingFor(lines: BillLine[], month: string): BillLine[] {
  return lines.filter((l) => l.active && !l.history.some((h) => h.month === month));
}
