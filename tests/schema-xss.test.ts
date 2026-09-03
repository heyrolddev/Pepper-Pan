import test from "node:test";
import assert from "node:assert/strict";
import { jsonLd as serialise } from "../src/lib/json-ld.ts";

/**
 * The structured data blocks put shop content — including review text a
 * customer typed — inside a <script> tag.
 *
 * JSON.stringify does not escape "<". A review containing "</script>" would
 * therefore close the tag early and everything after it would be parsed as
 * markup: a stranger's text becoming code on the shop's own homepage. The
 * three schema components each escape "<" before writing, and this is the
 * test that notices if one of them stops.
 */



test("a review that tries to close the script tag cannot", () => {
  const hostile = {
    review: "Great noodles</script><script>alert(document.cookie)</script>",
  };
  const out = serialise(hostile);
  assert.doesNotMatch(out, /<\/script>/i);
  assert.doesNotMatch(out, /<script/i);
  // The text itself survives — this escapes, it does not censor.
  assert.match(out, /Great noodles/);
});

test("every '<' is escaped, wherever it appears", () => {
  const out = serialise({ a: "<", b: ["<b>", "a < b"], c: { d: "</SCRIPT >" } });
  assert.equal(out.includes("<"), false);
  assert.match(out, /\\u003c/);
});

test("the escaped form is still valid JSON that round-trips", () => {
  // If the escaping broke parsing, Google would silently drop the block and
  // the shop would lose its rich result without any error anywhere.
  const original = { name: "Pepper Pan", note: "spicy <hot>", price: 89 };
  assert.deepEqual(JSON.parse(serialise(original)), original);
});
