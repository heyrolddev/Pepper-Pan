/**
 * What the counts say is missing.
 *
 * ── The leak this closes ─────────────────────────────────────────────────
 *
 * Every recount writes a `cycle_counts` row holding what the system thought
 * was on the shelf, what was actually there, the difference, and the
 * difference IN PESOS. Searched across the whole repository, that table had
 * exactly one insert, two deletes in Reset, and a line each in backup and
 * restore. **Nothing read it.** Not one screen, since the day it was added.
 *
 * So the shop's entire record of stock going missing — the best evidence it
 * has of theft, of bad portioning, of waste nobody logged — accumulated
 * where no one could look at it.
 *
 * ── And it costs nothing, which is the worse half ────────────────────────
 *
 *   netProfit      = grossProfit − fixedCosts − waste − runningCosts
 *   breakEvenDaily = (fixedCosts + waste + runningCosts) / margin / openDays
 *
 * No shrinkage term in either, and `consumption_log` appears in no money
 * module at all. Buy ₱1,000 of pork, sell ₱900 of it, and the missing ₱100
 * is not sold, not logged as waste, and not booked anywhere: the count
 * silently corrects the shelf and the money vanishes from the story. Profit
 * reads ₱100 higher than it is, every time, for ever.
 *
 * Waste at least reaches break-even and profit. Shrinkage reaches neither.
 *
 * ── Short and over are different problems ────────────────────────────────
 *
 * Counting LESS than expected is loss: it went somewhere nobody recorded.
 * Counting MORE is not a windfall — it means the recipes are over-deducting,
 * or a delivery was logged twice. Both are worth knowing and they lead
 * somewhere completely different, so nothing here nets them off against each
 * other. A shop with ₱900 short and ₱900 over does not have a tidy shelf; it
 * has two faults cancelling on a screen.
 */

/** A `cycle_counts` row, with its jsonb payload already pulled apart. */
export type CountRow = {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  name: string;
  systemQty: number;
  countedQty: number;
  /** counted − system. Negative means the shelf was short. */
  variance: number;
  /** The variance in pesos, at the cost the ingredient carried that day. */
  valueImpact: number;
  note: string | null;
};

/**
 * Pull one row out of the jsonb.
 *
 * Defensive about every field because this payload has been written since
 * 0001 and nothing has ever read it back — which means nothing has ever
 * found out whether it is shaped the way the writer believes. A row that
 * cannot be read is skipped rather than crashing the screen; a screen that
 * dies on one bad row shows nothing, and showing nothing is what this
 * feature is replacing.
 */
export function parseCount(raw: {
  id: string;
  date: string;
  payload: unknown;
}): CountRow | null {
  const p = raw.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const variance = num(p.variance);
  if (variance === null) return null;

  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : null;
  if (!name) return null;

  return {
    id: raw.id,
    date: raw.date.slice(0, 10),
    name,
    systemQty: num(p.systemQty) ?? 0,
    countedQty: num(p.countedQty) ?? 0,
    variance,
    // A count written before costs were entered has no value. Zero is the
    // honest reading: the shelf moved, the money is unknown.
    valueImpact: num(p.valueImpact) ?? 0,
    note: typeof p.note === "string" && p.note.trim() ? p.note.trim() : null,
  };
}

export type AccuracyTotals = {
  /** Money the counts say went missing. Always positive. */
  short: number;
  /** Money the counts say appeared. Always positive. */
  over: number;
  /** short − over. Reported, never used in place of the two above. */
  net: number;
  /** How many counts found less than expected. */
  shortCount: number;
  /** How many found more. */
  overCount: number;
  /** How many matched to the centavo. */
  exactCount: number;
  count: number;
  /** Short per day across the range, so a week compares with a month. */
  shortPerDay: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export function accuracy(rows: CountRow[], days: number): AccuracyTotals {
  let short = 0;
  let over = 0;
  let shortCount = 0;
  let overCount = 0;
  let exactCount = 0;

  for (const r of rows) {
    // The VARIANCE decides the direction, not the sign of the money: a cost
    // of zero on a shelf that was two kilos short is still a shelf that was
    // short, and counting it as "exact" would hide it.
    if (r.variance < 0) {
      shortCount += 1;
      short += Math.abs(r.valueImpact);
    } else if (r.variance > 0) {
      overCount += 1;
      over += Math.abs(r.valueImpact);
    } else {
      exactCount += 1;
    }
  }

  short = money(short);
  over = money(over);
  return {
    short,
    over,
    net: money(short - over),
    shortCount,
    overCount,
    exactCount,
    count: rows.length,
    shortPerDay: money(short / Math.max(days, 1)),
  };
}

export type Offender = {
  name: string;
  /** Money short across the range. */
  short: number;
  /** How many counts came up short. */
  times: number;
};

/**
 * Which shelf keeps coming up short.
 *
 * The actionable half. "₱1,900 of shrinkage" is a figure to worry about;
 * "the pork, short on six counts out of seven, ₱1,200 of it" names the shelf
 * to stand next to on Monday morning.
 *
 * Shelves that came up OVER are left out entirely — they are a different
 * fault with a different fix, and ranking them together sends somebody to
 * look for theft on a shelf whose recipe is simply wrong.
 */
export function worstShelves(rows: CountRow[], top = 5): Offender[] {
  const map = new Map<string, Offender>();
  for (const r of rows) {
    if (r.variance >= 0) continue;
    const at = map.get(r.name);
    if (at) {
      at.short = money(at.short + Math.abs(r.valueImpact));
      at.times += 1;
    } else {
      map.set(r.name, { name: r.name, short: money(Math.abs(r.valueImpact)), times: 1 });
    }
  }
  return [...map.values()]
    .sort((a, z) => z.short - a.short || z.times - a.times)
    .slice(0, top);
}

export type CountDay = { date: string; rows: CountRow[]; short: number; over: number };

/** By day, newest first. `cycle_counts` has a date and no time to sort within it. */
export function byDay(rows: CountRow[]): CountDay[] {
  const map = new Map<string, CountRow[]>();
  for (const r of rows) {
    const at = map.get(r.date);
    if (at) at.push(r);
    else map.set(r.date, [r]);
  }
  return [...map.entries()]
    .sort((a, z) => (a[0] < z[0] ? 1 : a[0] > z[0] ? -1 : 0))
    .map(([date, list]) => {
      const t = accuracy(list, 1);
      return { date, rows: list, short: t.short, over: t.over };
    });
}

/**
 * What the screen says out loud.
 *
 * A sentence rather than a figure, because the figure alone does not say
 * whether it is a lot. Shrinkage is judged against what the shop SELLS —
 * a ₱900 loss is nothing on ₱90,000 of trade and serious on ₱9,000.
 *
 * The thresholds are the ones a food business actually uses: under 1% of
 * sales is ordinary handling, 1–3% is worth chasing, above 3% is somebody
 * taking it or a recipe that is badly wrong.
 */
export function accuracyLine(t: AccuracyTotals, revenue: number | null): string {
  const peso = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");

  if (t.count === 0) {
    return "Nothing has been recounted in these days. A shelf that is never counted cannot be found short — which is not the same as not being short.";
  }
  if (t.short === 0) {
    return t.over > 0
      ? `No shelf came up short. ${peso(t.over)} came up OVER, which is not a windfall — it usually means a recipe takes off more than the dish really uses, or a delivery was logged twice.`
      : "Every count matched. That is either a tight kitchen or a shelf whose cost is not entered yet.";
  }
  if (revenue === null || revenue <= 0) {
    return `${peso(t.short)} short across ${t.shortCount} count${t.shortCount === 1 ? "" : "s"}.`;
  }

  const pct = (t.short / revenue) * 100;
  const share = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  if (pct < 1) {
    return `${peso(t.short)} short — ${share}% of what you sold. That is ordinary handling loss for a food stall.`;
  }
  if (pct < 3) {
    return `${peso(t.short)} short — ${share}% of what you sold. Worth chasing: over 1% usually means portions are heavier than the recipe says.`;
  }
  return `${peso(t.short)} short — ${share}% of what you sold. Above 3% is not handling loss. Either somebody is taking it, or a recipe is badly wrong.`;
}

/** Which band the shrinkage falls in, for the colour and the word beside it. */
export type AccuracyState = "none" | "fine" | "watch" | "serious";

export function accuracyState(t: AccuracyTotals, revenue: number | null): AccuracyState {
  if (t.count === 0 || t.short === 0) return "none";
  if (revenue === null || revenue <= 0) return "watch";
  const pct = (t.short / revenue) * 100;
  if (pct < 1) return "fine";
  if (pct < 3) return "watch";
  return "serious";
}
