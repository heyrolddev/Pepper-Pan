import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { orderLabel } from "@/lib/tickets";

/**
 * The four things every action that writes to an order has to do.
 *
 * These lived inside `admin/orders/actions.ts` as module-private helpers,
 * which was right while that file was the only writer. Voiding a ticket is
 * its own feature in its own file, and it needs exactly the same four —
 * so they move here rather than being copied. A second copy of "who did
 * this, on the record" is a second copy that stops matching the first.
 */

/**
 * Every screen an order appears on.
 *
 * `/admin/payments` is in here because the payment verifier is rendered twice
 * — once inside the order list and once in the ledger — and marking a receipt
 * checked from either place changes both. Left out, the ledger kept showing a
 * payment as unverified until something else happened to refresh it.
 *
 * Marking a path the viewer is not currently on costs nothing: it is flagged
 * stale and rebuilt when somebody next opens it.
 */
export function revalidateOrders() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath("/orders");
}

/**
 * Who did this, on the record.
 *
 * Counter sales already carried `logged_by`, so a walk-in has always had a
 * name on it. An online order did not: moving one to "completed", or marking
 * a customer's GCash payment as received, changed the row and left nothing
 * saying who decided it. Those are the two moments most worth being able to
 * ask about later — one hands over food, the other says money arrived — and
 * "the system says it was paid" is not an answer when the drawer is short.
 *
 * Written with the admin client and never fatal: losing the log line is bad,
 * losing the change it describes because the log failed is worse.
 */
export async function recordOrderEvent(
  description: string,
  actorId: string | null
): Promise<void> {
  const { error } = await createAdminClient()
    .from("activity_log")
    .insert({ category: "orders", description, actor: actorId });
  if (error) console.error(`[orders] log: ${error.message}`);
}

/** A person, as they should read on the activity page. */
export function nameOf(viewer: Awaited<ReturnType<typeof getViewer>>): string {
  return viewer?.profile?.full_name?.trim() || viewer?.email || "someone";
}

/**
 * How the order should be named in the record.
 *
 * These lines used to carry the raw uuid — "set order 3f9c1a8e-… to
 * completed" — which is a record of something the owner cannot look up. The
 * ticket is what the receipt says, what the board shows and what the search
 * box on Orders matches, so it is what goes here, with the customer's name
 * beside it when there is one.
 */
export type NamedOrder = { ticket: number | null; contact_name: string | null };

export const labelOf = (row: NamedOrder | undefined) =>
  row ? orderLabel(row.ticket, row.contact_name) : "an order";
