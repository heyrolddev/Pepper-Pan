"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NOT_EDITABLE =
  "This order can no longer be changed — the kitchen has already started it. Please call us at +63 947 353 3060.";

function revalidateOrders() {
  revalidatePath("/orders");
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

/**
 * Cancel one's own order. RLS allows this only while the order is still
 * `pending` and belongs to the caller — this re-check just turns a policy
 * refusal into a sentence the customer can act on.
 */
export async function cancelMyOrder(
  orderId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_reason: reason.trim() || "Cancelled by the customer",
    })
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: NOT_EDITABLE };

  revalidateOrders();
  return { error: null };
}

/**
 * Change the quantities on a still-pending order. Prices are re-read from the
 * menu server-side and the order total recomputed here, so a tampered client
 * can't set its own total — same rule the checkout follows.
 */
export async function updateMyOrder(
  orderId: string,
  items: { lineId: number; qty: number }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  if (items.some((i) => !Number.isFinite(i.qty) || i.qty < 0 || i.qty > 99)) {
    return { error: "Quantities must be between 0 and 99." };
  }
  if (items.every((i) => i.qty === 0)) {
    return { error: "An order needs at least one item — cancel it instead." };
  }

  // Confirm the order is the caller's and still editable before touching
  // anything, so a rejected edit can explain itself.
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, customer_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.customer_id !== user.id) return { error: "Order not found." };
  if (order.status !== "pending") return { error: NOT_EDITABLE };

  const { data: lines, error: linesError } = await supabase
    .from("order_lines")
    .select("id, meal_id, price_at_sale")
    .eq("order_id", orderId);
  if (linesError || !lines) return { error: "Could not read that order." };

  const byId = new Map(lines.map((l) => [l.id as number, l]));
  if (items.some((i) => !byId.has(i.lineId))) {
    return { error: "That order changed while you were editing it. Reload and try again." };
  }

  // Apply removals and quantity changes.
  for (const item of items) {
    const result =
      item.qty === 0
        ? await supabase.from("order_lines").delete().eq("id", item.lineId).select("id")
        : await supabase
            .from("order_lines")
            .update({ qty: item.qty })
            .eq("id", item.lineId)
            .select("id");

    if (result.error) return { error: result.error.message };
    if (!result.data || result.data.length === 0) return { error: NOT_EDITABLE };
  }

  const revenue = items.reduce(
    (sum, i) => sum + i.qty * Number(byId.get(i.lineId)!.price_at_sale),
    0
  );

  const { data: updated, error: totalError } = await supabase
    .from("orders")
    .update({ revenue })
    .eq("id", orderId)
    .select("id");

  if (totalError) return { error: totalError.message };
  if (!updated || updated.length === 0) return { error: NOT_EDITABLE };

  revalidateOrders();
  return { error: null };
}
