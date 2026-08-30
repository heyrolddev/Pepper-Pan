import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders";

/**
 * Telling the customer their order moved, once they've closed the tab.
 *
 * Everything else in this system reaches people only while they're looking at
 * it, and a stall's customers order on a phone and put it away. This is the
 * one channel that follows them.
 *
 * Optional by design. With no RESEND_API_KEY nothing is sent and nothing
 * breaks — the same bargain as the rest of the shop: no key, no bill, one
 * feature quietly off rather than a broken page.
 */

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.SHOP_FROM_EMAIL);
}

/** Steps a customer actually wants to hear about, away from the site. */
const WORTH_SENDING: OrderStatus[] = [
  "confirmed",
  "ready",
  "out_for_delivery",
  "cancelled",
];

function subjectFor(status: OrderStatus, ref: string): string {
  switch (status) {
    case "confirmed":
      return `Your Pepper Pan order is confirmed (#${ref})`;
    case "ready":
      return `Your Pepper Pan order is ready (#${ref})`;
    case "out_for_delivery":
      return `Your Pepper Pan order is on the way (#${ref})`;
    case "cancelled":
      return `Your Pepper Pan order was cancelled (#${ref})`;
    default:
      return `Update on your Pepper Pan order (#${ref})`;
  }
}

function bodyFor(
  status: OrderStatus,
  fulfillment: string,
  reason: string | null
): string {
  switch (status) {
    case "confirmed":
      return "Salamat! We've got your order and the kitchen has it. We'll let you know the moment it's ready.";
    case "ready":
      return fulfillment === "delivery"
        ? "Your food is ready and waiting for a rider. We'll tell you when it leaves."
        : "Your food is ready for pickup — we're in front of Palengkeni, beside Osave.";
    case "out_for_delivery":
      return "Your rider has left the stall. Keep your phone nearby. 🛵";
    case "cancelled":
      return reason?.trim()
        ? `Sorry — we had to cancel this one. ${reason.trim()}`
        : "Sorry — we had to cancel this order. Please give us a ring if you'd like to reorder.";
    default:
      return "There's an update on your order.";
  }
}

/**
 * Send one status update, at most once per step.
 *
 * `notified_status` is written before the send so a retry or a double status
 * change can't email twice; a failed send costs one notification rather than
 * risking a customer's inbox.
 */
export async function notifyOrderStatus(orderId: string): Promise<void> {
  if (!emailConfigured()) return;

  try {
    const db = createAdminClient();

    const { data: order } = await db
      .from("orders")
      .select(
        "id, customer_id, status, fulfillment, cancelled_reason, notified_status, contact_name"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return;

    const status = order.status as OrderStatus;
    if (!WORTH_SENDING.includes(status)) return;
    if (order.notified_status === status) return;

    // The address lives on the auth user, not the profile.
    const { data: userRes } = await db.auth.admin.getUserById(order.customer_id);
    const to = userRes?.user?.email;
    if (!to) return;

    // Claim the step first: a send that fails is better than one that repeats.
    const { data: claimed } = await db
      .from("orders")
      .update({ notified_status: status })
      .eq("id", orderId)
      .neq("notified_status", status)
      .select("id");
    if (!claimed?.length) return;

    const ref = order.id.slice(0, 8);
    const firstName = (order.contact_name ?? "").trim().split(/\s+/)[0] || "there";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SHOP_FROM_EMAIL,
        to,
        subject: subjectFor(status, ref),
        text: [
          `Hi ${firstName},`,
          "",
          bodyFor(status, order.fulfillment, order.cancelled_reason),
          "",
          `Status: ${STATUS_LABELS[status]}`,
          `Order #${ref}`,
          "",
          "Pepper Pan — in front of Palengkeni, beside Osave, Apalit",
          "+63 947 353 3060",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // A notification is a courtesy. It must never take down the status change
    // that triggered it — the order moving is what actually matters.
  }
}
