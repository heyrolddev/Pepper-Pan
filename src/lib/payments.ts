export const PAYMENT_STATUSES = ["unpaid", "submitted", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "gcash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentSettings = {
  cod_enabled: boolean;
  gcash_enabled: boolean;
  gcash_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  instructions: string | null;
};

export const DEFAULT_PAYMENTS: PaymentSettings = {
  cod_enabled: true,
  gcash_enabled: false,
  gcash_name: null,
  gcash_number: null,
  gcash_qr_url: null,
  instructions: null,
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
  { admin: string; customer: string; tone: "neutral" | "wait" | "good" }
> = {
  unpaid: { admin: "Unpaid", customer: "Not paid yet", tone: "neutral" },
  submitted: {
    admin: "Needs checking",
    customer: "Waiting for the shop to confirm",
    tone: "wait",
  },
  paid: { admin: "Paid", customer: "Paid ✓", tone: "good" },
  refunded: { admin: "Refunded", customer: "Refunded", tone: "neutral" },
};
