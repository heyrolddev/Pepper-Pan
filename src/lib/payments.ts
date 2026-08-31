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

/**
 * What the shop has actually been paid, and what is still owed.
 *
 * Derived from the status rather than stored, because a stored "amount paid"
 * and a status are two facts that can disagree, and when they do nobody can
 * tell which one is the lie. The status is the thing staff actually set, so
 * it is the thing that decides.
 *
 * `submitted` counts as nothing received. The customer says they sent it; the
 * shop hasn't checked. Counting an unverified claim as money in hand is how a
 * stall hands over food it never got paid for.
 */
export type MoneyState = {
  total: number;
  /** Confirmed as received. */
  paid: number;
  /** Still owed. Zero once paid or refunded. */
  balance: number;
  /** Nothing confirmed yet. */
  unpaid: boolean;
  /** A down payment landed but the rest hasn't. */
  partPaid: boolean;
  /** Settled — paid in full, or refunded and no longer owed. */
  settled: boolean;
  /** Money the customer says they sent that nobody has checked. */
  awaitingCheck: boolean;
};

export function moneyState(o: {
  payment_status: PaymentStatus;
  payment_plan: PaymentPlan;
  revenue: number;
  delivery_fee: number;
  downpayment_amount: number;
}): MoneyState {
  const total = Number(o.revenue) + Number(o.delivery_fee);
  const down = Number(o.downpayment_amount) || 0;

  const paid =
    o.payment_status === "paid"
      ? total
      : o.payment_status === "partial"
        ? Math.min(down, total)
        : 0;

  // A refund isn't money the shop holds, but it isn't money owed either — the
  // order is closed. Treating it as a balance would leave it on the "chase
  // this" list forever.
  const settled = o.payment_status === "paid" || o.payment_status === "refunded";
  const balance = settled ? 0 : Math.max(total - paid, 0);

  return {
    total,
    paid,
    balance,
    unpaid: paid === 0 && !settled,
    partPaid: o.payment_status === "partial",
    settled,
    awaitingCheck: o.payment_status === "submitted",
  };
}

/** "₱250 of ₱500 · ₱250 still owed" — the whole money story in one line. */
export function moneyLine(m: MoneyState): string {
  const peso = (n: number) =>
    "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
  if (m.settled && m.paid >= m.total) return `${peso(m.total)} paid in full`;
  if (m.settled) return `${peso(m.total)} · refunded`;
  if (m.partPaid) {
    return `${peso(m.paid)} of ${peso(m.total)} · ${peso(m.balance)} still owed`;
  }
  if (m.awaitingCheck) return `${peso(m.total)} sent — not checked yet`;
  return `${peso(m.total)} unpaid`;
}
