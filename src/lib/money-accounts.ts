/**
 * The pots the shop's money sits in.
 *
 * Kept apart rather than added into one figure, and the reason is the drawer.
 * "Cash in the drawer" earns its keep by being checkable: you count the
 * physical notes and compare, and a gap means something real — nearly always
 * a purchase nobody wrote down. Fold an untouchable e-wallet balance into it
 * and that check is gone, and with it the only self-correcting number on the
 * money screen.
 *
 * So each pot is tracked on its own and the total is presented as a total.
 */

export const ACCOUNTS = ["cash", "gcash", "bank"] as const;

export type Account = (typeof ACCOUNTS)[number];

export function isAccount(value: unknown): value is Account {
  return value === "cash" || value === "gcash" || value === "bank";
}

export const ACCOUNT_LABELS: Record<Account, string> = {
  cash: "Cash in the drawer",
  gcash: "GCash",
  bank: "Bank",
};

/** Short form, for a badge on a ledger line where the row already has context. */
export const ACCOUNT_SHORT: Record<Account, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank: "Bank",
};

/**
 * How a delivery was paid for.
 *
 * `unpaid` is not an account, and that is the point of it being here: buying
 * on the supplier's utang moves stock without moving money, so recording it
 * as a cash payment would take pesos out of the drawer that are still in it.
 * The stock still arrives; nothing is deducted; the activity log says so.
 */
export const PAID_FROM = ["cash", "gcash", "unpaid"] as const;

export type PaidFrom = (typeof PAID_FROM)[number];

export function isPaidFrom(value: unknown): value is PaidFrom {
  return value === "cash" || value === "gcash" || value === "unpaid";
}

export const PAID_FROM_LABELS: Record<PaidFrom, string> = {
  cash: "Cash",
  gcash: "GCash",
  unpaid: "Not yet paid",
};

export const PAID_FROM_HINTS: Record<PaidFrom, string> = {
  cash: "Comes out of the drawer.",
  gcash: "Comes out of the e-wallet.",
  unpaid: "Utang muna — stock arrives, no money moves yet.",
};
