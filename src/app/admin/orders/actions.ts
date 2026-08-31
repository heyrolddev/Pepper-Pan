"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { notifyOrderStatus } from "@/lib/notify";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments";

const BLOCKED_MESSAGE =
  "The database didn't accept that change. Re-run the latest migration (0004) in the Supabase SQL Editor.";

function revalidateOrders() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/orders");
}

/**
 * Once the food is ready, the ETA has done its job and becomes a lie.
 *
 * The countdown answers one question — "how long until my food is ready?" —
 * and the moment the shop marks it ready that question is settled. Leaving it
 * running means a customer standing at the stall with their food in front of
 * them watching a clock that says four more minutes. And on a delivery order
 * the shop's cooking estimate says nothing about when a rider will arrive;
 * only the rider knows that, and they will ring.
 */
const ETA_IS_OVER: OrderStatus[] = [
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
];

export async function setOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<{ error: string | null }> {
  if (!ORDER_STATUSES.includes(status)) {
    return { error: "Unknown status." };
  }

  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const supabase = await createClient();
  // `.select()` matters: without it PostgREST reports success even when a
  // row-level security policy silently matched nothing.
  const { data, error } = await supabase
    .from("orders")
    .update({
      status,
      // Cleared in the same write as the status, not in a second one: two
      // updates would leave a window where the order is ready and the clock
      // is still counting, and that window is exactly when the customer is
      // looking.
      ...(ETA_IS_OVER.includes(status)
        ? { eta_minutes: null, eta_set_at: null }
        : {}),
    })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  // Awaited rather than fired and forgotten: on serverless the function can
  // be frozen the moment the response is returned, which would drop a
  // dangling promise silently. It swallows its own failures, so the status
  // change can't be held up by a mail problem.
  await notifyOrderStatus(orderId);

  revalidateOrders();
  return { error: null };
}

/**
 * The shop's promise to the customer: how many minutes until pickup/delivery.
 * Stored as a duration rather than a timestamp so it reads the same whether
 * the customer looks now or in five minutes, and so staff can set it with one
 * tap from a few presets.
 */
export async function setOrderEta(
  orderId: string,
  minutes: number | null
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 600)) {
    return { error: "Enter an ETA between 0 and 600 minutes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      eta_minutes: minutes,
      // Stamped so the customer's countdown runs from when the promise was
      // made, not from when they happened to open the page.
      eta_set_at: minutes === null ? null : new Date().toISOString(),
    })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateOrders();
  return { error: null };
}

/** Cancel an order on the customer's behalf, recording why. */
export async function cancelOrderAsStaff(
  orderId: string,
  reason: string
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_reason: reason.trim() || "Cancelled by the shop",
      eta_minutes: null,
      eta_set_at: null,
    })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  await notifyOrderStatus(orderId);

  revalidateOrders();
  return { error: null };
}

/**
 * Confirm (or un-confirm) that a payment actually arrived. Staff check the
 * reference against their own GCash records — nothing here can verify it for
 * them, so this only records the human decision.
 */
export async function setPaymentStatus(
  orderId: string,
  status: PaymentStatus
): Promise<{ error: string | null }> {
  if (!PAYMENT_STATUSES.includes(status)) return { error: "Unknown payment status." };

  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_status: status,
      paid_at: status === "paid" ? now : null,
      // Stamped when the down payment is confirmed, and kept once the order
      // is settled in full — the customer's record of "you confirmed my
      // ₱276 at 2:15pm" shouldn't vanish when the balance is collected.
      // Cleared only if the payment is walked back to unpaid.
      ...(status === "partial"
        ? { downpayment_confirmed_at: now }
        : status === "unpaid" || status === "refunded"
          ? { downpayment_confirmed_at: null }
          : {}),
    })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateOrders();
  return { error: null };
}
