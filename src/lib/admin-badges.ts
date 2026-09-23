import "server-only";
import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import { countOpenErrors } from "@/lib/error-log";
import { ACTIVE_ORDER_STATUSES } from "@/lib/orders";
import { OUTSTANDING_PAYMENT_STATUSES } from "@/lib/payments";

/**
 * What is actually waiting for the owner, counted per screen.
 *
 * The sidebar's job is to say where you are. Its second job — the one it
 * couldn't do before — is to say where you're *needed*, without being opened.
 * A shop runs from a phone on a counter between orders, and "is there anything
 * for me?" should be answerable from whatever page happens to be up.
 *
 * So every count here is a thing the owner has to *do*, never a total — Orders
 * counts the ones still in flight, not the day's orders. A badge that never
 * reaches zero is decoration, and after a week it gets ignored, including on
 * the day it finally means something.
 *
 * Reviews is deliberately not here. An unanswered review costs the shop
 * nothing — nobody is waiting on their food because of it — so badging it
 * would put a number on the rail that the owner is right to ignore, and
 * numbers you're right to ignore teach you to ignore the rest.
 */
export type AdminBadges = {
  /** Orders still in flight — the shop owes food on every one of these. */
  orders: number;
  /** Chats the assistant handed over and nobody has picked up. */
  inbox: number;
  /** Money the shop hasn't got yet — receipts to check, and balances owed. */
  payments: number;
  /**
   * Devices asking to be let in.
   *
   * Belongs here by the rule above — somebody is standing at the counter
   * unable to work until the owner taps Allow, which is as much a thing that
   * has to be *done* as an order waiting on food.
   */
  staff: number;
  /**
   * Faults nobody has ticked off.
   *
   * Earns its place by the rule above — an open fault is a thing that has to
   * be *done*, and it is the one kind of news that arrives while the owner is
   * not looking. It had a counter written for it and no badge to put it in,
   * so the only ways to hear about a broken checkout were the push
   * notification (once, on the first occurrence) and happening to scroll down
   * on Today. Both are easy to miss, and a fault nobody has seen is a fault
   * that is still costing orders.
   *
   * Counted only for whoever can act on it — see `getAdminBadges`.
   */
  errors: number;
};

const NONE: AdminBadges = { orders: 0, inbox: 0, payments: 0, staff: 0, errors: 0 };

export async function getAdminBadges(): Promise<AdminBadges> {
  try {
    const db = await createClient();

    // `head: true` fetches no rows at all — the count comes back in a header.
    // This runs on every HQ page load, so it must cost about nothing.
    const count = async (
      label: string,
      build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
    ) => {
      const { count: n, error } = await build();
      // No badge is the right thing to show when we can't count — a wrong
      // number is worse than none. But swallowing the reason means a badge
      // that has quietly stopped working looks exactly like a clear queue,
      // so the reason goes to the server log.
      if (error) {
        console.error(`Badge count failed (${label}):`, error.message);
        return 0;
      }
      return n ?? 0;
    };

    /**
     * Only the owner is counted errors, and that is not squeamishness.
     *
     * The rule this file opens with is that every badge is a thing the reader
     * has to do. A cashier cannot resolve a fault, cannot read the log — the
     * panel is behind `settings` — and cannot make the number go down by any
     * action available to them. A permanent red number they can never clear
     * is the exact decoration the note above warns about, and it teaches them
     * to ignore the badges that ARE theirs: orders, and the inbox.
     */
    const mayFixThings = can(await getViewer(), "settings");

    const [orders, inbox, payments, staff, errors] = await Promise.all([
      count("orders", () =>
        db
          .from("orders")
          .select("id", { count: "exact", head: true })
          .in("status", ACTIVE_ORDER_STATUSES)
      ),
      count("inbox", () =>
        db
          .from("chat_threads")
          .select("id", { count: "exact", head: true })
          .eq("needs_human", true)
          .eq("handled", false)
      ),
      count("payments", () =>
        db
          .from("orders")
          .select("id", { count: "exact", head: true })
          // Anything the shop is still waiting on money for: nothing paid, a
          // receipt nobody has checked, or a down payment with the balance
          // outstanding. Only `paid` and `refunded` are settled, so the badge
          // clears exactly when the ledger's "Still owed" and "Needs checking"
          // queues do — the number and the page it opens agree.
          .in("payment_status", OUTSTANDING_PAYMENT_STATUSES)
          // A cancelled order owes nothing and can never be settled — left in,
          // it would sit on this badge forever.
          .neq("status", "cancelled")
      ),
      count("staff", () =>
        db
          .from("device_sessions")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      ),
      // Not through `count` above: the error log is read with the admin
      // client, because RLS on `error_log` keeps it away from the browser
      // entirely. `countOpenErrors` already swallows its own failure and
      // returns 0, for the same reason every count here does.
      mayFixThings ? countOpenErrors() : Promise.resolve(0),
    ]);

    return { orders, inbox, payments, staff, errors };
  } catch {
    // A missing migration must not take HQ down. No badges is a fair reading
    // of "we couldn't tell" — a wrong number would be worse than none.
    return NONE;
  }
}
