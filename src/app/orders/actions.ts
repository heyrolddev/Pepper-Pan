"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { repriceOrder } from "@/lib/promos-server";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";
import { syncStockForStatus } from "@/lib/stock-server";
import { cartQuantityProblem } from "@/lib/orders";

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
      // Stamped here too, so "who cancelled this" has one answer wherever the
      // cancellation came from. Without it the shop's cancellations were
      // attributable and the customer's were not, which is the wrong way
      // round — the customer's is the one the shop will be asked about.
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: NOT_EDITABLE };

  // A customer can only reach this while the order is still `pending`, and a
  // pending order has never had stock deducted — so this is a no-op today.
  // It is here anyway: the day that rule is relaxed, the alternative is
  // ingredients quietly staying deducted for an order nobody is making.
  await syncStockForStatus(orderId, "cancelled");

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
): Promise<{ error: string | null; notice?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  // Zero is allowed here and only here: on an order that already exists it
  // means the customer is taking a line off, not asking for none of it.
  const badQuantity = cartQuantityProblem(items, { allowZero: true });
  if (badQuantity) return { error: badQuantity };
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
    // The add-ons ride along because the total has to be rebuilt from what
    // the line ACTUALLY costs. Summing `price_at_sale` alone would drop the
    // extra rice out of the order the moment the customer nudged a quantity —
    // still cooked, no longer charged for.
    .select("id, meal_id, price_at_sale, order_line_extras(price_at_sale, qty)")
    .eq("order_id", orderId);
  if (linesError || !lines) return { error: "Could not read that order." };

  type LineRow = {
    id: number;
    meal_id: string;
    price_at_sale: number;
    order_line_extras: { price_at_sale: number; qty: number }[] | null;
  };
  const byId = new Map(
    (lines as unknown as LineRow[]).map((l) => [
      l.id,
      Number(l.price_at_sale) +
        (l.order_line_extras ?? []).reduce(
          (n, e) => n + (Number(e.price_at_sale) || 0),
          0
        ),
    ])
  );
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

  const subtotal = items.reduce(
    (sum, i) => sum + i.qty * byId.get(i.lineId)!,
    0
  );

  /* The discount has to be re-decided, not carried over and not forgotten.
  
     This used to write `revenue` and stop, which quietly threw the promo
     away: the order went back to full price while `discount` and
     `promo_code` stayed on the row saying otherwise, and the receipt
     printed "Less SULIT20 ₱100" under a subtotal that had already lost it.
  
     Carrying the old peso figure over would be worse in the other
     direction — take three of four items off and a ₱100 discount on a ₱120
     basket is most of the food free. So the promo is re-checked against
     what is actually left, exactly as the checkout would check it. */
  const mealById = new Map(
    (lines as unknown as LineRow[]).map((l) => [l.id, l.meal_id])
  );
  const repriced = await repriceOrder({
    orderId,
    lines: items
      .filter((i) => i.qty > 0)
      .map((i) => ({
        mealId: mealById.get(i.lineId)!,
        // The line's own price plus its add-ons — the same figure the
        // subtotal is built from, so the promo sees the basket the customer
        // is actually being charged for.
        unitPrice: byId.get(i.lineId)!,
        qty: i.qty,
      })),
    customerId: user.id,
  });

  const discount = repriced.kind === "kept" ? repriced.discount : 0;
  const promoLabel = repriced.kind === "kept" ? repriced.label : null;

  /* Written as the shop. A browser session may not touch `revenue`,
     `discount` or `promo_code` since 0066 — the guard that stops a customer
     rewriting their own bill does not make an exception for the action that
     happens to be asking politely. Ownership and the pending status were
     both proved above, which is what earns this the service role. */
  const { data: updated, error: totalError } = await createAdminClient()
    .from("orders")
    .update({
      revenue: Math.max(0, subtotal - discount),
      discount,
      promo_code: promoLabel,
    })
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (totalError) return { error: totalError.message };
  if (!updated || updated.length === 0) return { error: NOT_EDITABLE };

  revalidateOrders();

  // Not an error — the edit went through — but the customer has to be told,
  // because the total they are about to see is not the one they expected
  // and nothing else on the screen would explain the difference.
  if (repriced.kind === "dropped") {
    return {
      error: null,
      notice: `Your order is updated, but "${repriced.label}" no longer applies: ${repriced.why}`,
    };
  }

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
