import { NextResponse } from "next/server";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv } from "@/lib/backup";
import { loadInsight } from "@/lib/inventory-insight";
import { shopToday } from "@/lib/format-date";
import type {
  Batch,
  BatchIngredient,
  Ingredient,
} from "@/lib/costing";

/**
 * The buying list, as a file you can take to the market.
 *
 * A route handler rather than a server action for the same reason the backup
 * is one: this has to arrive as a real file with a real filename, which is
 * what makes a phone save it instead of rendering it.
 *
 * It is the WHOLE list, not the five rows the panel shows before you tap
 * "Show all". A shopping list that silently stops at five is how you get to
 * the market and find out about the sixth.
 */
export async function GET() {
  const viewer = await getViewer();
  if (!can(viewer, "stock.view")) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const supabase = createAdminClient();
  const [{ data: ingredients }, { data: batches }, { data: batchIngredients }] =
    await Promise.all([
      supabase.from("ingredients").select("*"),
      supabase.from("batches").select("*"),
      supabase.from("batch_ingredients").select("*"),
    ]);

  const insight = await loadInsight(
    (ingredients ?? []) as Ingredient[],
    (batches ?? []) as Batch[],
    (batchIngredients ?? []) as BatchIngredient[]
  );

  const today = shopToday();
  const rows = insight.suggestions.map((s) => [
    s.name,
    // Rounded up: you cannot buy 4,249.6 g of anything, and rounding down
    // sends you home with slightly too little of every single line.
    Math.ceil(s.buy),
    s.unit,
    s.stock,
    s.daysLeft === null ? "" : s.daysLeft.toFixed(1),
    s.reason === "below-level" ? "Below your level" : "Running out",
    s.cost.toFixed(2),
    // The single most useful column to have beside a panic buy: what is
    // already made from it and sitting on the shelf.
    s.coveredBy
      .map((b) => `${b.name} (${b.qty.toLocaleString("en-PH")} ${b.unit})`)
      .join("; "),
  ]);

  const total = insight.suggestions.reduce((sum, s) => sum + s.cost, 0);
  // A footer line rather than a separate summary: a printed list somebody
  // carries wants the total at the bottom, where a total goes.
  rows.push([]);
  rows.push(["TOTAL", "", "", "", "", "", total.toFixed(2), ""]);

  const csv = toCsv(
    [
      "Ingredient",
      "Buy",
      "Unit",
      "On hand",
      "Days left",
      "Why",
      "Approx cost",
      "Already made from it",
    ],
    rows
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pepper-pan-buy-list-${today}.csv"`,
      // Never cached: a shopping list from yesterday is worse than none.
      "Cache-Control": "no-store",
    },
  });
}
