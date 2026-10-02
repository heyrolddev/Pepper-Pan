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
  type PromoScope,
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
    /* Mapped explicitly rather than "anything that isn't meal is order".
       That older shape would have turned a delivery promo into a basket-wide
       one the moment 0075 allowed the value — a code meant to take ₱50 off
       the padala taking ₱50 off the food instead, silently. */
    scope:
      r.scope === "meal" ? "meal" : r.scope === "delivery" ? "delivery" : "order",
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
  /** The padala on this order, so a delivery-scope code has something to
   *  come off. Absent means pickup, and such a code is refused by name. */
  deliveryFee?: number;
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

  /* Counted here rather than kept on the promo row, and counted through the
     ORDER rather than on its own.

     A cancelled order has to give the use back. The shop cancels orders all
     the time — out of stock, the customer never showed, the wrong address —
     and the row stays, because the record of what happened matters. So the
     cascade on delete is not enough: nothing deletes a cancelled order, and
     a "one each" code would stay burned for a customer who was never fed.
     That is a queue at the counter and an argument the staff cannot win.

     The inner join is what makes it right, and it is why this is not a
     counter column: a counter would have to be decremented by hand on
     cancel, and the day somebody forgets is the day a code reads as used up
     by orders nobody ever received. */
  const [{ count: total }, { count: mine }] = await Promise.all([
    db
      .from("promo_redemptions")
      .select("id, orders!inner(status)", { count: "exact", head: true })
      .eq("promo_id", promo.id)
      .neq("orders.status", "cancelled"),
    opts.customerId
      ? db
          .from("promo_redemptions")
          .select("id, orders!inner(status)", { count: "exact", head: true })
          .eq("promo_id", promo.id)
          .eq("customer_id", opts.customerId)
          .neq("orders.status", "cancelled")
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
    deliveryFee: opts.deliveryFee,
  });
}

/**
 * How many times a promo has been claimed, by anybody.
 *
 * Cancelled orders do not count, for the reason given above: the shop
 * cancels orders and the rows stay, so counting them would let a code run
 * out on food nobody ever received. Counted rather than kept on the promo
 * row so that stays true without anybody decrementing anything.
 */
export async function countPromoUses(promoId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from("promo_redemptions")
    .select("id, orders!inner(status)", { count: "exact", head: true })
    .eq("promo_id", promoId)
    .neq("orders.status", "cancelled");
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

/**
 * What the promo on an existing order is worth now that the basket changed.
 *
 * ── The bug this exists to close ─────────────────────────────────────────
 *
 * A customer may edit a pending order, and `updateMyOrder` rebuilds
 * `revenue` from the remaining lines. It knew nothing about discounts, so
 * the moment anybody nudged a quantity the promo silently evaporated: the
 * order went back to full price while `discount` and `promo_code` still sat
 * on the row saying otherwise. The receipt printed "Less SULIT20 ₱100"
 * under a subtotal that had already lost it, and did not add up.
 *
 * Re-checking is the only honest answer, because an edit can genuinely
 * invalidate a promo — take the one dish a dish-promo is for out of the
 * basket and it does not apply to what is left, however unwelcome that is
 * to discover. So this returns one of three things and the caller tells the
 * customer which: there was no promo, there still is one and it is worth
 * this much now, or it no longer applies and here is the reason in the same
 * words the checkout would have used.
 *
 * The order's OWN use is excluded from the counts. Without that, re-checking
 * a code with a one-per-customer limit would refuse it on the grounds that
 * this very order had already claimed it.
 */
export async function repriceOrder(opts: {
  orderId: string;
  lines: BasketLine[];
  customerId: string | null;
  /** The padala the order carries, so a delivery code survives an edit. */
  deliveryFee?: number;
}): Promise<
  | { kind: "none" }
  | {
      kind: "kept";
      promoId: string;
      label: string;
      discount: number;
      /* Which side of the bill the money comes off. Returned rather than
         looked up again by the caller: the caller would have to re-read the
         promo to find out, and a second read is a second chance to answer
         differently from the check that just ran. */
      scope: PromoScope;
    }
  | { kind: "dropped"; label: string; why: string }
> {
  const db = createAdminClient();

  const { data: claim } = await db
    .from("promo_redemptions")
    .select("id, promo_id")
    .eq("order_id", opts.orderId)
    .maybeSingle();
  if (!claim) return { kind: "none" };

  const { data: row } = await db
    .from("promos")
    .select(COLUMNS)
    .eq("id", claim.promo_id as string)
    .maybeSingle();
  if (!row) {
    // The promo was deleted while this order was still pending. The claim
    // goes with it rather than being honoured against a rule nobody can
    // read any more.
    await db.from("promo_redemptions").delete().eq("id", claim.id as string);
    return { kind: "dropped", label: "That discount", why: "It is no longer running." };
  }
  const promo = toPromo(row as PromoRow);

  const [{ count: total }, { count: mine }] = await Promise.all([
    db
      .from("promo_redemptions")
      .select("id, orders!inner(status)", { count: "exact", head: true })
      .eq("promo_id", promo.id)
      .neq("order_id", opts.orderId)
      .neq("orders.status", "cancelled"),
    opts.customerId
      ? db
          .from("promo_redemptions")
          .select("id, orders!inner(status)", { count: "exact", head: true })
          .eq("promo_id", promo.id)
          .eq("customer_id", opts.customerId)
          .neq("order_id", opts.orderId)
          .neq("orders.status", "cancelled")
      : Promise.resolve({ count: 0 }),
  ]);

  const result = checkPromo(promo, opts.lines, {
    where: "online",
    today: shopToday(),
    usage: { total: total ?? 0, byCustomer: mine ?? 0 },
    signedIn: opts.customerId !== null,
    // Repricing an edited order has to see the same padala the order
    // carries, or a free-delivery code silently drops on the first edit.
    deliveryFee: opts.deliveryFee,
  });

  if (!result.ok) {
    await db.from("promo_redemptions").delete().eq("id", claim.id as string);
    return { kind: "dropped", label: promo.label, why: result.refusal.message };
  }

  // The claim is worth a different number now, and the report of what the
  // promos cost the shop reads this column.
  await db
    .from("promo_redemptions")
    .update({ amount: result.discount })
    .eq("id", claim.id as string);

  return {
    kind: "kept",
    scope: promo.scope,
    promoId: promo.id,
    label: result.label,
    discount: result.discount,
  };
}
