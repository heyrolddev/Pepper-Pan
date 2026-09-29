import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateReceipt, receiptHref } from "../src/lib/media.ts";

/**
 * A GCash screenshot carries a customer's name, number, reference, amount
 * and often their wallet balance. Before 0067 those sat in the shop's public
 * bucket on a link that needed no login. These tests hold the line between
 * the two kinds of stored value, because getting it wrong in either
 * direction is bad: a private path rendered as an href opens nothing and the
 * shop cannot verify a payment, and a public URL routed through the gate
 * would 404 on the orders that still need checking.
 */

test("a stored path is private and goes through the gate", () => {
  assert.equal(isPrivateReceipt("receipts/abc-123.jpg"), true);
  assert.equal(receiptHref("receipts/abc-123.jpg"), "/admin/receipts/receipts/abc-123.jpg");
});

test("a legacy public URL is left exactly as it was", () => {
  // Written before 0067. Still a real order, still the only picture tying a
  // reference to a payment — rewriting it would break the shop's own history.
  const old = "https://x.supabase.co/storage/v1/object/public/PepperPan/receipts/a.jpg";
  assert.equal(isPrivateReceipt(old), false);
  assert.equal(receiptHref(old), old);
});

test("http is recognised as a URL too, not treated as a filename", () => {
  assert.equal(isPrivateReceipt("http://example.test/a.jpg"), false);
  assert.equal(isPrivateReceipt("HTTPS://example.test/a.jpg"), false);
});

test("no receipt is no link", () => {
  assert.equal(receiptHref(null), null);
});

test("a path with spaces or unusual characters survives the round trip", () => {
  // The route decodes each segment, so the href has to encode each one. A
  // path that comes back different is a receipt the shop cannot open.
  const href = receiptHref("receipts/order 42+x&y.jpg")!;
  assert.ok(href.startsWith("/admin/receipts/"));
  const decoded = href
    .slice("/admin/receipts/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
  assert.equal(decoded, "receipts/order 42+x&y.jpg");
});

test("the slashes stay slashes, so the route still sees a folder", () => {
  // Encoding the whole path rather than each segment would turn the folder
  // separator into %2F and the prefix check would refuse every receipt.
  assert.ok(receiptHref("receipts/a/b.jpg")!.includes("receipts/a/b.jpg"));
});
