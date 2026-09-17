import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  METHOD_LABEL,
  PAYMENT_METHODS,
  isPaymentMethod,
} from "../src/lib/payments.ts";

/**
 * Which ways of paying exist, and who is allowed to see each one.
 *
 * Adding `bank` widened a list that two very different screens read from: the
 * till, where a cashier must be able to record a transfer, and the checkout,
 * where offering one would promise a customer something nobody has set up.
 * The comment on PAYMENT_METHODS claims the second screen builds its own
 * list. These tests make that claim checkable instead of merely stated.
 */

test("every way of paying has a word a person can read", () => {
  for (const m of PAYMENT_METHODS) {
    assert.equal(typeof METHOD_LABEL[m], "string", `${m} has no label`);
    assert.ok(METHOD_LABEL[m].length > 0, `${m} has an empty label`);
  }
});

test("cod is shown as Cash, because nobody at the stall says COD", () => {
  assert.equal(METHOD_LABEL.cod, "Cash");
});

test("a bank transfer is a payment method the system will accept", () => {
  // setOrderPaymentMethod refuses anything this returns false for, so a
  // correction to Bank depends on it.
  assert.ok(isPaymentMethod("bank"));
  assert.ok(isPaymentMethod("cod"));
  assert.ok(isPaymentMethod("gcash"));
});

test("junk from a form body is not a payment method", () => {
  for (const junk of ["", "cheque", "COD", null, undefined, 0, {}]) {
    assert.equal(isPaymentMethod(junk), false, `${String(junk)} got through`);
  }
});

test("the customer's checkout never offers a bank transfer", () => {
  // The guard the comment on PAYMENT_METHODS promises. A future method added
  // for the till must not appear in front of a customer just by being added
  // to the list, so this reads the picker rather than trusting the comment.
  const picker = readFileSync("src/components/payment-picker.tsx", "utf8");
  assert.equal(
    /["']bank["']/.test(picker),
    false,
    "payment-picker.tsx mentions bank — checkout would offer a transfer nobody is watching for"
  );
});
