import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import {
  checkPromo,
  normalizeCode,
  type BasketLine,
  type Promo,
  type PromoResult,
  type Where,
} from "@/lib/promos";

/**
 * Deciding a discount, on the server, from the shop's own rules.
 *
 * ── Why this exists at all ──────────────────────────────────────────────
 *
 * The browser knows the code the customer typed and nothing else. It does
 * not know whether that code is live, how many times it has been claimed,
 * whether this customer already used it, or what it is worth — and it must
 * not, because a coupon book is exactly the thing a customer should not be
 * handed. So the phone sends a string and this decides everything from it.
 *
 * ── Read through the admin client, on purpose ───────────────────────────
 *
 * `promos` is staff-only by RLS (0064): a customer cannot list the codes.
 * This runs as the service role to answer about ONE code they have already
 * typed — which is the whole feature — and returns a discount and a reason,
 * never the row.
 */

type PromoRow = {
  id: string;
  code: string | null;
  label: string;
  kind: string;
  value: number;
  scope: string;
  meal_id: string | null;
  min_spend: number;
  max_discount: number | null;
  max_uses: number | null;
  max_per_customer: number | null;
  starts_on: string | null;
  ends_on: string | null;
  online: boolean;
  at_counter: boolean;
  is_active: boolean;
};

const COLUMNS =
  "id, code, label, kind, value, scope, meal_id, min_spend, max_discount, max_uses, max_per_customer, starts_on, ends_on, online, at_counter, is_active";

function toPromo(r: PromoRow): Promo {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    kind: r.kind === "amount" ? "amount" : "percent",
    value: Number(r.value),
    scope: r.scope === "meal" ? "meal" : "order",
    mealId: r.meal_id,
    minSpend: Number(r.min_spend) || 0,
    maxDiscount: r.max_discount === null ? null : Number(r.max_discount),
    maxUses: r.max_uses === null ? null : Number(r.max_uses),
    maxPerCustomer:
      r.max_per_customer === null ? null : Number(r.max_per_customer),
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    online: r.online !== false,
    atCounter: r.at_counter !== false,
    isActive: r.is_active !== false,
  };
}

/**
 * What a code is worth on this basket, or why it is not.
 *
 * The basket is the SERVER's — prices it has already looked up, never the
 * ones the browser sent. Passing anything else here would make every rule
 * below decorative.
 */
export async function resolvePromo(opts: {
  code: string;
  lines: BasketLine[];
  where: Where;
  customerId: string | null;
}): Promise<PromoResult> {
  const code = normalizeCode(opts.code);
  if (!code) {
    return { ok: false, refusal: { why: "unknown", message: "Enter a code." } };
  }

  const db = createAdminClient();
  const { data } = await db
    .from("promos")
    .select(COLUMNS)
    .eq("code", code)
    .maybeSingle();

  if (!data) {
    return {
      ok: false,
      refusal: { why: "unknown", message: "We don't have that code." },
    };
  }
  const promo = toPromo(data as PromoRow);

  /* Counted here rather than kept on the promo row, so cancelling an order
     frees the use back up — `promo_redemptions` cascades with the order. A
     counter column would have to be decremented by hand, and the day
     somebody forgets is the day a code is used up by orders that no longer
     exist. */
  const [{ count: total }, { count: mine }] = await Promise.all([
    db
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_id", promo.id),
    opts.customerId
      ? db
          .from("promo_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("promo_id", promo.id)
          .eq("customer_id", opts.customerId)
      : Promise.resolve({ count: 0 }),
  ]);

  return checkPromo(promo, opts.lines, {
    where: opts.where,
    // The shop's own day, not the server's: a code that ends "today" must
    // end when the stall closes in Manila, not when a data centre rolls
    // over eight hours early.
    today: shopToday(),
    usage: { total: total ?? 0, byCustomer: mine ?? 0 },
    signedIn: opts.customerId !== null,
  });
}

/**
 * How many times a promo has been claimed, by anybody.
 *
 * Counted, never kept on the promo row, so cancelling and deleting an order
 * frees the use back up on its own — `promo_redemptions` cascades with the
 * order. A counter column would have to be decremented by hand, and the day
 * somebody forgets is the day a code reads as used up by orders that no
 * longer exist.
 */
export async function countPromoUses(promoId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from("promo_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promo_id", promoId);
  return count ?? 0;
}

/** A promo by id, for the counter's own list — no code typed. */
export async function promoById(id: string): Promise<Promo | null> {
  const db = createAdminClient();
  const { data } = await db.from("promos").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toPromo(data as PromoRow) : null;
}

/**
 * Write the use down, once the order exists.
 *
 * After the order, never before: a redemption pointing at an order that was
 * never written is a use the customer is charged for and got nothing from.
 * The unique index on `order_id` makes a double-write impossible rather
 * than unlikely.
 */
export async function recordRedemption(opts: {
  promoId: string;
  orderId: string;
  customerId: string | null;
  amount: number;
}): Promise<void> {
  const db = createAdminClient();
  await db.from("promo_redemptions").insert({
    promo_id: opts.promoId,
    order_id: opts.orderId,
    customer_id: opts.customerId,
    amount: opts.amount,
  });
}
