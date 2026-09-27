/**
 * When to ask a customer for a Google review, and when to leave them alone.
 *
 * ── The moment that works ───────────────────────────────────────────────
 *
 * A Google review is worth more to this shop than almost anything else on
 * the site: it is what decides whether somebody searching "food near
 * Apalit" is shown the stall at all. Which makes it exactly the thing worth
 * asking for badly, and a shop that asks badly gets ignored.
 *
 * Three rules, and all three are restraint:
 *
 *   ONLY AFTER THEY HAVE RATED SOMETHING HERE. Somebody who has just given
 *   the shop five stars has already said the thing; asking them to say it
 *   again somewhere else is a small favour between people who are getting
 *   on. Asking first, of a customer who has said nothing, is a shop more
 *   interested in its rating than in feeding them — and it converts about
 *   as well as it reads.
 *
 *   ONLY ON THE NEWEST FINISHED ORDER. A regular with twenty completed
 *   orders should meet this once on the page, not twenty times. Choosing
 *   the newest needs no stored state and cannot drift.
 *
 *   AND ONLY WHILE IT IS STILL RECENT. A review about a meal you had last
 *   month is an honest thing to write. One about a meal you had last year
 *   is not something people write, and being asked for it reads as a shop
 *   that has not noticed you stopped coming.
 *
 * The fourth restraint is not here because it is not a rule — it is the
 * customer's own answer. Saying no is remembered in the browser, so a
 * dismissal sticks; see `GoogleReviewNudge`.
 */

/** Past this, the meal is too far back to write about honestly. */
export const ASK_WITHIN_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export type AskableOrder = {
  id: string;
  status: string;
  /** When it was placed. */
  created_at: string | Date;
};

/**
 * The one order that may carry the ask, or nothing.
 *
 * Returns an id rather than a boolean per order so the caller cannot
 * accidentally light up two of them — the decision is made once, here, over
 * the whole list.
 */
export function orderToAskOn(
  orders: AskableOrder[],
  now: Date = new Date()
): string | null {
  let best: { id: string; at: number } | null = null;

  for (const o of orders) {
    if (o.status !== "completed") continue;
    const at = new Date(o.created_at).getTime();
    // An unparseable date is not a recent order. Skipped rather than
    // treated as now, which would put the ask on the one row whose data is
    // broken.
    if (!Number.isFinite(at)) continue;
    // Future-dated rows (a clock skew, a scheduled order) are still valid
    // "recent" — what is excluded is only the far past.
    if (now.getTime() - at > ASK_WITHIN_DAYS * DAY) continue;
    if (!best || at > best.at) best = { id: o.id, at };
  }

  return best?.id ?? null;
}
