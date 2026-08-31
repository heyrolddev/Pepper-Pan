import { getViewer } from "@/lib/auth";
import { loadCostBook } from "@/lib/costing-server";
import { isLow, stockValue } from "@/lib/costing";
import { InventoryView, type BatchRow, type StockRow } from "@/components/inventory-view";
import { loadInsight, loadPriceMoves } from "@/lib/inventory-insight";

// Stock moves every service. A cached shopping list is the wrong shopping list.
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const viewer = await getViewer();
  // Staff need to know what's running out — that's the point of the screen.
  // What each thing costs is the owner's, so the money columns are dropped
  // rather than the whole page.
  const canSeeCosts = viewer?.profile?.role === "owner";

  const { ingredients, batches, batchCosts, batchIngredients, failed } =
    await loadCostBook();

  // What to buy and what is about to go off. Needs the cost book first, since
  // both are worked out against the same ingredient and batch rows.
  const [insight, priceMoves] = await Promise.all([
    loadInsight(ingredients, batches, batchIngredients),
    loadPriceMoves(),
  ]);

  // Grouped once here rather than looked up per card: the produce dialog
  // needs a batch's own lines to check them against the shelf.
  const recipeByBatch = new Map<string, typeof batchIngredients>();
  for (const bi of batchIngredients) {
    const list = recipeByBatch.get(bi.batch_id) ?? [];
    list.push(bi);
    recipeByBatch.set(bi.batch_id, list);
  }

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
    purchasePrice: Number(i.purchase_price) || 0,
    purchaseQty: Number(i.purchase_qty) || 0,
    priceMovePct: priceMoves.get(i.id)?.pct ?? null,
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
    recipe: (recipeByBatch.get(b.batch.id) ?? []).map((r) => ({
      ingredientId: r.ingredient_id,
      qty: Number(r.qty) || 0,
    })),
  }));

  return (
    <InventoryView
      stock={stock}
      batches={batchRows}
      suggestions={insight.suggestions}
      expiring={insight.expiring}
      usageDays={insight.lookbackDays}
      thinHistory={insight.thin}
      canSeeCosts={canSeeCosts}
      failed={failed}
    />
  );
}
