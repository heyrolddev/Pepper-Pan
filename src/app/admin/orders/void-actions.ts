"use server";

import { can, getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncStockForStatus } from "@/lib/stock-server";
import { NOT_ON_SHIFT, offShift } from "@/lib/shift-guard";
import { cleanVoidReason } from "@/lib/order-void";
import {
  labelOf,
  nameOf,
  recordOrderEvent,
  revalidateOrders,
  type NamedOrder,
} from "@/lib/orders-admin-write";

/**
 * Striking a ticket out, as its own action in its own file.
 *
 * It is NOT a branch of `setOrderStatus`, and that is deliberate. A status
 * change is a thing that happens to a real order as it moves through the
 * shop; a void says the order was never real. Folding the second into the
 * first would give that function two meanings, a reason list that only
 * applies to half of them, and a flag to tell them apart — which is how a
 * feature stops being readable six months later.
 *
 * Two files, one job each.
 */

/**
 * Strike a ticket out of the day.
 *
 * The write is a cancellation plus a mark, in ONE statement. Two statements
 * would leave a window where the order is cancelled and nothing says why,
 * and 0076's constraint would refuse the second half anyway — which is the
 * constraint doing its job rather than getting in the way.
 */
export async function voidOrder(
  orderId: string,
  reason: string
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "orders")) return { error: "Not allowed." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const why = cleanVoidReason(reason);
  if (why.error) return { error: why.error };

  const supabase = await createClient();

  // `.select()` matters: without it PostgREST reports success even when a
  // row-level security policy silently matched nothing.
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      void_reason: why.reason,
      // The same stamps a cancellation gets, because the question "who did
      // this and when" has the same answer and the board already reads
      // these three. `cancelled_reason` carries the void's own words so
      // every existing reader — the row, the ledger, the export — says
      // something true without being taught about voids first.
      cancelled_reason: why.reason,
      cancelled_by: viewer?.profile?.id ?? null,
      cancelled_at: new Date().toISOString(),
      // A struck-out ticket stops owing an ETA.
      eta_minutes: null,
      eta_set_at: null,
    })
    .eq("id", orderId)
    // Voiding an already-voided ticket is a double tap, not a second event.
    // Refusing it here keeps one void per order and one line in the log.
    .is("voided_at", null)
    .select("id, ticket, contact_name");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That ticket is already voided, or it is not yours to change." };
  }

  // The food goes back on the shelf. Idempotent, and it correctly returns
  // nothing for an order that never had stock deducted — a pending ticket
  // voided before anyone accepted it took no pork off the shelf, and handing
  // it back would invent food that was never there.
  await syncStockForStatus(orderId, "cancelled");

  // No customer notification, and that is the difference from cancelling.
  // A void is a correction to the shop's own books. Telling a customer their
  // order was "cancelled" because a cashier double-punched a ticket that was
  // never theirs is a message about somebody else's mistake.
  await recordOrderEvent(
    `${nameOf(viewer)} voided ${labelOf((data as NamedOrder[])[0])} — ${why.reason}`,
    viewer?.profile?.id ?? null
  );

  revalidateOrders();
  return { error: null };
}
