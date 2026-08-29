"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments";

const BLOCKED_MESSAGE =
  "The database didn't accept that change. Re-run the latest migration (0004) in the Supabase SQL Editor.";

function revalidateOrders() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/orders");
}

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
    .update({ status })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

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
    .update({ eta_minutes: minutes })
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
    .update({ status: "cancelled", cancelled_reason: reason.trim() || "Cancelled by the shop" })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      payment_status: status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateOrders();
  return { error: null };
}
