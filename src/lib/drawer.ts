/**
 * What should be in the drawer, and why.
 *
 * ── The bug this replaces ────────────────────────────────────────────────
 *
 * The shift report compared the counted cash against the shift's CASH SALES
 * and called the difference over or short. A drawer is not a sales total.
 * Three things move money in and out of it, and only one of them was in the
 * sum:
 *
 *   The float. A stall cannot trade without barya, so there is money in the
 *   drawer before the first customer arrives. Every shift therefore read as
 *   OVER by exactly the float, every single day.
 *
 *   Cash paid out. Staff buy the gas, the ice, the tissue, and settle a
 *   supplier, out of the drawer — the shop already records every one of
 *   those as a `cash_ledger` line. A ₱1,300 refill made the shift read
 *   ₱1,300 SHORT.
 *
 *   Cash paid in that is not a sale. The owner topping up the barya, an
 *   utang collected.
 *
 * So the one report that could catch real theft accused an honest person
 * instead, in red, on a screen their employer reads. That is worse than not
 * having the report: a number that is always wrong stops being read, and the
 * day it is right nobody believes it.
 *
 * ── Where the opening figure comes from ──────────────────────────────────
 *
 * Not a setting somebody has to maintain. The drawer is continuous — what is
 * in it when a shift starts is what was counted when it was last counted —
 * so the shop's own last count IS the opening. That bootstraps itself: count
 * the drawer once, and every shift after it can be checked.
 *
 * Until that first count there is no honest answer, and this says so rather
 * than assuming zero. A variance computed from a guessed opening is a number
 * that looks exactly like a measured one, and it would be pointing at a
 * person.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

export type DrawerMove = {
  /** ISO timestamp. */
  at: string;
  type: "in" | "out";
  amount: number;
  /** For the breakdown — "Gas refill", "Paid Aling Nena". */
  label: string | null;
};

export type DrawerCount = {
  /**
   * What was in the drawer when this window opened, and where that came
   * from. Null when nobody has ever counted it.
   */
  opening: number | null;
  openingFrom: "last-count" | "never-counted";
  /** When the drawer was last counted, so the window is explicable. */
  since: string | null;

  /** Cash sales in this shift. GCash was never in the drawer. */
  sales: number;
  /** Cash in that was not a sale — a float top-up, an utang collected. */
  paidIn: number;
  /** Cash out — supplies, gas, a supplier settled, money banked. */
  paidOut: number;

  /** opening + sales + paidIn − paidOut. Null when the opening is unknown. */
  expected: number | null;
  /** What was actually counted. Null until somebody counts. */
  counted: number | null;
  /** counted − expected. Null unless BOTH are known. */
  diff: number | null;

  /** The out-lines themselves, so a variance can be argued with. */
  movements: DrawerMove[];
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * The drawer for one shift.
 *
 * `moves` should already be the cash-account lines that fall in the window —
 * from the last count to the end of this shift. Filtering is the caller's
 * job because only the caller knows which rows it fetched; doing it twice is
 * how the two copies come to disagree.
 */
export function drawerFor(input: {
  /** The last counted closing figure before this shift, if there is one. */
  lastCount: { at: string; amount: number } | null;
  /** Cash sales rung up during this shift. */
  cashSales: number;
  /** Cash-account ledger lines in the window. */
  moves: DrawerMove[];
  /** What was counted at the end of THIS shift, if it has been. */
  counted: number | null;
}): DrawerCount {
  const paidIn = money(
    input.moves.filter((m) => m.type === "in").reduce((s, m) => s + (Number(m.amount) || 0), 0)
  );
  const paidOut = money(
    input.moves.filter((m) => m.type === "out").reduce((s, m) => s + (Number(m.amount) || 0), 0)
  );
  const sales = money(Number(input.cashSales) || 0);

  const opening = input.lastCount ? money(input.lastCount.amount) : null;
  const expected =
    opening === null ? null : money(opening + sales + paidIn - paidOut);
  const counted = input.counted === null ? null : money(input.counted);

  return {
    opening,
    openingFrom: input.lastCount ? "last-count" : "never-counted",
    since: input.lastCount?.at ?? null,
    sales,
    paidIn,
    paidOut,
    expected,
    counted,
    // BOTH, not either. A variance against an unknown opening is a guess
    // with a person's name on it.
    diff: expected === null || counted === null ? null : money(counted - expected),
    // Newest first: the line somebody is about to query is the recent one.
    movements: [...input.moves].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)),
  };
}

/**
 * How far out is worth mentioning.
 *
 * Centavos are rounding, not a discrepancy — a drawer counted in coins will
 * never land on the centavo, and flagging that trains people to ignore the
 * flag. A peso either way is the threshold a stall would actually use.
 */
export function drawerVerdict(d: DrawerCount): "unknown" | "square" | "over" | "short" {
  if (d.diff === null) return "unknown";
  if (Math.abs(d.diff) < 1) return "square";
  return d.diff > 0 ? "over" : "short";
}

/**
 * The sum in words, for the screen that has to justify accusing somebody.
 *
 * Written out rather than left as four figures in a row, because the whole
 * failure this replaces was a number nobody could argue with. A staff member
 * told they are ₱300 short should be able to read the line and point at the
 * gas refill.
 */
export function drawerStory(d: DrawerCount): string {
  if (d.opening === null) {
    return "Nobody has counted the drawer yet, so there is nothing to check this against. Count it at the end of a shift and every shift after it can be checked.";
  }
  const bits = [`₱${d.opening.toFixed(2)} was in the drawer`];
  if (d.sales > 0) bits.push(`+ ₱${d.sales.toFixed(2)} cash sales`);
  if (d.paidIn > 0) bits.push(`+ ₱${d.paidIn.toFixed(2)} put in`);
  if (d.paidOut > 0) bits.push(`− ₱${d.paidOut.toFixed(2)} paid out`);
  return `${bits.join(" ")} = ₱${(d.expected ?? 0).toFixed(2)} expected.`;
}
