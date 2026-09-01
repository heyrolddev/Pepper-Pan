"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { SHOP_ROLES } from "@/lib/permissions";

/**
 * Clearing the practice data before the shop goes live for real.
 *
 * Everything built during setup — the pretend orders, the menu typed in to see
 * how it looked, the chat used to test a reply — has to go before the first
 * real customer, or the shop's first month of figures is half fiction. Doing
 * it by hand in the database means writing delete statements against a live
 * system, which is exactly the sort of afternoon that ends badly.
 *
 * So this exists. And because it exists, it is the single most destructive
 * button in the whole system, which is why nothing about it is convenient:
 *
 *   - The owner only. Staff can run the shop; they cannot erase it.
 *   - The password, typed again, right now. A logged-in session left open on a
 *     counter tablet is not proof that the owner is the one pressing this.
 *   - The word RESET, typed out. Muscle memory can survive a confirm dialog;
 *     it does not survive being asked to spell something.
 *   - Counts shown first, so the decision is made against real numbers rather
 *     than a guess about what is in there.
 *
 * And a hard boundary on what it can touch: settings, hours, delivery, payment
 * details, saved devices and every account — including the customers' — are
 * never in scope. This clears *records*, not the shop.
 */

export type ResetScope = {
  /** Orders, their lines, and the reviews written about them. */
  orders: boolean;
  /** Every dish, so the real menu can be typed from scratch. */
  menu: boolean;
  /** Ask Pepper Pan threads and the answers taught to it. */
  chat: boolean;
  /** Orders placed from an owner or staff account while testing. */
  staffOrders: boolean;
};

export type ResetCounts = {
  orders: number;
  meals: number;
  reviews: number;
  chats: number;
  staffOrders: number;
};

/**
 * Who counts as the shop rather than a customer.
 *
 * Read fresh each time rather than stored on the order, because a role can
 * change — a staff account that becomes a customer, or the reverse — and the
 * question being asked is "is this the shop's own test order", which is about
 * who they are now.
 */
async function staffAccountIds(
  db: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const { data } = await db
    .from("profiles")
    .select("id")
    .in("role", SHOP_ROLES);
  return (data ?? []).map((r) => r.id as string);
}

/** What's actually in there, so nobody deletes on a guess. */
export async function countResettable(): Promise<ResetCounts> {
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "owner") {
    return { orders: 0, meals: 0, reviews: 0, chats: 0, staffOrders: 0 };
  }

  const db = createAdminClient();
  const count = async (table: string) => {
    const { count: n } = await db
      .from(table)
      .select("id", { count: "exact", head: true });
    return n ?? 0;
  };

  const [orders, meals, reviews, chats, staffIds] = await Promise.all([
    count("orders"),
    count("meals"),
    count("reviews"),
    count("chat_threads"),
    staffAccountIds(db),
  ]);

  const { count: staffOrders } = staffIds.length
    ? await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("customer_id", staffIds)
    : { count: 0 };

  return { orders, meals, reviews, chats, staffOrders: staffOrders ?? 0 };
}

export type ResetResult =
  | { ok: true; deleted: string[] }
  | { ok: false; error: string };

export async function resetShopData(input: {
  password: string;
  confirmation: string;
  scope: ResetScope;
}): Promise<ResetResult> {
  const viewer = await getViewer();

  // Staff run the shop; they don't get to erase it.
  if (viewer?.profile?.role !== "owner") {
    return { ok: false, error: "Only the owner can reset shop data." };
  }
  if (input.confirmation.trim().toUpperCase() !== "RESET") {
    return { ok: false, error: 'Type RESET in the box to confirm.' };
  }
  if (!input.password) {
    return { ok: false, error: "Enter your password." };
  }
  if (
    !input.scope.orders &&
    !input.scope.menu &&
    !input.scope.chat &&
    !input.scope.staffOrders
  ) {
    return { ok: false, error: "Choose at least one thing to clear." };
  }

  // Re-authenticate rather than trusting the session. A signed-in tab left
  // open on a counter tablet is not the same as the owner being here.
  //
  // On a throwaway anon client that persists nothing: doing this on the
  // request-bound client would rewrite the session cookies mid-request, and
  // the service-role client is the wrong tool for a password grant.
  const check = await createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ).auth.signInWithPassword({
    email: viewer.email,
    password: input.password,
  });
  if (check.error) {
    return { ok: false, error: "That password doesn't match. Nothing was deleted." };
  }

  const db = createAdminClient();
  const deleted: string[] = [];

  // A predicate that matches every row. PostgREST refuses an unfiltered
  // delete, which is a good rule — this states the intent explicitly instead
  // of working around it silently.
  const all = "00000000-0000-0000-0000-000000000000";

  try {
    if (input.scope.orders) {
      // Reviews first: they point at orders and at meals, and a review of a
      // deleted order is a row nobody can explain later.
      const r = await db.from("reviews").delete().neq("id", all).select("id");
      if (r.error) throw new Error(`reviews: ${r.error.message}`);
      deleted.push(`${r.data?.length ?? 0} reviews`);

      // Orders cascade to their lines, but say it anyway: relying on a
      // cascade means a schema change elsewhere could quietly leave orphans.
      const l = await db.from("order_lines").delete().neq("order_id", all).select("id");
      if (l.error) throw new Error(`order lines: ${l.error.message}`);

      const o = await db.from("orders").delete().neq("id", all).select("id");
      if (o.error) throw new Error(`orders: ${o.error.message}`);
      deleted.push(`${o.data?.length ?? 0} orders`);
    }

    // Before the blanket order wipe, so ticking both doesn't run this against
    // rows that have already gone.
    if (input.scope.staffOrders && !input.scope.orders) {
      const staffIds = await staffAccountIds(db);
      if (staffIds.length) {
        // Reviews first, same as the full wipe: a review pointing at a deleted
        // order is a row nobody can explain later.
        const r = await db
          .from("reviews")
          .delete()
          .in("customer_id", staffIds)
          .select("id");
        if (r.error) throw new Error(`staff reviews: ${r.error.message}`);

        const { data: ids } = await db
          .from("orders")
          .select("id")
          .in("customer_id", staffIds);
        const orderIds = (ids ?? []).map((o) => o.id as string);

        if (orderIds.length) {
          const l = await db
            .from("order_lines")
            .delete()
            .in("order_id", orderIds)
            .select("id");
          if (l.error) throw new Error(`staff order lines: ${l.error.message}`);
        }

        const o = await db
          .from("orders")
          .delete()
          .in("customer_id", staffIds)
          .select("id");
        if (o.error) throw new Error(`staff orders: ${o.error.message}`);
        deleted.push(`${o.data?.length ?? 0} staff test orders`);
      } else {
        deleted.push("0 staff test orders");
      }
    }

    if (input.scope.chat) {
      const m = await db.from("chat_messages").delete().neq("thread_id", all).select("id");
      if (m.error) throw new Error(`chat messages: ${m.error.message}`);

      const t = await db.from("chat_threads").delete().neq("id", all).select("id");
      if (t.error) throw new Error(`chat threads: ${t.error.message}`);
      deleted.push(`${t.data?.length ?? 0} chat threads`);

      const f = await db.from("faq_entries").delete().neq("id", all).select("id");
      if (f.error) throw new Error(`taught answers: ${f.error.message}`);
      deleted.push(`${f.data?.length ?? 0} taught answers`);
    }

    if (input.scope.menu) {
      // Orders reference meals, so the menu can only go once they have. Said
      // plainly rather than letting the database refuse with a foreign-key
      // error the owner would have to decode.
      if (!input.scope.orders) {
        const { count: remaining } = await db
          .from("orders")
          .select("id", { count: "exact", head: true });
        if ((remaining ?? 0) > 0) {
          return {
            ok: false,
            error:
              "The menu can't be cleared while orders still reference it. Tick orders as well, or clear those first.",
          };
        }
      }

      const meals = await db.from("meals").delete().neq("id", all).select("id");
      if (meals.error) throw new Error(`menu: ${meals.error.message}`);
      deleted.push(`${meals.data?.length ?? 0} dishes`);
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Stopped partway: ${err.message}`
          : "Something went wrong partway through.",
    };
  }

  return { ok: true, deleted };
}
