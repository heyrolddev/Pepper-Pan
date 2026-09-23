"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { SHOP_ROLES } from "@/lib/permissions";
import { takeSafetyNet } from "@/lib/safety-net";

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
  /**
   * The stock side of the shop.
   *
   * Absent until the owner cleared the shop before a real import and found
   * the practice inventory still sitting there. The screen had promised to
   * clear "the practice data" and had quietly meant four kinds of it.
   *
   * What it clears depends on `inventoryMode` — see below, because the two
   * answers are very far apart.
   */
  inventory: boolean;
  /**
   * How much of the stock side goes.
   *
   *   "counts"      the numbers, and nothing else. Every ingredient, batch
   *                 and recipe survives with its name, unit, cost, yield and
   *                 every gram and piece in it. What goes to zero is how much
   *                 is on the shelf, and the movement history that got it
   *                 there.
   *
   *   "everything"  the ingredients and batches themselves, and the recipes
   *                 built on them.
   *
   * Two modes rather than one, because they answer completely different
   * questions and the difference is a fortnight of typing. "I practised with
   * fake restocks and fake sales, and my counts are fiction" is the common
   * one, and it has nothing to do with the recipe book being wrong. Wiping
   * the recipes to fix the counts is like burning the cookbook because the
   * pantry needs recounting — which is what this button used to do, with no
   * way to ask for anything gentler.
   */
  inventoryMode: "counts" | "everything";
  /** The cash ledger, bills, assets, utang, supplier debts and running costs. */
  money: boolean;
  /**
   * How much of the money side goes.
   *
   *   "records"     every entry: the ledger, the bills, the assets, the
   *                 utang, the supplier debts, the running costs and the
   *                 marketing spend.
   *
   *   "everything"  those, plus the opening balances — the figures typed in
   *                 to say what was in the cash box, the GCash wallet and the
   *                 bank on day one.
   *
   * Split because the opening balances are the one part of the money side
   * that lives in `settings`, and settings are otherwise never in scope here.
   * Clearing them silently would break the promise at the top of this file;
   * not offering them at all leaves a practice bank balance sitting under a
   * ledger that has been wiped, which is its own kind of wrong number.
   */
  moneyMode: "records" | "everything";
  /**
   * The audit trail: who did what, and what each shift took.
   *
   * Its own tick because it is neither an order nor a peso — it is the record
   * of the shop being run, and a practice month of it is a staff report full
   * of shifts nobody worked.
   */
  history: boolean;
};

export type ResetCounts = {
  orders: number;
  meals: number;
  reviews: number;
  chats: number;
  staffOrders: number;
  ingredients: number;
  batches: number;
  cashEntries: number;
  /** Activity-log lines plus recorded shifts. */
  history: number;
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
    return {
      orders: 0, meals: 0, reviews: 0, chats: 0, staffOrders: 0,
      ingredients: 0, batches: 0, cashEntries: 0, history: 0,
    };
  }

  const db = createAdminClient();
  const count = async (table: string) => {
    const { count: n } = await db
      .from(table)
      .select("id", { count: "exact", head: true });
    return n ?? 0;
  };

  const [
    orders, meals, reviews, chats, ingredients, batches, cashEntries,
    activity, shifts, staffIds,
  ] = await Promise.all([
    count("orders"),
    count("meals"),
    count("reviews"),
    count("chat_threads"),
    count("ingredients"),
    count("batches"),
    count("cash_ledger"),
    count("activity_log"),
    count("staff_shifts"),
    staffAccountIds(db),
  ]);

  const { count: staffOrders } = staffIds.length
    ? await db
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("customer_id", staffIds)
    : { count: 0 };

  return {
    orders, meals, reviews, chats, ingredients, batches, cashEntries,
    history: activity + shifts,
    staffOrders: staffOrders ?? 0,
  };
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
    !input.scope.staffOrders &&
    !input.scope.inventory &&
    !input.scope.money &&
    !input.scope.history
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

  // The same net as the restore, for the same reason and with more force:
  // this button only deletes. There is no version of "the reset went wrong"
  // that is recoverable without a copy taken beforehand.
  const net = await takeSafetyNet(
    `Before clearing ${
      [
        input.scope.orders && "orders",
        input.scope.menu && "the menu",
        input.scope.chat && "chat",
        input.scope.staffOrders && "staff test orders",
        input.scope.inventory &&
          (input.scope.inventoryMode === "everything"
            ? "inventory, batches and recipes"
            : "stock counts (keeping ingredients and recipes)"),
        input.scope.money &&
          (input.scope.moneyMode === "everything"
            ? "money records and opening balances"
            : "money records"),
        input.scope.history && "the activity log and shift records",
      ]
        .filter(Boolean)
        .join(", ") || "nothing"
    }`
  );
  if (!net.ok) {
    return {
      ok: false,
      error: `Stopped before deleting anything: the safety copy could not be taken (${net.error}). Nothing has changed.`,
    };
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

    // Anything that is not, exactly, the destructive word falls to the gentle
    // branch. A stale browser tab posting the older shape of this form sends
    // no mode at all, and the one thing that must never happen by default is
    // the recipe book going.
    const wipeInventory =
      input.scope.inventory && input.scope.inventoryMode === "everything";
    const zeroInventory = input.scope.inventory && !wipeInventory;

    if (zeroInventory) {
      /**
       * The numbers, and only the numbers.
       *
       * What survives: every ingredient with its name, unit and cost; every
       * batch with its name and yield; every recipe line with its grams and
       * pieces; every batch recipe; every packaging line. None of that is
       * touched, because none of it is a count — it is the shop's own
       * knowledge of how its food is made, and it took weeks to type.
       *
       * What goes: how much is on the shelf, and the movement history that
       * produced it. The history has to go with the counts rather than be
       * left behind, and that is not tidiness. `consumption_log` is what the
       * reorder suggestions are computed from, so a zeroed shelf with a month
       * of practice sales still in the log would tell the owner to buy pork
       * for customers who never existed. Stock at zero and a usage history
       * that disagrees with it is worse than either on its own.
       */
      const lots = await db.from("ingredient_lots").delete().neq("id", all).select("id");
      if (lots.error) throw new Error(`stock lots: ${lots.error.message}`);

      const pl = await db.from("purchase_log").delete().neq("id", all).select("id");
      if (pl.error) throw new Error(`purchase log: ${pl.error.message}`);

      const cl = await db.from("consumption_log").delete().neq("id", all).select("id");
      if (cl.error) throw new Error(`consumption log: ${cl.error.message}`);

      const w = await db.from("waste_log").delete().neq("id", all).select("id");
      if (w.error) throw new Error(`waste log: ${w.error.message}`);

      const cc = await db.from("cycle_counts").delete().neq("id", all).select("id");
      if (cc.error) throw new Error(`stock counts: ${cc.error.message}`);

      // The two running totals themselves. Set, not deleted — the row is the
      // ingredient, and the ingredient stays.
      const zi = await db
        .from("ingredients")
        .update({ stock: 0 })
        .neq("id", all)
        .select("id");
      if (zi.error) throw new Error(`ingredient counts: ${zi.error.message}`);

      const zb = await db
        .from("batches")
        .update({ batch_stock: 0 })
        .neq("id", all)
        .select("id");
      if (zb.error) throw new Error(`batch counts: ${zb.error.message}`);

      deleted.push(`${zi.data?.length ?? 0} ingredient counts set to zero`);
      deleted.push(`${zb.data?.length ?? 0} batch counts set to zero`);
      deleted.push(`${lots.data?.length ?? 0} stock lots`);
      deleted.push(`${pl.data?.length ?? 0} purchases`);
      deleted.push(`${w.data?.length ?? 0} waste entries`);
      deleted.push("recipes, ingredients and batches kept");
    }

    if (wipeInventory) {
      // Order matters here in a way it does not elsewhere in this function,
      // because these tables point at each other and only some of those
      // pointers cascade. `ingredient_lots`, `purchase_log` and
      // `consumption_log` would follow their ingredient out on their own;
      // `batch_ingredients` and `waste_log` would not, and would instead
      // refuse the delete with a foreign-key error. So everything that points
      // at an ingredient goes first, by hand, in the order that keeps every
      // reference valid at every step.
      //
      // Recipes go too. A recipe line naming an ingredient that no longer
      // exists is not a recipe — it is a dish that silently costs nothing,
      // which is worse than a dish with no recipe at all, because it still
      // adds up.
      const ri = await db.from("meal_ingredients").delete().neq("meal_id", all).select("id");
      if (ri.error) throw new Error(`recipes: ${ri.error.message}`);

      const rp = await db.from("meal_packaging").delete().neq("meal_id", all).select("id");
      if (rp.error) throw new Error(`packaging: ${rp.error.message}`);

      const w = await db.from("waste_log").delete().neq("id", all).select("id");
      if (w.error) throw new Error(`waste log: ${w.error.message}`);

      const bi = await db.from("batch_ingredients").delete().neq("batch_id", all).select("id");
      if (bi.error) throw new Error(`batch recipes: ${bi.error.message}`);

      const b = await db.from("batches").delete().neq("id", all).select("id");
      if (b.error) throw new Error(`batches: ${b.error.message}`);

      // These three cascade from `ingredients` anyway. Deleted explicitly all
      // the same: relying on a cascade means a later schema change could drop
      // it and leave orphans that nobody thinks to look for.
      const lots = await db.from("ingredient_lots").delete().neq("id", all).select("id");
      if (lots.error) throw new Error(`stock lots: ${lots.error.message}`);

      const pl = await db.from("purchase_log").delete().neq("id", all).select("id");
      if (pl.error) throw new Error(`purchase log: ${pl.error.message}`);

      const cl = await db.from("consumption_log").delete().neq("id", all).select("id");
      if (cl.error) throw new Error(`consumption log: ${cl.error.message}`);

      const cc = await db.from("cycle_counts").delete().neq("id", all).select("id");
      if (cc.error) throw new Error(`stock counts: ${cc.error.message}`);

      const ing = await db.from("ingredients").delete().neq("id", all).select("id");
      if (ing.error) throw new Error(`ingredients: ${ing.error.message}`);

      deleted.push(`${ing.data?.length ?? 0} ingredients`);
      deleted.push(`${b.data?.length ?? 0} batches`);
      deleted.push(`${w.data?.length ?? 0} waste entries`);
      deleted.push(`${pl.data?.length ?? 0} purchases`);
    }

    if (input.scope.money) {
      // Nothing here references anything else, so the order is only the order
      // it reads in. Kept separate from inventory because the two answer
      // different questions — "what is on the shelf" and "what is in the
      // till" — and someone redoing a stock count has no reason to lose a
      // month of takings.
      const cash = await db.from("cash_ledger").delete().neq("id", all).select("id");
      if (cash.error) throw new Error(`cash ledger: ${cash.error.message}`);
      deleted.push(`${cash.data?.length ?? 0} cash entries`);

      const fc = await db.from("fixed_costs").delete().neq("id", all).select("id");
      if (fc.error) throw new Error(`monthly bills: ${fc.error.message}`);
      deleted.push(`${fc.data?.length ?? 0} monthly bills`);

      const a = await db.from("assets").delete().neq("id", all).select("id");
      if (a.error) throw new Error(`assets: ${a.error.message}`);
      deleted.push(`${a.data?.length ?? 0} assets`);

      const r = await db.from("receivables").delete().neq("id", all).select("id");
      if (r.error) throw new Error(`utang: ${r.error.message}`);
      deleted.push(`${r.data?.length ?? 0} utang records`);

      const oe = await db.from("oe_templates").delete().neq("id", all).select("id");
      if (oe.error) throw new Error(`cost templates: ${oe.error.message}`);

      /**
       * Three tables this scope always meant and never touched.
       *
       * `running_costs`, `supplier_debts` and `marketing_campaigns` arrived in
       * later migrations and nobody came back to add them here, so "money
       * records" quietly meant five of the eight things it says. An owner
       * clearing the practice data was left with practice utang to suppliers
       * and practice electricity bills, under a screen that had told them the
       * money was gone. Exactly the drift the backup file warns about, in the
       * one place where the failure is silent and the wrong number is money.
       */
      const sd = await db.from("supplier_debts").delete().neq("id", all).select("id");
      if (sd.error) throw new Error(`supplier utang: ${sd.error.message}`);
      deleted.push(`${sd.data?.length ?? 0} supplier utang records`);

      const rc = await db.from("running_costs").delete().neq("id", all).select("id");
      if (rc.error) throw new Error(`running costs: ${rc.error.message}`);
      deleted.push(`${rc.data?.length ?? 0} running costs`);

      const mc = await db.from("marketing_campaigns").delete().neq("id", all).select("id");
      if (mc.error) throw new Error(`marketing spend: ${mc.error.message}`);
      deleted.push(`${mc.data?.length ?? 0} marketing campaigns`);

      // The suppliers themselves stay. A supplier is a name and a phone
      // number the owner typed — the same kind of thing as an ingredient, and
      // not a record of anything that happened. What they were owed is gone;
      // who they are is not.

      if (input.scope.moneyMode === "everything") {
        /**
         * The opening balances: what was in the cash box, the GCash wallet
         * and the bank on day one.
         *
         * The one thing this whole file touches in `settings`, and the reason
         * it is behind its own choice rather than folded in. Left behind,
         * they are a practice bank balance sitting on top of a ledger that
         * has been wiped — every figure on the Money page built on a number
         * from a week of pretending.
         *
         * Zeroed and switched off, not deleted: the row is the shop's
         * settings and there is exactly one of it.
         */
        const bal = await db
          .from("settings")
          .update({
            cash_balance_enabled: false,
            cash_balance_starting_amount: 0,
            cash_balance_start_date: null,
            gcash_balance_enabled: false,
            gcash_balance_starting_amount: 0,
            gcash_balance_start_date: null,
            bank_balance_enabled: false,
            bank_balance_starting_amount: 0,
            bank_balance_start_date: null,
          })
          .eq("id", 1)
          .select("id");
        if (bal.error) throw new Error(`opening balances: ${bal.error.message}`);
        deleted.push("opening balances for cash, GCash and the bank");
      }
    }

    if (input.scope.history) {
      /**
       * Who did what, and what each shift took.
       *
       * Neither an order nor a peso, which is why it is its own tick and why
       * nothing cleared it until now: a practice month left the staff report
       * full of shifts nobody worked and an activity log of a shop that was
       * not open.
       *
       * Shifts can only go once the orders have, because `orders.shift_id`
       * points at them with no ON DELETE — Postgres would refuse, and the
       * owner would get a foreign-key error to decode. Said plainly instead.
       */
      const { count: remaining } = await db
        .from("orders")
        .select("id", { count: "exact", head: true });
      if ((remaining ?? 0) > 0 && !input.scope.orders) {
        return {
          ok: false,
          error:
            "Shift records can't be cleared while orders still point at them. Tick orders as well, or clear those first.",
        };
      }

      const sh = await db.from("staff_shifts").delete().neq("id", all).select("id");
      if (sh.error) throw new Error(`shifts: ${sh.error.message}`);
      deleted.push(`${sh.data?.length ?? 0} shift records`);

      const al = await db.from("activity_log").delete().neq("id", all).select("id");
      if (al.error) throw new Error(`activity log: ${al.error.message}`);
      deleted.push(`${al.data?.length ?? 0} activity log lines`);
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
