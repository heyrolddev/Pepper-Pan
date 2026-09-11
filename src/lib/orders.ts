export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * What the shop calls each step.
 *
 * `out_for_delivery` only makes sense once the food has left the stall, so
 * `statusesFor` hides it from pickup orders rather than offering the shop a
 * step it can never legitimately use.
 */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function statusesFor(fulfillment: string): readonly OrderStatus[] {
  return fulfillment === "delivery"
    ? ORDER_STATUSES
    : ORDER_STATUSES.filter((s) => s !== "out_for_delivery");
}

/** Orders the customer is still waiting on. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];

/**
 * One colour per status, defined once and used everywhere it appears.
 *
 * The hierarchy is deliberate and it is the whole point of the palette: the
 * five statuses where the shop still owes someone food are fully saturated,
 * and the two closed ones are deliberately quiet. A completed order is not
 * competing for attention with an order that's on the wok — so on a screen
 * showing both, the eye lands on the live one without having to read a word.
 *
 * Within the live five the colour also tracks the heat: gold while it's
 * waiting on the owner, orange once accepted, red on the fire, green when it's
 * ready, ink once it has left the stall.
 */
export type StatusTone = {
  /** Filled chip — for the selected tab and the badge on a card. */
  chip: string;
  /** Just the colour — for the dot beside an unselected tab. */
  dot: string;
  /** Border colour, for the rail down the left edge of a folded row. */
  rail: string;
  /** Does the shop still owe someone food? */
  live: boolean;
  /** What this queue means, in the owner's terms. */
  hint: string;
};

export const STATUS_TONES: Record<OrderStatus, StatusTone> = {
  pending: {
    chip: "bg-brand-600 text-cream-50",
    dot: "bg-gold-400",
    rail: "border-gold-400",
    live: true,
    hint: "New in. Nobody has accepted these yet.",
  },
  confirmed: {
    chip: "bg-chili-600 text-cream-50",
    dot: "bg-chili-600",
    rail: "border-chili-600",
    live: true,
    hint: "Accepted, not started. Give each one an ETA.",
  },
  preparing: {
    chip: "bg-brand-600 text-cream-50",
    dot: "bg-brand-600",
    rail: "border-brand-600",
    live: true,
    hint: "On the wok right now.",
  },
  ready: {
    chip: "bg-jade-600 text-cream-50",
    dot: "bg-jade-600",
    rail: "border-jade-600",
    live: true,
    hint: "Cooked and waiting — for a rider, or for the customer.",
  },
  out_for_delivery: {
    chip: "bg-ink-800 text-cream-100",
    dot: "bg-ink-800",
    rail: "border-ink-800",
    live: true,
    hint: "With a rider. Mark completed once it lands.",
  },
  completed: {
    // Green, because completed is the good ending and grey read as "filed
    // away". A lighter green than Ready's saturated jade, deliberately: those
    // two sit beside each other in the tab strip and their rails run down the
    // same column of rows, and "cooked, waiting to be handed over" must never
    // be mistaken for "done and gone".
    chip: "bg-jade-100 text-jade-800",
    dot: "bg-jade-400",
    rail: "border-jade-400",
    live: false,
    hint: "Finished. Anything still owed is flagged in red.",
  },
  cancelled: {
    chip: "bg-brand-600/15 text-brand-700",
    dot: "bg-brand-600/50",
    rail: "border-brand-600/40",
    live: false,
    hint: "Called off. Open a row for the reason.",
  },
};

/**
 * How the food leaves the shop.
 *
 * Dine-in is not a smaller kind of pickup: it's the one case where nothing is
 * packed, which is what the packaging costing turns on. Everything else goes
 * out in a box and is charged for it.
 */
const FULFILLMENT_LABELS: Record<string, string> = {
  pickup: "Take-out",
  delivery: "Delivery",
  dine_in: "Dine in",
};

export function fulfillmentLabel(fulfillment: string): string {
  return FULFILLMENT_LABELS[fulfillment] ?? fulfillment;
}

/** Does this order leave in packaging? Dine-in is the only one that doesn't. */
export function isPacked(fulfillment: string): boolean {
  return fulfillment !== "dine_in";
}

/* ============================================================
 * How many of one dish may go on one line
 *
 * This lives here, shared, because of how it went wrong.
 *
 * `updateMyOrder` checked the quantity. `placeOrder` — the one action the
 * public can reach — did not, and the browser's number went straight into the
 * books. Checkout verified the price against the database, recomputed the
 * delivery fee, tested stock, the phone number, the opening hours and whether
 * the account was blocked. Every number the browser sent was distrusted
 * except this one.
 *
 * Sending a negative quantity produced a negative subtotal, slipped past the
 * stock test (`5 < -10` is false, so nothing looked short) and wrote a
 * negative sale that the takings, the profit figures, the analytics and the
 * stock movement all then read as real.
 *
 * Two copies of a rule is one copy and one bug waiting. So there is one copy,
 * and all three ways an order can be written now call it.
 * ============================================================ */

/**
 * Ninety-nine of one dish.
 *
 * A ceiling rather than no ceiling, because a stall that gets an order for
 * four thousand servings has been probed, not patronised — and because the
 * kitchen would have to refuse it anyway.
 */
export const MAX_LINE_QTY = 99;

/**
 * What is wrong with this quantity, in words a customer can act on, or null.
 *
 * `allowZero` is for editing an order that already exists, where zero is the
 * customer removing a line rather than an invalid amount.
 */
export function quantityProblem(
  qty: unknown,
  { allowZero = false }: { allowZero?: boolean } = {}
): string | null {
  if (typeof qty !== "number" || !Number.isFinite(qty)) {
    return "Something went wrong with the amounts in your cart. Please reload and try again.";
  }
  if (!Number.isInteger(qty)) {
    return "We can only cook whole servings — please use a round number.";
  }
  if (qty < (allowZero ? 0 : 1)) {
    return "Please choose at least one of each item.";
  }
  if (qty > MAX_LINE_QTY) {
    return `That's more than ${MAX_LINE_QTY} of one dish — please ring us on +63 947 353 3060 so we can prepare for a large order.`;
  }
  return null;
}

/** The first thing wrong anywhere in a cart, or null if it is all fine. */
export function cartQuantityProblem(
  items: { qty: unknown }[],
  options?: { allowZero?: boolean }
): string | null {
  for (const item of items) {
    const problem = quantityProblem(item.qty, options);
    if (problem) return problem;
  }
  return null;
}
