"use server";

import { revalidatePath } from "next/cache";
import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordOrderCost } from "@/lib/costing-server";
import { syncStockForStatus } from "@/lib/stock-server";
import type { PaymentMethod } from "@/lib/payments";

export type CounterLine = { mealId: string; qty: number };

/** The till's vocabulary, mapped to the column's. */
const METHOD_FOR_TILL: Record<"cash" | "gcash", PaymentMethod> = {
  cash: "cod",
  gcash: "gcash",
};

export type CounterResult =
  | { error: string; orderId?: undefined; total?: undefined }
  | { error: null; orderId: string; total: number };

/**
 * A sale that happened at the stall.
 *
 * Until now the shop could only see the slice of itself that came through the
 * website. Every figure in HQ — the day's takings, the best sellers, the
 * busiest weekday, and now the margins — described online orders only, while
 * most of a street stall's money walks up and pays in cash. The numbers
 * weren't wrong so much as answering a smaller question than anyone reading
 * them thought.
 *
 * The row is an ordinary order with no `customer_id`, which is exactly what
 * the schema's comment said a walk-in was on day one. That means it flows
 * through the analytics, the exports and the costing without any of them
 * needing to know where it came from.
 */
export async function recordWalkInSale(input: {
  lines: CounterLine[];
  method: "cash" | "gcash";
  reference?: string;
  /** Straight into the day's takings, or onto the kitchen board first. */
  toKitchen: boolean;
  note?: string;
}): Promise<CounterResult> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Only shop staff can record a sale." };

  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) return { error: "Add something to the order first." };

  // Prices come from the database, never from the browser. The counter screen
  // shows a total, but the total that gets recorded is the one the server
  // works out — otherwise the takings are whatever a tampered request says
  // they are.
  const supabase = createAdminClient();
  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, name, price")
    .in("id", lines.map((l) => l.mealId));
  if (mealsError) return { error: mealsError.message };

  const priceById = new Map(
    ((meals ?? []) as { id: string; price: number }[]).map((m) => [
      m.id,
      Number(m.price) || 0,
    ])
  );
  const missing = lines.filter((l) => !priceById.has(l.mealId));
  if (missing.length > 0) {
    return {
      error: "Something on this order is no longer on the menu. Clear it and start again.",
    };
  }

  const subtotal = lines.reduce(
    (sum, l) => sum + priceById.get(l.mealId)! * l.qty,
    0
  );

  const reference = input.reference?.trim() || null;
  if (input.method === "gcash" && !reference) {
    return { error: "Add the GCash reference number." };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: null,
      // Who was on the counter. The column has existed since the first
      // migration and nothing has ever written to it.
      logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
      // Walk-ins are handed over and paid for at the counter, so the default
      // is a finished sale. Sending it to the kitchen is the busy-service
      // case, and then it's the board that says when it's done.
      status: input.toKitchen ? "confirmed" : "completed",
      fulfillment: "pickup",
      // "cod" is this system's word for cash — METHOD_LABEL already renders it
      // as "Cash", and the payments ledger looks the method up in that map with
      // no fallback. Storing the till's own word here would leave every
      // walk-in showing a blank payment method on the screen that exists to
      // reconcile them.
      payment_method: METHOD_FOR_TILL[input.method],
      // Money already in the drawer. Unlike an online GCash order — which
      // only *claims* to be paid until staff match the reference — the person
      // paying is standing right there.
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      payment_plan: "full",
      payment_reference: reference,
      revenue: subtotal,
      notes: input.note?.trim() || null,
      tag: "walk-in",
    })
    .select("id")
    .single();
  if (orderError || !order) {
    return { error: orderError?.message ?? "Could not record the sale." };
  }

  const { error: linesError } = await supabase.from("order_lines").insert(
    lines.map((l) => ({
      order_id: order.id,
      meal_id: l.mealId,
      qty: l.qty,
      price_at_sale: priceById.get(l.mealId)!,
    }))
  );
  if (linesError) {
    // The order exists but has nothing in it, which would show up as a ₱X sale
    // of nothing and quietly skew the best-sellers. Removed rather than left.
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: linesError.message };
  }

  // The estimate first, from current recipe prices, so an order always has a
  // cost even if stock movement can't run. Then the real thing: the movement
  // engine overwrites `cogs` with what actually came off the shelf, lot
  // prices and all. Same column, refined — not two sources of truth.
  await recordOrderCost(order.id);
  await syncStockForStatus(order.id, input.toKitchen ? "confirmed" : "completed");

  // The board, the day's takings and the sidebar counts all move.
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/counter");

  return { error: null, orderId: order.id, total: subtotal };
}
