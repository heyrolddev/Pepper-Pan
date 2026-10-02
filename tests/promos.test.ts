import test from "node:test";
import assert from "node:assert/strict";
import {
  applicableTotal,
  basketTotal,
  checkPromo,
  discountFor,
  estimateDiscount,
  normalizeCode,
  type BasketLine,
  type Promo,
  discountLine,
} from "../src/lib/promos.ts";

/**
 * This is the code that gives food away.
 *
 * Everything else in this system records what happened. A discount CHANGES
 * what is owed, so every refusal and every peso is pinned here.
 */

const promo = (over: Partial<Promo> = {}): Promo => ({
  id: "p1",
  code: "SULIT50",
  label: "Sulit 50",
  kind: "percent",
  value: 50,
  scope: "order",
  mealId: null,
  minSpend: 0,
  maxDiscount: null,
  maxUses: null,
  maxPerCustomer: null,
  startsOn: null,
  endsOn: null,
  online: true,
  atCounter: true,
  isActive: true,
  ...over,
});

const NOODLES: BasketLine = { mealId: "m-noodles", qty: 2, unitPrice: 179 };
const TEA: BasketLine = { mealId: "m-tea", qty: 1, unitPrice: 99 };
const BASKET = [NOODLES, TEA]; // 358 + 99 = 457

const FINE = {
  where: "online" as const,
  today: "2026-09-28",
  usage: { total: 0, byCustomer: 0 },
  signedIn: true,
};

const ok = (r: ReturnType<typeof checkPromo>) => {
  assert.ok(r.ok, `expected it to apply, got ${r.ok ? "" : r.refusal.why}`);
  return r as Extract<typeof r, { ok: true }>;
};
const why = (r: ReturnType<typeof checkPromo>) => (r.ok ? null : r.refusal.why);

/* ── the arithmetic ─────────────────────────────────────────────────── */

test("a percent takes its share of the basket", () => {
  assert.equal(basketTotal(BASKET), 457);
  assert.equal(discountFor(promo({ value: 10 }), BASKET), 45.7);
  assert.equal(ok(checkPromo(promo({ value: 10 }), BASKET, FINE)).discount, 45.7);
});

test("a peso amount takes exactly that", () => {
  assert.equal(discountFor(promo({ kind: "amount", value: 50 }), BASKET), 50);
});

test("a dish promo takes off that dish, not the order", () => {
  // "₱20 off Ji Pai" on a ₱457 order takes ₱20 off the Ji Pai.
  const p = promo({ kind: "amount", value: 20, scope: "meal", mealId: "m-tea" });
  assert.equal(applicableTotal(p, BASKET), 99);
  assert.equal(discountFor(p, BASKET), 20);
});

test("a percent on one dish takes its share of THAT dish", () => {
  const p = promo({ value: 50, scope: "meal", mealId: "m-noodles" });
  // 2 x 179 = 358, half of it — not half of 457.
  assert.equal(discountFor(p, BASKET), 179);
});

test("a discount never exceeds what it applies to", () => {
  // The alternative is an order the shop owes the customer money on.
  assert.equal(discountFor(promo({ kind: "amount", value: 900 }), BASKET), 457);
  const dish = promo({ kind: "amount", value: 900, scope: "meal", mealId: "m-tea" });
  assert.equal(discountFor(dish, BASKET), 99);
});

test("a percent can be capped, so a party order cannot cost ₱900", () => {
  assert.equal(discountFor(promo({ value: 50, maxDiscount: 100 }), BASKET), 100);
  // The cap does not raise a smaller discount.
  assert.equal(discountFor(promo({ value: 5, maxDiscount: 100 }), BASKET), 22.85);
});

test("money lands on the centavo, never on float dust", () => {
  const odd = [{ mealId: "m", qty: 3, unitPrice: 33.33 }];
  const off = discountFor(promo({ value: 33 }), odd);
  assert.equal(off, Math.round(off * 100) / 100);
  assert.equal(off, 33);
});

/* ── the refusals, each named ───────────────────────────────────────── */

test("a code nobody has is refused by name, not by silence", () => {
  assert.equal(why(checkPromo(null, BASKET, FINE)), "unknown");
});

test("switched off, not started, and ended are three different answers", () => {
  // "That code is invalid" over a code that starts tomorrow is how a shop
  // gets a message on Messenger it has to answer by hand.
  assert.equal(why(checkPromo(promo({ isActive: false }), BASKET, FINE)), "off");
  assert.equal(
    why(checkPromo(promo({ startsOn: "2026-10-01" }), BASKET, FINE)),
    "not-yet"
  );
  assert.equal(
    why(checkPromo(promo({ endsOn: "2026-09-27" }), BASKET, FINE)),
    "expired"
  );
  // The boundaries are inclusive on both ends.
  assert.ok(checkPromo(promo({ startsOn: "2026-09-28" }), BASKET, FINE).ok);
  assert.ok(checkPromo(promo({ endsOn: "2026-09-28" }), BASKET, FINE).ok);
});

test("an online-only code is refused at the counter, and the other way", () => {
  assert.equal(
    why(checkPromo(promo({ atCounter: false }), BASKET, { ...FINE, where: "counter" })),
    "wrong-place"
  );
  assert.equal(why(checkPromo(promo({ online: false }), BASKET, FINE)), "wrong-place");
});

test("a code runs out when the shop said it would", () => {
  const p = promo({ maxUses: 100 });
  assert.ok(checkPromo(p, BASKET, { ...FINE, usage: { total: 99, byCustomer: 0 } }).ok);
  assert.equal(
    why(checkPromo(p, BASKET, { ...FINE, usage: { total: 100, byCustomer: 0 } })),
    "used-up"
  );
});

test("one each means one each", () => {
  const p = promo({ maxPerCustomer: 1 });
  assert.equal(
    why(checkPromo(p, BASKET, { ...FINE, usage: { total: 5, byCustomer: 1 } })),
    "already-used"
  );
});

test("a per-customer limit is not pretended about for a walk-in", () => {
  // There is no identity behind the counter. Enforcing it would mean
  // enforcing it against whoever happened to be signed in on the till.
  const p = promo({ maxPerCustomer: 1 });
  assert.ok(
    checkPromo(p, BASKET, {
      ...FINE,
      where: "counter",
      signedIn: false,
      usage: { total: 5, byCustomer: 99 },
    }).ok
  );
});

test("the minimum spend is measured on the WHOLE order", () => {
  // Even for a dish promo: "₱20 off Ji Pai when you spend ₱500" is about
  // the order, which is the only reading that makes it a reason to buy more.
  const p = promo({ kind: "amount", value: 20, minSpend: 500 });
  assert.equal(why(checkPromo(p, BASKET, FINE)), "min-spend");
  assert.ok(checkPromo(promo({ minSpend: 457 }), BASKET, FINE).ok);
});

test("a dish promo for a dish nobody ordered says so", () => {
  const p = promo({ kind: "amount", value: 20, scope: "meal", mealId: "m-ghost" });
  assert.equal(why(checkPromo(p, BASKET, FINE)), "not-in-basket");
});

test("a promo that would take nothing off is refused, not applied at zero", () => {
  // Nothing on the receipt should claim a discount that took nothing off.
  assert.equal(why(checkPromo(promo(), [], FINE)), "nothing-off");
  const freeDish = [{ mealId: "m-free", qty: 1, unitPrice: 0 }];
  const p = promo({ value: 50, scope: "meal", mealId: "m-free" });
  assert.equal(why(checkPromo(p, freeDish, FINE)), "not-in-basket");
});

test("every refusal carries a message a customer can act on", () => {
  const cases = [
    checkPromo(null, BASKET, FINE),
    checkPromo(promo({ isActive: false }), BASKET, FINE),
    checkPromo(promo({ startsOn: "2026-10-01" }), BASKET, FINE),
    checkPromo(promo({ endsOn: "2026-01-01" }), BASKET, FINE),
    checkPromo(promo({ online: false }), BASKET, FINE),
    checkPromo(promo({ maxUses: 1 }), BASKET, { ...FINE, usage: { total: 1, byCustomer: 0 } }),
    checkPromo(promo({ maxPerCustomer: 1 }), BASKET, { ...FINE, usage: { total: 1, byCustomer: 1 } }),
    checkPromo(promo({ minSpend: 9999 }), BASKET, FINE),
    checkPromo(promo({ scope: "meal", mealId: "nope" }), BASKET, FINE),
    checkPromo(promo(), [], FINE),
  ];
  for (const c of cases) {
    assert.ok(!c.ok, "expected a refusal");
    assert.ok(c.refusal.message.length > 10, `thin message: ${c.refusal.message}`);
    // Never the bare word that tells nobody anything.
    assert.doesNotMatch(c.refusal.message, /^invalid/i);
  }
});

/* ── the code itself ────────────────────────────────────────────────── */

test("a code off a poster and a code typed carefully are one code", () => {
  assert.equal(normalizeCode(" sulit50 "), "SULIT50");
  assert.equal(normalizeCode("Sulit 50"), "SULIT50");
  assert.equal(normalizeCode("SULIT50"), "SULIT50");
});

test("a counter discount with no code still applies and is labelled", () => {
  // Nobody types these — the cashier picks them from a list.
  const p = promo({ code: null, label: "Senior discount", kind: "percent", value: 20 });
  const r = ok(checkPromo(p, BASKET, { ...FINE, where: "counter", signedIn: false }));
  assert.equal(r.label, "Senior discount");
  assert.equal(r.discount, 91.4);
});

test("a negative or zero quantity cannot inflate the basket", () => {
  assert.equal(basketTotal([{ mealId: "m", qty: -5, unitPrice: 100 }]), 0);
  assert.equal(basketTotal([{ mealId: "m", qty: 0, unitPrice: 100 }]), 0);
});

/* ── the till's estimate ─────────────────────────────────────────────
 *
 * Named an estimate because it is one: it skips every rule that needs the
 * database — how many times a code has been claimed, whether this customer
 * already used it — and the server runs `checkPromo` again and refuses. The
 * chip on screen is a guess for the customer standing there; the recorded
 * figure is always the server's.
 */

test("the estimate agrees with the server on the arithmetic", () => {
  for (const p of [
    promo({ value: 10 }),
    promo({ kind: "amount", value: 50 }),
    promo({ value: 50, maxDiscount: 100 }),
    promo({ kind: "amount", value: 20, scope: "meal", mealId: "m-tea" }),
  ]) {
    assert.equal(
      estimateDiscount(p, BASKET),
      ok(checkPromo(p, BASKET, FINE)).discount,
      `${p.kind} ${p.value} disagreed with the server`
    );
  }
});

test("the estimate shows nothing for a promo that cannot apply", () => {
  // The till then says so in words beside the chip, rather than showing a
  // discount the server is about to refuse.
  assert.equal(estimateDiscount(promo({ isActive: false }), BASKET), 0);
  assert.equal(estimateDiscount(promo({ minSpend: 9999 }), BASKET), 0);
  assert.equal(
    estimateDiscount(promo({ scope: "meal", mealId: "not-ordered" }), BASKET),
    0
  );
});

test("the estimate cannot see usage, which is why the server checks again", () => {
  // A code with every use claimed still estimates a discount — the till has
  // no way to know, and pretending otherwise would mean shipping the count
  // to the browser. `recordWalkInSale` refuses it.
  const spent = promo({ maxUses: 1 });
  assert.ok(estimateDiscount(spent, BASKET) > 0);
  assert.equal(
    why(checkPromo(spent, BASKET, { ...FINE, usage: { total: 1, byCustomer: 0 } })),
    "used-up"
  );
});

/* ── the padala ─────────────────────────────────────────────────────── */

/**
 * "Libreng padala sa ₱500 pataas" — the promo the shop could not make.
 *
 * Checkout read `max(0, subtotal - discount) + deliveryFee`: every discount
 * against the food, the fee added afterwards, so no code could reach it. A
 * ₱500-off code on a ₱200 order still charged the ₱50 padala.
 *
 * The rules that matter here are that `min_spend` measures the FOOD, and
 * that a delivery code on a pickup order is refused by name rather than
 * falling through to "takes nothing off" — which is true, useless, and the
 * kind of message that generates a phone call.
 */

const FREE_DELIVERY = promo({
  code: "LIBRENGPADALA",
  label: "Libreng padala",
  kind: "percent",
  value: 100,
  scope: "delivery",
});

test("free delivery takes the whole padala and not a peso of the food", () => {
  const r = ok(checkPromo(FREE_DELIVERY, BASKET, { ...FINE, deliveryFee: 50 }));
  assert.equal(r.discount, 50);
  assert.equal(
    discountFor(FREE_DELIVERY, BASKET, 50),
    50,
    "100% of the padala, never 100% of the ₱457 basket"
  );
});

test("a percent delivery code takes its share of the padala only", () => {
  const half = promo({ scope: "delivery", kind: "percent", value: 50 });
  assert.equal(discountFor(half, BASKET, 50), 25);
});

test("a peso delivery code is capped at the padala, never more", () => {
  // Otherwise a ₱80-off code on a ₱50 delivery hands back ₱30 of food.
  const twenty = promo({ scope: "delivery", kind: "amount", value: 20 });
  assert.equal(discountFor(twenty, BASKET, 50), 20);
  const eighty = promo({ scope: "delivery", kind: "amount", value: 80 });
  assert.equal(discountFor(eighty, BASKET, 50), 50);
});

test("a delivery code on a pickup order is refused by name", () => {
  // Not "takes nothing off this order", which is true and tells somebody
  // holding a valid code nothing about why it did not work.
  const r = checkPromo(FREE_DELIVERY, BASKET, { ...FINE, deliveryFee: 0 });
  assert.equal(why(r), "not-delivery");
  assert.match(
    r.ok ? "" : r.refusal.message,
    /isn't being delivered/i,
    "the message must name the reason, not the symptom"
  );
});

test("a missing fee is treated as no delivery, not as a crash", () => {
  assert.equal(why(checkPromo(FREE_DELIVERY, BASKET, FINE)), "not-delivery");
});

test("min spend on a delivery promo measures the food, never the padala", () => {
  // The classic: free delivery over ₱500. Counting the fee towards its own
  // threshold would let a far delivery unlock the code the order has not
  // earned — the further you are, the cheaper it gets, which is backwards.
  const over500 = promo({ scope: "delivery", kind: "percent", value: 100, minSpend: 500 });

  // ₱457 of food plus a ₱60 padala is ₱517 — and still short.
  assert.equal(why(checkPromo(over500, BASKET, { ...FINE, deliveryFee: 60 })), "min-spend");

  const bigger = [{ mealId: "m-noodles", qty: 3, unitPrice: 179 }]; // 537
  assert.equal(ok(checkPromo(over500, bigger, { ...FINE, deliveryFee: 60 })).discount, 60);
});

test("every other rule still applies to a delivery code", () => {
  assert.equal(
    why(checkPromo(promo({ scope: "delivery", isActive: false }), BASKET, { ...FINE, deliveryFee: 50 })),
    "off"
  );
  assert.equal(
    why(checkPromo(promo({ scope: "delivery", endsOn: "2026-09-01" }), BASKET, { ...FINE, deliveryFee: 50 })),
    "expired"
  );
  assert.equal(
    why(
      checkPromo(promo({ scope: "delivery", maxUses: 1 }), BASKET, {
        ...FINE,
        deliveryFee: 50,
        usage: { total: 1, byCustomer: 0 },
      })
    ),
    "used-up"
  );
});

test("the receipt line says the money came off the delivery", () => {
  // "50% off: −₱25" beside a ₱300 bill is a line somebody will query.
  assert.match(discountLine(FREE_DELIVERY, 50), /delivery/i);
  assert.ok(!/delivery/i.test(discountLine(promo(), 50)), "and an order code does not claim it");
});

test("the till's estimate shows nothing for a delivery code at the counter", () => {
  // A walk-in is not being delivered. Showing "−₱50" on the till and then
  // refusing it at the server is the worst of both.
  assert.equal(estimateDiscount(FREE_DELIVERY, BASKET), 0);
  assert.equal(estimateDiscount(FREE_DELIVERY, BASKET, 50), 50);
});

test("a negative fee cannot pay the customer", () => {
  // Nothing should produce one. Which is why a sign slipping through would
  // go unnoticed: it would ADD to the discount.
  assert.equal(discountFor(FREE_DELIVERY, BASKET, -50), 0);
  assert.equal(why(checkPromo(FREE_DELIVERY, BASKET, { ...FINE, deliveryFee: -50 })), "not-delivery");
});
