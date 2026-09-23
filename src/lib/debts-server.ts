import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";

/**
 * Writing down an utang, for the two flows that take one on.
 *
 * This is deliberately NOT in `spending-actions.ts`, and that is the whole
 * point of the file. Everything exported from a `"use server"` module is a
 * server action, which Next's own data-security guide describes as "reachable
 * via a direct POST request, not just through your application's UI" — and
 * tells you to verify authentication and authorization inside every one of
 * them. This function has no check of its own, because both its callers have
 * already made one; it was exported purely so `recordRestock` could reuse it
 * instead of keeping a second copy of "what a debt row looks like".
 *
 * That is the shape of a data-access helper, not of an endpoint. Next's dead-
 * code elimination happened to be covering for it — no client component
 * imports it, so no action id was minted for it and nothing was exposed — but
 * that protection lasts exactly until somebody adds the "record an utang"
 * button this function was written for. At that moment an unauthenticated
 * POST could write a supplier debt with the service-role key, and nothing in
 * the diff that added the button would have looked wrong.
 *
 * So it moves out of the endpoint file. The guide's own recommendation, near
 * enough word for word: keep the database logic in a `server-only` module and
 * let the `"use server"` actions stay thin.
 */
export async function recordDebt(input: {
  supplierId: string | null;
  supplierName: string | null;
  description: string;
  amount: number;
  source: "restock" | "spend" | "manual";
  note?: string | null;
  actorId?: string | null;
}): Promise<{ error: string | null }> {
  if (input.amount <= 0) return { error: null };

  const { error } = await createAdminClient().from("supplier_debts").insert({
    supplier_id: input.supplierId,
    // Frozen text, the way `orders.cogs` is frozen: a supplier renamed or
    // removed later must not silently relabel a debt already settled.
    supplier_name: input.supplierName,
    description: input.description,
    amount: input.amount,
    incurred_on: shopToday(),
    source: input.source,
    note: input.note ?? null,
    created_by: input.actorId ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}
