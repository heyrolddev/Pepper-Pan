import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders";
import { pushConfigured, pushToStaff, pushToUser } from "@/lib/push";

/**
 * Telling people something happened once they've closed the tab.
 *
 * Everything else in this system reaches someone only while they're looking
 * at it, and both sides of a food stall put their phone away: the customer
 * after ordering, the owner because they're cooking. These are the channels
 * that follow them.
 *
 * Two of them, and either can be absent. Email needs a paid key
 * (RESEND_API_KEY); push needs a VAPID keypair the shop generates itself and
 * therefore costs nothing. Whichever is configured is used, and with neither
 * configured nothing is sent and nothing breaks.
 */

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.SHOP_FROM_EMAIL);
}

/**
 * Steps a customer actually wants to hear about, away from the site.
 *
 * `preparing` is here because the gap between "confirmed" and "ready" is the
 * longest silence in the whole order, and it's the stretch where someone
 * starts wondering whether anything is happening at all. `completed` is not:
 * by the time an order is completed the customer is holding the food, and a
 * phone buzzing to say so is noise.
 */
const WORTH_SENDING: OrderStatus[] = [
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "cancelled",
];

function subjectFor(status: OrderStatus, ref: string): string {
  switch (status) {
    case "confirmed":
      return `Your Pepper Pan order is confirmed (#${ref})`;
    case "preparing":
      return `We're cooking your Pepper Pan order (#${ref})`;
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
    case "preparing":
      return "Your food is on the wok now. We'll message you again the moment it's ready.";
    case "ready":
      return fulfillment === "delivery"
        ? "Your food is ready and waiting for a rider. They'll call or text you when they're close, so keep your phone nearby."
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
 * The same news, in the length a lock screen actually shows.
 *
 * An email can afford a greeting; a notification gets about forty characters
 * before the phone truncates it, so the useful word goes first.
 */
function pushBodyFor(status: OrderStatus, fulfillment: string): string {
  switch (status) {
    case "confirmed":
      return "The kitchen has it. We'll tell you when it's ready.";
    case "preparing":
      return "On the wok now. Not long. 🔥";
    case "ready":
      return fulfillment === "delivery"
        ? "Waiting for a rider — they'll ring you. Keep your phone nearby. 📱"
        : "Ready for pickup — in front of Palengkeni, beside Osave.";
    case "out_for_delivery":
      return "On its way to you. Keep your phone nearby. 🛵";
    case "cancelled":
      return "Sorry — we had to cancel this one. Tap for details.";
    default:
      return "There's an update on your order.";
  }
}

function pushTitleFor(status: OrderStatus, ref: string): string {
  switch (status) {
    case "confirmed":
      return `Order confirmed · #${ref}`;
    case "preparing":
      return `Cooking now 🍳 · #${ref}`;
    case "ready":
      return `Your order is ready 🍜 · #${ref}`;
    case "out_for_delivery":
      return `On the way 🛵 · #${ref}`;
    case "cancelled":
      return `Order cancelled · #${ref}`;
    default:
      return `Order update · #${ref}`;
  }
}

async function sendEmail(
  to: string,
  status: OrderStatus,
  ref: string,
  firstName: string,
  fulfillment: string,
  reason: string | null
): Promise<void> {
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
        bodyFor(status, fulfillment, reason),
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
}

/**
 * Send one status update, at most once per step, on every channel that's set
 * up.
 *
 * `notified_status` is claimed before anything is sent, so a retry or a
 * double status change can't tell someone twice. One claim covers both
 * channels deliberately: claiming per channel would mean a mail failure
 * suppressing the push, and two claims would mean a customer with both
 * getting told twice.
 */
export async function notifyOrderStatus(orderId: string): Promise<void> {
  const email = emailConfigured();
  const push = pushConfigured();
  if (!email && !push) return;

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

    // Neither channel may hold up the other, and neither may throw: the order
    // moving is what actually matters.
    await Promise.allSettled([
      push
        ? pushToUser(order.customer_id, {
            title: pushTitleFor(status, ref),
            body: pushBodyFor(status, order.fulfillment),
            url: "/orders",
            // One order, one slot on the lock screen.
            tag: `order-${order.id}`,
          })
        : Promise.resolve(),
      email
        ? (async () => {
            // The address lives on the auth user, not the profile.
            const { data: userRes } = await db.auth.admin.getUserById(
              order.customer_id
            );
            const to = userRes?.user?.email;
            if (!to) return;
            await sendEmail(
              to,
              status,
              ref,
              firstName,
              order.fulfillment,
              order.cancelled_reason
            );
          })()
        : Promise.resolve(),
    ]);
  } catch {
    // A notification is a courtesy. It must never take down the status change
    // that triggered it — the order moving is what actually matters.
  }
}

/**
 * Tell the shop an order just came in.
 *
 * This is the notification the business actually runs on. Without it, an
 * order is only seen if someone happens to be looking at the Orders tab, and
 * a stall's owner is by definition not looking at a screen. There's no
 * claim-once guard because there's no retry path: an order is inserted once.
 */
export async function notifyNewOrder(orderId: string): Promise<void> {
  if (!pushConfigured()) return;

  try {
    const db = createAdminClient();
    const { data: order } = await db
      .from("orders")
      .select(
        "id, contact_name, fulfillment, revenue, delivery_fee, scheduled_for"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const total =
      Number(order.revenue ?? 0) + Number(order.delivery_fee ?? 0);
    const who = (order.contact_name ?? "").trim() || "Walk-in";
    const how = order.fulfillment === "delivery" ? "Delivery" : "Pickup";

    // An advance order that reads like a normal one gets cooked immediately,
    // so the notification has to say so before anything else does.
    const when = order.scheduled_for ? " · SCHEDULED" : "";

    await pushToStaff({
      title: `New order · ₱${total.toLocaleString("en-PH")}`,
      body: `${who} · ${how}${when}`,
      url: "/admin/orders",
      // Not collapsed by order: two orders in a minute are two things to
      // cook, and one must never hide the other.
      tag: `new-order-${order.id}`,
    });
  } catch {
    // Same bargain: the order is already saved. A silent notification is a
    // missed ping; a thrown one would be a lost sale.
  }
}
