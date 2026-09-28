/**
 * What a promo takes off, and when it refuses.
 *
 * ── Why this one is different ───────────────────────────────────────────
 *
 * Everything else in this system RECORDS what happened. A discount CHANGES
 * what is owed, which makes it the first place where a bug, a browser, or a
 * bored staff member costs the shop real money on purpose. So the rule
 * lives here, alone, with tests — and the server runs it again on every
 * order. Nothing a phone sends about a price is ever believed.
 *
 * ── Refusals are named, not lumped ──────────────────────────────────────
 *
 * "That code is invalid" over a code that simply starts tomorrow is how a
 * shop gets a message on Messenger it has to answer by hand. Every refusal
 * says which of the six things went wrong, in words a customer standing at
 * a counter can act on.
 */

export type PromoKind = "percent" | "amount";
export type PromoScope = "order" | "meal";

export type Promo = {
  id: string;
  code: string | null;
  label: string;
  kind: PromoKind;
  value: number;
  scope: PromoScope;
  mealId: string | null;
  minSpend: number;
  /** A ceiling on a percent promo. Null means no cap. */
  maxDiscount: number | null;
  /** Null means unlimited. */
  maxUses: number | null;
  maxPerCustomer: number | null;
  startsOn: string | null;
  endsOn: string | null;
  online: boolean;
  atCounter: boolean;
  isActive: boolean;
};

/** One line of the basket, as the server knows it — never as a browser says. */
export type BasketLine = {
  mealId: string;
  qty: number;
  /** For one of it, add-ons included. */
  unitPrice: number;
};

export type Where = "online" | "counter";

export type PromoRefusal =
  | { why: "unknown"; message: string }
  | { why: "off"; message: string }
  | { why: "not-yet"; message: string }
  | { why: "expired"; message: string }
  | { why: "wrong-place"; message: string }
  | { why: "used-up"; message: string }
  | { why: "already-used"; message: string }
  | { why: "min-spend"; message: string }
  | { why: "not-in-basket"; message: string }
  | { why: "nothing-off"; message: string };

export type PromoResult =
  | { ok: true; promo: Promo; discount: number; label: string }
  | { ok: false; refusal: PromoRefusal };

/** Pesos, to the centavo. Money is never left at float precision. */
const money = (n: number) => Math.round(n * 100) / 100;

export const basketTotal = (lines: BasketLine[]) =>
  money(lines.reduce((sum, l) => sum + l.unitPrice * Math.max(0, l.qty), 0));

/**
 * What the promo applies TO — the whole basket, or one dish's lines.
 *
 * Separate from the total, because a "₱20 off Ji Pai" on a ₱500 order takes
 * ₱20 off the Ji Pai and not off the order — and a percent one takes its
 * share of that dish alone.
 */
export function applicableTotal(promo: Promo, lines: BasketLine[]): number {
  if (promo.scope === "order") return basketTotal(lines);
  return basketTotal(lines.filter((l) => l.mealId === promo.mealId));
}

/**
 * The money off, before any of the refusals.
 *
 * Capped at what the promo applies to, always: a ₱200-off code on a ₱150
 * basket takes ₱150, never ₱200, because the alternative is an order the
 * shop owes the customer money on.
 */
export function discountFor(promo: Promo, lines: BasketLine[]): number {
  const base = applicableTotal(promo, lines);
  if (base <= 0) return 0;

  let off =
    promo.kind === "percent"
      ? (base * Math.min(100, promo.value)) / 100
      : promo.value;

  if (promo.kind === "percent" && promo.maxDiscount !== null) {
    off = Math.min(off, promo.maxDiscount);
  }
  return money(Math.max(0, Math.min(off, base)));
}

export type Usage = {
  /** How many times this promo has been used by anybody. */
  total: number;
  /** How many times by the customer in front of us. */
  byCustomer: number;
};

/**
 * Should this promo apply, and for how much.
 *
 * `today` is passed rather than read, because the shop's day is Manila's and
 * a rule that calls `new Date()` inside itself cannot be tested on the
 * boundary it is most likely to get wrong.
 */
export function checkPromo(
  promo: Promo | null,
  lines: BasketLine[],
  opts: { where: Where; today: string; usage: Usage; signedIn: boolean }
): PromoResult {
  const no = (refusal: PromoRefusal): PromoResult => ({ ok: false, refusal });

  if (!promo) {
    return no({ why: "unknown", message: "We don't have that code." });
  }
  if (!promo.isActive) {
    return no({ why: "off", message: `"${promo.label}" isn't running right now.` });
  }
  if (promo.startsOn && opts.today < promo.startsOn) {
    return no({
      why: "not-yet",
      message: `"${promo.label}" starts on ${promo.startsOn}.`,
    });
  }
  if (promo.endsOn && opts.today > promo.endsOn) {
    return no({ why: "expired", message: `"${promo.label}" ended on ${promo.endsOn}.` });
  }
  if (opts.where === "online" && !promo.online) {
    return no({
      why: "wrong-place",
      message: `"${promo.label}" can only be used at the stall.`,
    });
  }
  if (opts.where === "counter" && !promo.atCounter) {
    return no({
      why: "wrong-place",
      message: `"${promo.label}" is for online orders only.`,
    });
  }
  if (promo.maxUses !== null && opts.usage.total >= promo.maxUses) {
    return no({ why: "used-up", message: `"${promo.label}" has all been claimed.` });
  }
  /* Only meaningful for somebody with an account. A walk-in has no identity
     behind the counter, so a per-customer limit cannot be enforced there —
     said in the editor rather than pretended about here. */
  if (
    opts.signedIn &&
    promo.maxPerCustomer !== null &&
    opts.usage.byCustomer >= promo.maxPerCustomer
  ) {
    return no({
      why: "already-used",
      message:
        promo.maxPerCustomer === 1
          ? `You've already used "${promo.label}".`
          : `You've used "${promo.label}" ${opts.usage.byCustomer} times already.`,
    });
  }

  const whole = basketTotal(lines);
  if (promo.minSpend > 0 && whole < promo.minSpend) {
    return no({
      why: "min-spend",
      message: `"${promo.label}" needs an order of at least ₱${promo.minSpend.toFixed(2)}.`,
    });
  }
  if (promo.scope === "meal" && applicableTotal(promo, lines) <= 0) {
    return no({
      why: "not-in-basket",
      message: `"${promo.label}" is for a dish that isn't in your order.`,
    });
  }

  const discount = discountFor(promo, lines);
  if (discount <= 0) {
    /* Reached when the basket is empty, or a dish promo's dish is free.
       Refused rather than applied at zero, so nothing on the receipt claims
       a discount that took nothing off. */
    return no({
      why: "nothing-off",
      message: `"${promo.label}" takes nothing off this order.`,
    });
  }

  return { ok: true, promo, discount, label: promo.code ?? promo.label };
}

/**
 * A code as it should be stored and compared.
 *
 * Uppercased and trimmed, so "sulit50 " off a poster and "SULIT50" typed
 * carefully are the same code — and so the unique index in the database
 * means what a customer reading a poster thinks it means.
 */
export const normalizeCode = (raw: string): string =>
  raw.trim().toUpperCase().replace(/\s+/g, "");

/** What the customer sees the promo did, in one line. */
export function discountLine(promo: Promo, discount: number): string {
  const what =
    promo.kind === "percent" ? `${promo.value}% off` : `₱${promo.value.toFixed(2)} off`;
  const scope = promo.scope === "meal" ? " (one dish)" : "";
  return `${promo.label} — ${what}${scope}: −₱${discount.toFixed(2)}`;
}
