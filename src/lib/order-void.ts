/**
 * A sale that was never made.
 *
 * ── The distinction this file exists to draw ─────────────────────────────
 *
 * Until now the shop had one way out of an order: cancel it. So two
 * completely different events were written to the same row and counted in
 * the same figure:
 *
 *   a cancellation   a real order, really wanted, that fell through
 *   a void           a keying mistake — the order never existed
 *
 * The cancel list already carried "Rung up wrong" and "Duplicate order",
 * which is the system admitting the problem in its own words. Both of those
 * were landing in the cancellation rate, so a cashier who double-punched a
 * ticket on a Tuesday made the kitchen look like it had let a customer down.
 * That figure is read as a service problem; a fat-fingered till is not one.
 *
 * ── Why a void is still `status = 'cancelled'` underneath ────────────────
 *
 * This is the load-bearing decision, and it was made the safe way round on
 * purpose.
 *
 * Twenty-eight queries across this codebase exclude a cancelled order from
 * revenue, stock, the takings, the forecast and the reports — most of them
 * as `.neq("status", "cancelled")`, which TypeScript cannot check. A brand
 * new `'voided'` status would have to be added to all twenty-eight, and the
 * one that got missed would count a voided ₱500 ticket as real money.
 *
 * Keeping the arithmetic as a cancellation means every one of those queries
 * is already correct, today, with no edit. What a void adds is a MARK —
 * `voided_at` — and only the handful of places that COUNT cancellations have
 * to know about it. The worst a missed site can do is call a void a
 * cancellation in a tally. Nothing can turn it back into money.
 *
 * Safe by default, and the failure mode is a label rather than a peso.
 */

/* Relative, with the extension, and that is not a style choice.
   `node --test` runs these modules directly and cannot resolve the `@/`
   alias — tsc, tsx and the build all accept it, so an aliased import here
   passes every check and then silently stops the WHOLE test file from
   loading. Twelve tests disappeared that way once already. */
import { REASON_LIMIT } from "./cancellation.ts";

/**
 * Why a ticket should never have existed.
 *
 * Deliberately not overlapping `CANCEL_REASONS`: every reason here is the
 * till being wrong, and every reason there is the order being off. "Rung up
 * wrong" and "Duplicate order" moved out of that list and into this one —
 * they were always voids wearing a cancellation's clothes.
 */
export const VOID_REASONS = [
  "Rung up wrong",
  "Punched twice — duplicate",
  "Wrong item",
  "Wrong amount",
  "Test or training entry",
] as const;

export type VoidReason = (typeof VOID_REASONS)[number];

/** What an order looks like to anything asking whether it really happened. */
export type Closable = {
  status: string;
  voided_at?: string | null;
};

/**
 * Was this entry struck out as a mistake?
 *
 * Reads the stamp, never the reason text. A reason is typed by a person and
 * can say anything; `voided_at` is written by one action and means one thing.
 */
export function isVoided(o: Closable): boolean {
  return Boolean(o.voided_at);
}

/**
 * A real order that fell through — the only thing a cancellation rate should
 * ever count.
 *
 * Every tally of cancellations goes through here rather than testing the
 * status itself, so there is one answer to "does this count against us".
 */
export function wasCalledOff(o: Closable): boolean {
  return o.status === "cancelled" && !isVoided(o);
}

/** "Voided" or "Cancelled" — never both, and never the wrong one. */
export function closureLabel(o: Closable): string {
  return isVoided(o) ? "Voided" : "Cancelled";
}

/**
 * Tidy a void reason, or say what is missing.
 *
 * A void erases money from the day's takings on one tap, so it is the last
 * place to accept a blank box. Shaped exactly like `cleanReason` so the two
 * dialogs behave the same under the hand.
 */
export function cleanVoidReason(
  reason: string | null | undefined
): { reason: string; error: null } | { reason: null; error: string } {
  const text = (reason ?? "").trim().replace(/\s+/g, " ").slice(0, REASON_LIMIT);
  if (!text) {
    return {
      reason: null,
      error:
        "Why is this being voided? Pick a reason — a ticket that vanishes with no note is the one nobody can explain at closing.",
    };
  }
  return { reason: text, error: null };
}
