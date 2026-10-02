/**
 * What an order comes to, in one place.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * `orders` stores the bill in pieces: `revenue` is the food AFTER its
 * discount, `delivery_fee` is the padala, and since 0075 `delivery_discount`
 * is what the shop took off that padala. The total is the three put back
 * together.
 *
 * That sum was written out by hand in six places — the order board, the
 * customer's tracker twice, the payment page, the owner's notification, and
 * the till — each as `revenue + delivery_fee`. All six were right until a
 * code could come off the padala, and all six became wrong on the same day.
 * Six copies of an arithmetic is six chances to miss one, and the one that
 * is missed overcharges a customer who was promised free delivery.
 *
 * So: one function, and a test that fails if the pieces stop adding up.
 */

export type Billable = {
  /** The food, already net of any food discount. */
  revenue: number | null | undefined;
  /** What the trip costs. Zero on pickup. */
  delivery_fee?: number | null;
  /** What the shop took off that trip. Zero unless a delivery promo applied. */
  delivery_discount?: number | null;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * The padala the customer actually pays.
 *
 * Floored at zero rather than trusted: the discount is clamped to the fee
 * when the order is written, but this reads rows written by every version of
 * that code there has ever been, and a negative charge is not a refund — it
 * is an order that quietly pays the customer to collect their own dinner.
 */
export function deliveryDue(o: Billable): number {
  return Math.max(0, n(o.delivery_fee) - n(o.delivery_discount));
}

/** Food plus whatever is left of the padala. */
export function orderTotal(o: Billable): number {
  return Math.max(0, n(o.revenue)) + deliveryDue(o);
}

/**
 * Was the padala discounted, and by how much.
 *
 * Separate from the total because the receipt shows it as its own line —
 * "Delivery ₱50 / Free delivery −₱50" — and a customer who was promised
 * free delivery should see the promise kept, not merely a smaller number.
 */
export function deliverySaved(o: Billable): number {
  return Math.max(0, Math.min(n(o.delivery_discount), n(o.delivery_fee)));
}
