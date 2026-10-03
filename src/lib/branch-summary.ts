/**
 * How each branch is doing, side by side.
 *
 * The one question the Branches tab exists to answer: is this branch
 * working, growing, moving or failing. Pure arithmetic over rows the server
 * has already fetched, so it is testable without a database.
 */

export type BranchSale = {
  branchId: string;
  date: string;
  revenue: number;
  /** A cancellation or a void. Neither is money the shop took. */
  cancelled: boolean;
};

export type BranchSummary = {
  branchId: string;
  /** Takings over the window, net of nothing — this is what came in. */
  takings: number;
  orders: number;
  averageTicket: number;
  /** The same window immediately before, for the comparison. */
  prevTakings: number;
  /**
   * Change against that window, as a fraction. Null when there is nothing
   * to compare against — a branch's first week has no "before", and showing
   * +100% for it would be a number invented by the arithmetic.
   */
  change: number | null;
  /** Days in the window that took at least one peso. */
  tradingDays: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Summarise one branch over a window and the window before it.
 *
 * `from` and `to` are inclusive shop days, `YYYY-MM-DD`. The previous window
 * is the same length, ending the day before `from` — equal lengths, because
 * nine days against thirty-one is made entirely of true numbers and tells a
 * lie about the shop.
 */
export function summariseBranch(
  sales: BranchSale[],
  branchId: string,
  from: string,
  to: string,
  prevFrom: string
): BranchSummary {
  const live = sales.filter((s) => s.branchId === branchId && !s.cancelled);

  const inWindow = live.filter((s) => s.date >= from && s.date <= to);
  const before = live.filter((s) => s.date >= prevFrom && s.date < from);

  const takings = money(inWindow.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0));
  const prevTakings = money(before.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0));

  return {
    branchId,
    takings,
    orders: inWindow.length,
    averageTicket: inWindow.length > 0 ? money(takings / inWindow.length) : 0,
    prevTakings,
    // Dividing by zero would read as infinite growth; a branch with no
    // history has no trend, and saying so is the honest answer.
    change: prevTakings > 0 ? (takings - prevTakings) / prevTakings : null,
    tradingDays: new Set(inWindow.filter((s) => s.revenue > 0).map((s) => s.date)).size,
  };
}

/**
 * What the booth takes on a night it opens.
 *
 * Takings divided by DAYS OPEN, not by days in the window. El Mercado trades
 * three nights a week: dividing its week by seven would make a healthy booth
 * look like it is limping, and would make it look worse than Apalit for no
 * reason other than being shut on a Tuesday on purpose.
 */
export function perTradingDay(s: BranchSummary): number {
  return s.tradingDays > 0 ? money(s.takings / s.tradingDays) : 0;
}
