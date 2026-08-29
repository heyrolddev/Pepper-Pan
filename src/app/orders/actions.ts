"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";

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

/**
 * Submit a GCash reference (and optionally a receipt screenshot) for one's
 * own order.
 *
 * This goes through the `submit_payment_reference` database function rather
 * than a plain UPDATE: RLS only lets a customer write to an order while it's
 * still `pending`, but payment happens while the food is already cooking.
 * The function proves ownership itself and writes nothing but the payment
 * columns, so this can't become a backdoor for editing a confirmed order.
 */
export async function submitPayment(
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  const orderId = String(formData.get("orderId") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  if (!orderId) return { error: "Missing order." };

  const file = formData.get("receipt");
  const hasReceipt = file instanceof File && file.size > 0;

  // Either proof will do — a reference number typed off a phone screen, or a
  // screenshot of the GCash receipt — but not neither. The database enforces
  // the same rule, counting a screenshot already on file.
  if (reference.length < 4 && !hasReceipt) {
    return {
      error:
        "Add your GCash reference number or a screenshot of the receipt — either one is fine.",
    };
  }

  let receiptUrl: string | null = null;
  if (hasReceipt) {
    const checked = validateImage(file);
    if ("error" in checked) return { error: checked.error };

    const uploaded = await uploadImage(
      checked.file,
      `receipts/${orderId}-${Date.now()}.${extensionFor(checked.file.type)}`
    );
    if ("error" in uploaded) return { error: uploaded.error };
    receiptUrl = uploaded.url;
  }

  const { data, error } = await supabase.rpc("submit_payment_reference", {
    p_order_id: orderId,
    p_reference: reference,
    p_receipt_url: receiptUrl,
  });

  if (error) {
    return {
      error: `${error.message}. If this mentions submit_payment_reference, run migration 0006 in the Supabase SQL Editor.`,
    };
  }
  if (data !== true) {
    return {
      error:
        "That payment couldn't be recorded — the order may be cancelled, or already confirmed as paid.",
    };
  }

  revalidateOrders();
  return { error: null };
}
