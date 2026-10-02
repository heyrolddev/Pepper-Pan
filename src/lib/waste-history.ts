/* A relative import with its extension, which is the idiom every tested
   module in this folder uses: `node --test` runs these files directly and
   does not resolve the `@/` alias, so a path alias here makes the module
   untestable — and the arithmetic in it is exactly the part worth testing. */
/* The day-range vocabulary is shared with the stock-accuracy screen, which
   asks the same question of a different ledger. One copy, so "Last month"
   cannot come to mean two things. */
export {
  PRESET_LABEL,
  normaliseRange,
  preset,
  rangeDays,
  type PresetId,
  type Range,
} from "./day-range.ts";

/**
 * What the shop threw away, over a stretch of days it chooses.
 *
 * ── Why this did not exist ───────────────────────────────────────────────
 *
 * Waste was written in three places and read back in two, and neither of the
 * two was a history. `money-server` and `monthly-report-server` both select
 * `total_cost` and sum it — so the shop could see that ₱1,400 went in the bin
 * last month and had no way to ask what it was. The one listing that existed
 * hung off a single ingredient's history dialog and filtered
 * `source_type = 'inv'`, which means a prepped batch or a whole dish written
 * off appeared in NO history anywhere. It was logged, it was costed, it
 * reached break-even, and no screen would show it to you.
 *
 * ── The split is the point ───────────────────────────────────────────────
 *
 * Spoilage and staff meals both cost money and only one of them is a
 * problem. The form has always known that — it makes you choose before you
 * can type — and then every reader blended the two back into one figure. A
 * single "waste" total is either an unfair indictment of the kitchen or a
 * hiding place for real spoilage, depending which way the mix runs. So
 * nothing here ever returns one number for both.
 */

export type WasteCategory = "waste" | "internal";
export type WasteKind = "inv" | "batch" | "meal";

export type WasteRow = {
  id: string;
  /** "YYYY-MM-DD". Compared as text, never through a Date. */
  date: string;
  name: string;
  qty: number;
  unit: string | null;
  reason: string | null;
  note: string | null;
  cost: number;
  category: WasteCategory;
  kind: WasteKind | null;
  loggedBy: string | null;
};

export type WasteTotals = {
  /** Spoilage, spills, burnt — the part that is a problem. */
  spoiled: number;
  /** Staff meals, tastings, samples — a cost, and not a fault. */
  internal: number;
  /** Both, for the one place a combined figure is honest: cash gone. */
  all: number;
  count: number;
  /** Spoilage per day across the range, for comparing a week to a month. */
  spoiledPerDay: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export function totals(rows: WasteRow[], days: number): WasteTotals {
  let spoiled = 0;
  let internal = 0;
  for (const r of rows) {
    const cost = Number.isFinite(r.cost) ? Math.abs(r.cost) : 0;
    if (r.category === "internal") internal += cost;
    else spoiled += cost;
  }
  spoiled = money(spoiled);
  internal = money(internal);
  return {
    spoiled,
    internal,
    all: money(spoiled + internal),
    count: rows.length,
    spoiledPerDay: money(spoiled / Math.max(days, 1)),
  };
}

export type DayGroup = { date: string; rows: WasteRow[]; spoiled: number; internal: number };

/**
 * By day, newest first, and the rows inside a day left in the order given.
 *
 * `waste_log` has no timestamp — only a date — so there is no hour to sort
 * within a day by. Inventing one by falling back to the id would read as
 * chronology and be nothing of the kind.
 */
export function byDay(rows: WasteRow[]): DayGroup[] {
  const map = new Map<string, WasteRow[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 10);
    const at = map.get(key);
    if (at) at.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .sort((a, z) => (a[0] < z[0] ? 1 : a[0] > z[0] ? -1 : 0))
    .map(([date, list]) => {
      const t = totals(list, 1);
      return { date, rows: list, spoiled: t.spoiled, internal: t.internal };
    });
}

export type Culprit = { name: string; cost: number; times: number };

/**
 * What cost the most, spoilage only.
 *
 * The actionable half of this screen. "₱1,400 of waste" is a number to wince
 * at; "the pork, four times, ₱900 of it" is a thing to do something about on
 * Monday. Staff meals are excluded on purpose — they are not a leak, and
 * ranking them beside spoilage invites somebody to go after the wrong one.
 */
export function worstOffenders(rows: WasteRow[], top = 5): Culprit[] {
  const map = new Map<string, Culprit>();
  for (const r of rows) {
    if (r.category === "internal") continue;
    const cost = Number.isFinite(r.cost) ? Math.abs(r.cost) : 0;
    const at = map.get(r.name);
    if (at) {
      at.cost = money(at.cost + cost);
      at.times += 1;
    } else {
      map.set(r.name, { name: r.name, cost: money(cost), times: 1 });
    }
  }
  return [...map.values()]
    .sort((a, z) => z.cost - a.cost || z.times - a.times)
    .slice(0, top);
}

/** What kind of thing it was, for the badge. */
export const KIND_LABEL: Record<WasteKind, string> = {
  inv: "Shelf",
  batch: "Batch",
  meal: "Dish",
};
