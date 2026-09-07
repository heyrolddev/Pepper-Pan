/**
 * The rules for a review the shop was sent, rather than one a customer posted.
 *
 * Pure, and in its own file, for the same reason `media.ts` is: this is the
 * only part of the relay feature that can be tested without a database or a
 * browser, and it is the part most likely to be quietly wrong. A date typed
 * into a form and turned into a timestamp is a classic off-by-one-day bug,
 * and nobody notices until the review timeline reads oddly weeks later.
 */

/**
 * First name only — a review is public, a full name doesn't need to be.
 *
 * Lives here rather than beside the card that renders it: it is the rule for
 * how the shop names a customer in public, it is used by three different
 * surfaces, and being a plain function of a string is what makes it testable.
 */
export function displayName(fullName: string | null): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  if (!first) return "A customer";
  return first;
}

/** The shop's clock. UTC+8, no daylight saving, so a date here is never ambiguous. */
const MANILA_OFFSET = "+08:00";

export type RelayedInput = {
  authorName: string;
  rating: number;
  comment: string;
  /** YYYY-MM-DD, or blank for "today". */
  receivedOn: string;
};

export type RelayedReview = {
  authorName: string;
  rating: number;
  comment: string | null;
  /** ISO timestamp to file it under, or null to let the database use now(). */
  createdAt: string | null;
};

/**
 * A calendar date as an instant in the middle of that day in Manila.
 *
 * Midday rather than midnight. A date stored as midnight Manila is 16:00 the
 * previous day in UTC, and anything that later formats it in a different
 * timezone — a log, a spreadsheet, a developer's laptop — shows the day
 * before. Midday has twelve hours of slack in both directions, so the day
 * reads the same however it is handled.
 */
export function manilaMidday(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = new Date(`${day}T12:00:00${MANILA_OFFSET}`);
  if (Number.isNaN(at.getTime())) return null;
  // `new Date` accepts 2026-02-31 and rolls it silently into March. A date
  // that comes back as a different day than the one typed was never a real
  // date, and the shop should be told so rather than have its review filed
  // three days later than it says.
  return dayInManila(at) === day ? at.toISOString() : null;
}

/** Which calendar day an instant falls on, in Manila. */
function dayInManila(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(at);
}

/** How far ahead of "now" a typed date is still treated as today's. */
const FUTURE_SLACK_MS = 12 * 60 * 60 * 1000;

/**
 * Check and normalise what the owner typed, or say what's wrong with it in a
 * sentence they can act on.
 */
export function prepareRelayedReview(
  input: RelayedInput,
  now: number = Date.now()
): { error: string } | { review: RelayedReview } {
  const authorName = input.authorName.trim().replace(/\s+/g, " ");
  if (authorName.length < 2) {
    return { error: "Whose review is it? Put at least their first name." };
  }
  if (authorName.length > 60) {
    return { error: "That name is too long — a first name is enough." };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { error: "Pick how many stars they gave, 1 to 5." };
  }

  const comment = input.comment.trim();
  if (comment.length > 1000) {
    return { error: "Please keep it under 1000 characters." };
  }

  let createdAt: string | null = null;
  const day = input.receivedOn.trim();
  if (day) {
    createdAt = manilaMidday(day);
    if (!createdAt) return { error: "That date didn't make sense — use the date picker." };
    // A review dated in the future is a typo, every single time.
    if (new Date(createdAt).getTime() > now + FUTURE_SLACK_MS) {
      return { error: "That date is in the future — check the day they sent it." };
    }
  }

  return { review: { authorName, rating: input.rating, comment: comment || null, createdAt } };
}
