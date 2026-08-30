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
