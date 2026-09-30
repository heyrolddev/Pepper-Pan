/**
 * How much of this month's pay the owner has already taken.
 *
 * The arithmetic is four lines. It lives in its own file because the
 * SENTENCES are the feature — a screen that says "₱2,000 taken" has told the
 * owner nothing they did not already know, and a screen that says "₱13,000
 * left, 12 days to go" has told them whether to take more today. Those
 * sentences are decisions, and a decision can be wrong in a way no amount of
 * looking at the panel would reveal.
 *
 * ── Why "left" is the headline and "taken" is not ────────────────────────
 *
 * They are the same number twice. But one of them is the answer to the
 * question actually being asked at the counter, which is "can I take ₱2,000
 * out of this drawer right now". Taken is history; left is the decision.
 *
 * ── Over budget is not an error ──────────────────────────────────────────
 *
 * A shop owner takes what the household needs and the budget is a plan, not
 * a rule. So going over is a STATE, not a failure: the money is still theirs,
 * it simply stopped being wages and became profit taken early. The panel says
 * exactly that, because the alternative — a red error on a person spending
 * their own money — is a screen people learn to ignore.
 */

export type DrawRow = {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  amount: number;
  /** Which pot it came out of. */
  account: string;
  note: string | null;
};

export type PayState =
  /** No fixed cost is marked as the owner's pay, so there is nothing to measure against. */
  | "unset"
  /** Comfortably inside the budget. */
  | "within"
  /** Inside, but with little left — worth seeing before taking more. */
  | "close"
  /** All of it taken, to the peso. */
  | "spent"
  /** More than budgeted. The excess is profit, not wages. */
  | "over";

export type PayMonth = {
  budget: number;
  taken: number;
  /** Never negative — what is left to take. Zero once the budget is used up. */
  left: number;
  /** Only above zero when over budget. The part that is profit, not wages. */
  over: number;
  /** 0–100, capped, for the meter's width. `ratio` below is uncapped. */
  pct: number;
  /** Uncapped share taken, so "over" can be described as well as drawn. */
  ratio: number;
  state: PayState;
  count: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

/** Only this month's rows, by the first seven characters. No Date, no zone. */
export function drawsInMonth(rows: DrawRow[], month: string): DrawRow[] {
  const key = month.slice(0, 7);
  return rows.filter((r) => r.date.slice(0, 7) === key);
}

/**
 * The month, read back.
 *
 * `budget` is null when no fixed cost carries the flag. That is a real and
 * common state — plenty of shops never set a salary — and it is not zero.
 * Zero would make every draw "over budget" and paint the panel red at a
 * person who simply has not filled in a form.
 */
export function payMonth(rows: DrawRow[], budget: number | null): PayMonth {
  const taken = money(
    rows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? Math.abs(r.amount) : 0), 0)
  );

  if (budget === null || !(budget > 0)) {
    return {
      budget: 0,
      taken,
      left: 0,
      over: 0,
      pct: 0,
      ratio: 0,
      state: "unset",
      count: rows.length,
    };
  }

  const left = money(Math.max(budget - taken, 0));
  const over = money(Math.max(taken - budget, 0));
  const ratio = taken / budget;

  const state: PayState =
    over > 0 ? "over" : left === 0 ? "spent" : ratio >= 0.85 ? "close" : "within";

  return {
    budget: money(budget),
    taken,
    left,
    over,
    // Capped, because a meter wider than its track is a bug that looks like a
    // design. The "over" case says so in words instead.
    pct: Math.min(Math.round(ratio * 100), 100),
    ratio,
    state,
    count: rows.length,
  };
}

/**
 * What the panel says out loud, under the number.
 *
 * Status carried as a sentence rather than only as a colour: the meter turns
 * red, and it also SAYS it is over. A colour on its own is not readable to
 * everyone, and is not readable at all in a photograph of a screen sent over
 * Messenger — which is how half this shop's questions arrive.
 */
export function payLine(m: PayMonth, daysLeft: number): string {
  const peso = (n: number) =>
    "₱" + Math.round(n).toLocaleString("en-PH");

  switch (m.state) {
    case "unset":
      return m.taken > 0
        ? `${peso(m.taken)} taken this month. Set your monthly pay below and this becomes a budget you can see.`
        : "Set your monthly pay below and every draw will be measured against it.";
    case "over":
      return `${peso(m.over)} more than budgeted. The extra is profit taken early, not wages — which is fine, as long as it was on purpose.`;
    case "spent":
      return "This month's pay is fully drawn. Anything more comes out of profit.";
    case "close":
      return daysLeft > 0
        ? `${peso(m.left)} left, with ${daysLeft} day${daysLeft === 1 ? "" : "s"} of the month to go.`
        : `${peso(m.left)} left, and the month ends today.`;
    default:
      return daysLeft > 0
        ? `${peso(m.taken)} taken so far, ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go.`
        : `${peso(m.taken)} taken this month.`;
  }
}

/** Days remaining in the month `date` falls in, counting today as one. */
export function daysLeftInMonth(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  // Day 0 of next month is the last day of this one. All UTC, so a local
  // calendar never gets a vote.
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.max(last - d, 0);
}
