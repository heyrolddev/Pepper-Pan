"use server";

import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { normaliseRange } from "@/lib/day-range";
import { parseCount, type CountRow } from "@/lib/stock-accuracy";

/**
 * The counts, read back over a range — and what the shop sold in the same
 * days, because one of those figures cannot be judged without the other.
 *
 * ₱900 of shrinkage is nothing on ₱90,000 of trade and serious on ₱9,000.
 * Fetching the sales here rather than on the screen keeps the comparison
 * honest: the two figures are measured over exactly the same days, by the
 * same query, and cannot drift apart because somebody changed one range.
 */

export type StockAccuracy = {
  rows: CountRow[];
  /** Completed sales in the same days. Null when it could not be read. */
  revenue: number | null;
  /** How many `cycle_counts` rows were unreadable — surfaced, not hidden. */
  unreadable: number;
  truncated: boolean;
  error: string | null;
};

const LIMIT = 500;
const EMPTY: StockAccuracy = {
  rows: [],
  revenue: null,
  unreadable: 0,
  truncated: false,
  error: null,
};

export async function readStockAccuracy(input: {
  from: string;
  to: string;
}): Promise<StockAccuracy> {
  const viewer = await getViewer();
  // Costs are the owner's. A count's VALUE is a cost figure, so this is a
  // stricter gate than the waste history beside it — which shows quantities
  // a shift legitimately needs.
  if (!can(viewer, "business")) {
    return { ...EMPTY, error: "Stock value is the owner's." };
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.to)
  ) {
    return { ...EMPTY, error: "Pick two dates." };
  }
  const range = normaliseRange(input.from, input.to);
  if (range.from > shopToday()) return EMPTY;

  try {
    const supabase = createAdminClient();
    const [counts, sales] = await Promise.all([
      supabase
        .from("cycle_counts")
        .select("id, date, payload")
        .gte("date", range.from)
        .lte("date", range.to)
        .order("date", { ascending: false })
        .limit(LIMIT + 1),
      supabase
        .from("orders")
        .select("revenue")
        .eq("status", "completed")
        .gte("date", range.from)
        .lte("date", range.to),
    ]);

    if (counts.error) return { ...EMPTY, error: counts.error.message };

    const raw = (counts.data ?? []) as { id: string; date: string; payload: unknown }[];
    const truncated = raw.length > LIMIT;

    const rows: CountRow[] = [];
    let unreadable = 0;
    for (const r of raw.slice(0, LIMIT)) {
      const parsed = parseCount(r);
      if (parsed) rows.push(parsed);
      else unreadable += 1;
    }

    // Sales may legitimately fail where counts did not. Null rather than
    // zero: zero would make every peso of shrinkage read as an infinite
    // share of trade and paint the panel red at a shop that simply could not
    // be asked about its sales.
    const revenue = sales.error
      ? null
      : ((sales.data ?? []) as { revenue: number | null }[]).reduce(
          (sum, o) => sum + (Number(o.revenue) || 0),
          0
        );

    return { rows, revenue, unreadable, truncated, error: null };
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) };
  }
}
