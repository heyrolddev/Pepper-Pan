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
    chip: "bg-gold-400 text-ink-950",
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
