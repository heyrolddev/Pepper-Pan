/**
 * Days the shop traded before it had this till.
 *
 * The stall ran for months on a notebook. Those takings are real and the
 * system knows nothing about them, which matters more than it sounds: the
 * sales trend has nothing to draw, and the forecast refuses to say anything
 * until it has six completed weeks. Typing the old days in is the difference
 * between waiting six weeks for an answer and having one today.
 *
 * WHAT A PAST DAY IS NOT. It is not a ticket. Forty walk-ins become ONE entry
 * carrying the day's total, because nobody is going to retype forty tickets
 * from a notebook — and a day of takings is what the notebook actually holds.
 * Everything built on the day's money is right afterwards; anything built on
 * the NUMBER of orders is not, and the screen says so rather than leaving it
 * to be discovered.
 *
 * THE TRAP THIS FILE EXISTS FOR. `orders.cogs` is `not null default 0`, so a
 * day entered as takings alone lands as ₱8,500 revenue against ₱0 of cost —
 * a perfect 100% margin, silently, on every profit figure the shop reads.
 * That is not a rounding error; it is the system inventing money. So a cost
 * is required, and the ratio is asked ONCE for the whole batch rather than
 * per day, because a shop knows roughly what its food costs and does not know
 * what last Tuesday's specifically did.
 */

/** One row as the owner typed it. */
export type PastDayInput = {
  /** ISO date, as the date input gives it: YYYY-MM-DD. */
  date: string;
  /** The day's takings, in pesos. */
  takings: number | null;
};

/** One row, checked and costed, ready to become an order. */
export type PastDay = {
  date: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
};

export type PastDayProblem = { date: string; why: string };

export type PastDayPlan = {
  rows: PastDay[];
  problems: PastDayProblem[];
  total: number;
};

/** A food cost outside this is a typo, not a shop. */
export const MIN_COST_PCT = 1;
export const MAX_COST_PCT = 95;

/** Nothing before this is a Pepper Pan trading day worth arguing about. */
const EARLIEST = "2020-01-01";

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Turn typed rows into days that can be saved, and name what cannot.
 *
 * Nothing is dropped in silence. A row that cannot be saved comes back in
 * `problems` with the reason, because a screen that quietly imports nine of
 * ten rows teaches the owner to distrust the total afterwards.
 *
 * `taken` is the dates that already carry sales — real tickets or an earlier
 * backfill. Entering a day twice doubles that day's takings and there is no
 * way to see it afterwards except by noticing the trend is wrong.
 */
export function planPastDays(
  input: readonly PastDayInput[],
  costPct: number,
  taken: ReadonlySet<string> = new Set(),
  today = new Date()
): PastDayPlan {
  const rows: PastDay[] = [];
  const problems: PastDayProblem[] = [];
  const seen = new Set<string>();

  const pct = Number(costPct);
  const badPct =
    !Number.isFinite(pct) || pct < MIN_COST_PCT || pct > MAX_COST_PCT;

  const todayIso = toIso(today);

  for (const row of input) {
    const date = (row.date ?? "").trim();
    if (!date) continue; // an empty row is somebody tabbing past, not an error

    if (!isIsoDate(date)) {
      problems.push({ date, why: "That is not a date." });
      continue;
    }
    if (date > todayIso) {
      problems.push({ date, why: "That day has not happened yet." });
      continue;
    }
    if (date < EARLIEST) {
      problems.push({ date, why: "That is before the shop existed." });
      continue;
    }
    if (seen.has(date)) {
      problems.push({ date, why: "Listed twice on this screen." });
      continue;
    }
    if (taken.has(date)) {
      problems.push({ date, why: "That day already has sales recorded." });
      continue;
    }

    const takings = Number(row.takings);
    if (!Number.isFinite(takings) || takings <= 0) {
      problems.push({ date, why: "Put the day's takings in." });
      continue;
    }

    if (badPct) {
      problems.push({ date, why: "Set a food cost first." });
      continue;
    }

    seen.add(date);
    const revenue = round2(takings);
    const cogs = round2(revenue * (pct / 100));
    rows.push({ date, revenue, cogs, grossProfit: round2(revenue - cogs) });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return {
    rows,
    problems,
    total: round2(rows.reduce((sum, r) => sum + r.revenue, 0)),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The shop's own clock, not the browser's timezone. */
export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The food cost the shop is actually running at, as a percentage.
 *
 * Offered as the starting figure so the owner is correcting a number rather
 * than inventing one. Null when there is nothing to work it out from — and
 * then the field starts empty, because a made-up default here would be the
 * system putting words in their mouth about their own margins.
 */
export function usualCostPct(
  revenue: number,
  cogs: number
): number | null {
  if (!Number.isFinite(revenue) || !Number.isFinite(cogs)) return null;
  if (revenue <= 0 || cogs <= 0) return null;
  const pct = (cogs / revenue) * 100;
  if (pct < MIN_COST_PCT || pct > MAX_COST_PCT) return null;
  return Math.round(pct * 10) / 10;
}

/** Every day between two dates, so a week can be filled in one tap. */
export function daysBetween(from: string, to: string, limit = 120): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end && out.length < limit) {
    out.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
