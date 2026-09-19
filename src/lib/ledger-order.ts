/**
 * What order the drawer's history reads in.
 *
 * Its own file, and tested, because this is where a real bug lived and the
 * shape of it is easy to reintroduce.
 *
 * The history used to sort on the accounting date alone. `cash_ledger.date`
 * is a DATE, so every line written on the same day compared EQUAL — and
 * `Array.prototype.sort` is stable, so equal elements keep the order they
 * were handed over in. That order was: every hand-typed row, then every sale
 * derived from `orders`. A restock entered at 7am therefore sat above a sale
 * rung up at 6pm, every time, and the owner read a sequence of events that
 * never happened.
 *
 * Nothing in the code could have fixed it — the time was not in the table.
 * Migration 0045 adds `cash_ledger.created_at`; a sale already carried
 * `orders.created_at`. So both sides can now say when, and this comparator
 * uses it as the tie-breaker it is.
 *
 * Two rules it must keep:
 *
 *   The accounting day still wins. `date` is what every balance on the money
 *   screen is computed from, and a line filed to yesterday belongs under
 *   yesterday however late it was typed.
 *
 *   A line with no time sorts LAST within its day, not first. Every row
 *   written before 0045 has no time, and putting an unknown above a known
 *   would recreate the original bug for exactly the rows it was about.
 */

export type Ordered = {
  /** The accounting day, "YYYY-MM-DD". */
  date: string;
  /** When it was written, ISO. Absent on rows from before migration 0045. */
  at?: string | null;
};

/**
 * Newest first — by day, then within the day.
 *
 * ISO strings compare correctly as text in both formats, which is the one
 * thing that keeps this cheap enough to run on every render.
 */
export function newestFirst(a: Ordered, b: Ordered): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  // Empty string sorts below every real timestamp, which is what puts a line
  // with no time at the bottom of its own day.
  const at = a.at ?? "";
  const bt = b.at ?? "";
  if (at === bt) return 0;
  return at < bt ? 1 : -1;
}
