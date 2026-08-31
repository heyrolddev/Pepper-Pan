import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  costBatches,
  isLow,
  stockValue,
  type Batch,
  type BatchIngredient,
  type Ingredient,
} from "@/lib/costing";
import { InventoryView, type BatchRow, type StockRow } from "@/components/inventory-view";

// Stock moves every service. A cached shopping list is the wrong shopping list.
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const viewer = await getViewer();
  // Staff need to know what's running out — that's the point of the screen.
  // What each thing costs is the owner's, so the money columns are dropped
  // rather than the whole page.
  const canSeeCosts = viewer?.profile?.role === "owner";

  const supabase = createAdminClient();
  const [ing, bat, batIng] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("batches").select("*").order("name"),
    supabase.from("batch_ingredients").select("*"),
  ]);

  const failed = [
    ing.error && "ingredients",
    bat.error && "batches",
    batIng.error && "batch recipes",
  ].filter(Boolean) as string[];

  const ingredients = (ing.data ?? []) as Ingredient[];
  const batches = (bat.data ?? []) as Batch[];
  const batchCosts = costBatches(
    batches,
    (batIng.data ?? []) as BatchIngredient[],
    ingredients
  );

  const stock: StockRow[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stock: Number(i.stock) || 0,
    reorder: Number(i.reorder) || 0,
    unitCost: Number(i.cost) || 0,
    value: stockValue(i),
    low: isLow(i),
    // What one purchase actually looks like — "₱230 per 1000 g" is how the
    // owner buys it, and ₱0.23 per gram is only how the recipes use it.
    buysAs:
      Number(i.purchase_qty) > 0
        ? `${Number(i.purchase_price).toLocaleString("en-PH")} / ${Number(
            i.purchase_qty
          ).toLocaleString("en-PH")}${i.unit}`
        : null,
    categories: i.categories ?? [],
  }));

  const batchRows: BatchRow[] = [...batchCosts.values()].map((b) => ({
    id: b.batch.id,
    name: b.batch.name,
    yieldQty: Number(b.batch.yield_qty) || 0,
    yieldUnit: b.batch.yield_unit,
    stock: Number(b.batch.batch_stock) || 0,
    reorder: Number(b.batch.reorder_level) || 0,
    total: b.total,
    perUnit: b.perUnit,
    unknown: b.unknown,
    problems: b.problems,
    lineCount: b.lines.length,
  }));

  return (
    <InventoryView
      stock={stock}
      batches={batchRows}
      canSeeCosts={canSeeCosts}
      failed={failed}
    />
  );
}
