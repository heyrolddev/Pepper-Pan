/**
 * Why an order was cancelled.
 *
 * A required free-text box produces "asdf" by the third rush, so the reason is
 * picked from a short list of what actually happens at a food stall, with room
 * to add a detail. Kept in one place because the till, the board and the
 * server all have to agree on the list — and because a reason nobody can
 * group is a reason nobody can count later.
 */
export const CANCEL_REASONS = [
  "Customer changed their mind",
  "Never collected",
  "Ran out of an ingredient",
  "Rung up wrong",
  "Duplicate order",
  "Kitchen couldn't make it",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

/** The longest a reason may be, detail and all. */
export const REASON_LIMIT = 200;

/**
 * Tidy a reason into what should be stored, or say what is missing.
 *
 * The shop must give one; the customer's own cancellation already has a
 * sensible default, and pressing them for a reason is not the shop's business.
 */
export function cleanReason(
  reason: string | null | undefined
): { reason: string; error: null } | { reason: null; error: string } {
  const text = (reason ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_LIMIT);
  if (!text) {
    return {
      reason: null,
      error: "Why is this being cancelled? Pick a reason — it's the only record of where the money went.",
    };
  }
  return { reason: text, error: null };
}
