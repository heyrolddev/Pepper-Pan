"use server";

import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import {
  normaliseRange,
  type WasteCategory,
  type WasteKind,
  type WasteRow,
} from "@/lib/waste-history";

/**
 * Reading the bin back, over a range the shop picks.
 *
 * A server action rather than a page read, because the range changes without
 * the page doing: the owner lands on "last 7 days", wants last month, and
 * reloading the whole Inventory screen — every shelf, every batch, every
 * costing — to answer a question about the bin is a second and a half of
 * waiting for nothing.
 *
 * The 500-row ceiling is a real limit and says so when it is hit, rather than
 * quietly returning the first 500 of a wider range. A truncated total that
 * looks complete is worse than no total: it is a figure somebody would plan
 * around.
 */

export type WasteHistory = {
  rows: WasteRow[];
  /** True when the range held more than the ceiling, so the screen can say so. */
  truncated: boolean;
  error: string | null;
};

const LIMIT = 500;

const EMPTY: WasteHistory = { rows: [], truncated: false, error: null };

export async function readWasteHistory(input: {
  from: string;
  to: string;
}): Promise<WasteHistory> {
  const viewer = await getViewer();
  // The same gate the waste FORM uses. Somebody who may write a line must be
  // able to read back the one they wrote, or a typo is unfindable.
  if (!can(viewer, "stock.view")) {
    return { ...EMPTY, error: "You don't have access to the stock records." };
  }

  const today = shopToday();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.to)
  ) {
    return { ...EMPTY, error: "Pick two dates." };
  }
  const range = normaliseRange(input.from, input.to);
  if (range.from > today) return EMPTY;

  try {
    const { data, error } = await createAdminClient()
      .from("waste_log")
      .select(
        "id, date, qty, unit, reason, note, total_cost, category, source_type, source_name, ingredient_id, logged_by"
      )
      .gte("date", range.from)
      .lte("date", range.to)
      .order("date", { ascending: false })
      .limit(LIMIT + 1);

    if (error) return { ...EMPTY, error: error.message };

    const raw = (data ?? []) as {
      id: string;
      date: string;
      qty: number;
      unit: string | null;
      reason: string | null;
      note: string | null;
      total_cost: number | null;
      category: string | null;
      source_type: string | null;
      source_name: string | null;
      ingredient_id: string | null;
      logged_by: string | null;
    }[];

    const truncated = raw.length > LIMIT;
    const rows: WasteRow[] = raw.slice(0, LIMIT).map((w) => ({
      id: w.id,
      date: w.date,
      /* `source_name` is written at the moment of logging, so a shelf renamed
         or deleted afterwards still reads as what it was called on the day —
         which is the whole reason the column exists. Only rows from before it
         did have nothing, and they say so rather than showing a bare id. */
      name: w.source_name?.trim() || "Something not named",
      qty: Number(w.qty) || 0,
      unit: w.unit,
      reason: w.reason,
      note: w.note,
      cost: Number(w.total_cost) || 0,
      // Anything that is not explicitly internal is spoilage. The default on
      // the column is 'internal', and erring the other way would quietly
      // shrink the spoilage figure, which is the number this screen exists
      // to show honestly.
      category: (w.category === "internal" ? "internal" : "waste") as WasteCategory,
      kind: (w.source_type ?? null) as WasteKind | null,
      loggedBy: w.logged_by?.trim() || null,
    }));

    return { rows, truncated, error: null };
  } catch (e) {
    return { ...EMPTY, error: e instanceof Error ? e.message : String(e) };
  }
}
