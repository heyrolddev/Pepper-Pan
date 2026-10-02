import test from "node:test";
import assert from "node:assert/strict";

import { deliveryDue, deliverySaved, orderTotal } from "../src/lib/order-total.ts";

/**
 * The sum that was written out by hand in six places.
 *
 * `orders` keeps the bill in pieces: `revenue` is the food already net of
 * its discount, `delivery_fee` is the padala, and `delivery_discount` is
 * what the shop took off that padala. Putting them back together was
 * open-coded as `revenue + delivery_fee` on the order board, twice on the
 * customer's tracker, on the payment page, in the owner's notification and
 * at the till.
 *
 * All six were correct until a code could come off the padala. All six
 * became wrong on the same day — and the one that gets missed overcharges
 * the customer who was promised free delivery, which is the single worst
 * outcome this feature can produce.
 */

test("pickup is just the food", () => {
  assert.equal(orderTotal({ revenue: 457 }), 457);
  assert.equal(deliveryDue({ revenue: 457 }), 0);
});

test("delivery with no promo is food plus the whole padala", () => {
  assert.equal(orderTotal({ revenue: 457, delivery_fee: 50 }), 507);
  assert.equal(deliveryDue({ revenue: 457, delivery_fee: 50 }), 50);
});

test("free delivery costs the customer nothing for the trip", () => {
  const o = { revenue: 457, delivery_fee: 50, delivery_discount: 50 };
  assert.equal(orderTotal(o), 457, "the food, and not a peso of padala");
  assert.equal(deliveryDue(o), 0);
  assert.equal(deliverySaved(o), 50, "and the receipt can still show the ₱50 kept");
});

test("a partial delivery discount leaves the rest payable", () => {
  const o = { revenue: 457, delivery_fee: 50, delivery_discount: 20 };
  assert.equal(deliveryDue(o), 30);
  assert.equal(orderTotal(o), 487);
});

test("a discount bigger than the padala never pays for food", () => {
  // The order write clamps it, but this reads rows written by every version
  // of that code there has ever been. A negative charge is not a refund —
  // it is an order that pays the customer to collect their own dinner.
  const o = { revenue: 457, delivery_fee: 50, delivery_discount: 80 };
  assert.equal(deliveryDue(o), 0);
  assert.equal(orderTotal(o), 457);
  assert.equal(deliverySaved(o), 50, "and it reports only what there was to save");
});

test("rows written before the column existed read as no discount", () => {
  // Every order placed before 0075. `undefined`, not zero, is what comes
  // back from a select that predates the column.
  assert.equal(orderTotal({ revenue: 457, delivery_fee: 50, delivery_discount: undefined }), 507);
  assert.equal(orderTotal({ revenue: 457, delivery_fee: null, delivery_discount: null }), 457);
});

test("rubbish in any field is zero, never NaN on a bill", () => {
  assert.equal(orderTotal({ revenue: undefined }), 0);
  assert.equal(
    orderTotal({ revenue: Number.NaN, delivery_fee: Number.NaN, delivery_discount: Number.NaN }),
    0
  );
  // A NaN reaching a screen renders as "₱NaN" on a customer's receipt.
  assert.ok(Number.isFinite(orderTotal({ revenue: "x" as unknown as number })));
});

test("a negative revenue cannot make the shop owe the customer", () => {
  assert.equal(orderTotal({ revenue: -500, delivery_fee: 50 }), 50);
});
