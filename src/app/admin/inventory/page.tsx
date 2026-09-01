import { can, getViewer } from "@/lib/auth";
import { loadCostBook } from "@/lib/costing-server";
import { isLow, stockValue } from "@/lib/costing";
import { InventoryView, type BatchRow, type StockRow } from "@/components/inventory-view";
import { loadInsight, loadPriceMoves } from "@/lib/inventory-insight";

// Stock moves every service. A cached shopping list is the wrong shopping list.
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const viewer = await getViewer();
  // Everyone who works here keeps this screen — knowing what has run out is
  // the whole point of it, and it is the person at the counter who needs to
  // know. What changes with the role is how much of it is theirs:
  //
  //   staff    counts, and a button to write off what was thrown away
  //   manager  the above, plus restocking, counting and the recipes
  //   owner    the above, plus what any of it costs
  //
  // Three questions, three flags, rather than one "is this the owner" that
  // would force the books to be handed over to get a shelf counted.
  // Both flags come off the same capability, and that is deliberate: you
  // cannot record a delivery without saying what was paid for it, and the
  // restock and edit dialogs pre-fill from these very numbers. Blanking them
  // for someone who still has the forms would not hide a cost — it would put
  // ₱0 in the box and wipe the real purchase price the moment they saved an
  // unrelated field. So the line is drawn where it can actually hold: staff
  // get counts and no forms, a manager gets both.
  //
  // What stays the owner's is the `costs` capability — what each DISH earns —
  // and `business`, which is the takings. Knowing the chicken cost ₱230 is
  // not the same as knowing the shop's margin, and the person doing the
  // buying knows the first one already.
  const canSeeCosts = can(viewer, "stock.manage");
  const canManage = can(viewer, "stock.manage");

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

  // Hiding a number in the markup is not hiding it. Everything handed to a
  // client component is serialised into the page, so a `{canSeeCosts && ...}`
  // around a price leaves that price sitting in the HTML for anyone who opens
  // view-source. Blanked here, on the server, where "they can't see it" is
  // actually true.
  const money = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T =>
    canSeeCosts ? row : { ...row, ...Object.fromEntries(keys.map((k) => [k, 0])) };

  const safeStock = stock.map((s) =>
    // `buysAs` is a price too — "₱230 / 1000g" — so it goes as well.
    canSeeCosts
      ? s
      : { ...money(s, ["unitCost", "value", "purchasePrice", "purchaseQty"]), buysAs: null, priceMovePct: null }
  );
  const safeBatches = batchRows.map((b) => money(b, ["total", "perUnit"]));
  // The reorder list and the expiry list both quote what the buying will cost.
  const safeSuggestions = insight.suggestions.map((x) => money(x, ["cost"]));
  const safeExpiring = insight.expiring.map((x) => money(x, ["cost"]));

  return (
    <InventoryView
      stock={safeStock}
      batches={safeBatches}
      suggestions={safeSuggestions}
      expiring={safeExpiring}
      usageDays={insight.lookbackDays}
      thinHistory={insight.thin}
      canSeeCosts={canSeeCosts}
      canManage={canManage}
      failed={failed}
    />
  );
}
