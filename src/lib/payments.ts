export const PAYMENT_STATUSES = [
  "unpaid",
  "submitted",
  "partial",
  "paid",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "gcash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PLANS = ["full", "downpayment"] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export type PaymentSettings = {
  cod_enabled: boolean;
  gcash_enabled: boolean;
  gcash_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  instructions: string | null;
  downpayment_enabled: boolean;
  downpayment_percent: number;
};

export const DEFAULT_PAYMENTS: PaymentSettings = {
  cod_enabled: true,
  gcash_enabled: false,
  gcash_name: null,
  gcash_number: null,
  gcash_qr_url: null,
  instructions: null,
  downpayment_enabled: false,
  downpayment_percent: 50,
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: "Cash",
  gcash: "GCash",
};

/**
 * How each payment state should read to each audience. Kept here so the
 * customer's wording and the shop's wording can differ without the two
 * screens drifting apart.
 */
export const STATUS_LABEL: Record<
  PaymentStatus,
  { admin: string; customer: string; tone: "neutral" | "wait" | "part" | "good" }
> = {
  unpaid: { admin: "Unpaid", customer: "Not paid yet", tone: "neutral" },
  submitted: {
    admin: "Needs checking",
    customer: "Waiting for the shop to confirm",
    tone: "wait",
  },
  partial: {
    admin: "Part-paid — collect balance",
    customer: "Down payment confirmed ✓",
    tone: "part",
  },
  paid: { admin: "Paid in full", customer: "Paid ✓", tone: "good" },
  refunded: { admin: "Refunded", customer: "Refunded", tone: "neutral" },
};

/**
 * What the customer sends now under a given plan.
 *
 * Rounded to whole pesos so nobody is asked to transfer centavos, and the
 * balance is always `total - downpayment` — derived everywhere rather than
 * stored twice, so the two halves can never disagree.
 */
export function downpaymentFor(total: number, percent: number): number {
  const pct = Number.isFinite(percent) ? Math.min(Math.max(percent, 1), 99) : 50;
  return Math.round((total * pct) / 100);
}

export function amountDueNow(
  total: number,
  plan: PaymentPlan,
  percent: number
): number {
  return plan === "downpayment" ? downpaymentFor(total, percent) : total;
}
