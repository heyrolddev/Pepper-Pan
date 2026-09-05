import test from "node:test";
import assert from "node:assert/strict";

/**
 * The two pure decisions inside the error log: what counts as an error at
 * all, and what makes two of them the same error.
 *
 * `error-log.ts` is `server-only` and reaches the database, so the functions
 * are re-stated here exactly as they are written there. That is a copy, and
 * copies drift — but the alternative is not testing the two rules that decide
 * whether this feature is usable or useless, and both of them fail silently
 * in the direction of "the log is full of noise and nobody reads it".
 */

const CONTROL_FLOW = ["NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK"];

function isControlFlow(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return CONTROL_FLOW.includes(digest.split(";")[0]);
}

function fingerprintOf(message: string, route: string | null): string {
  const flattened = message
    .slice(0, 500)
    .replace(/\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{8,}\b/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${route ?? "?"}::${flattened}`;
}

/* ---------------- what is not an error ---------------- */

test("a redirect is control flow, not a fault", () => {
  // Every sign-in bounce and every admin guard throws one of these. Without
  // this filter the log fills with thousands of them in a day and the one
  // real error is somewhere underneath.
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;replace;/login;307;",
  });
  assert.equal(isControlFlow(redirect), true);
});

test("a not-found is control flow too", () => {
  const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK"), {
    digest: "NEXT_HTTP_ERROR_FALLBACK;404",
  });
  assert.equal(isControlFlow(notFound), true);
});

test("a real error is never mistaken for control flow", () => {
  assert.equal(isControlFlow(new Error("Cannot read stock of undefined")), false);
  assert.equal(
    isControlFlow(Object.assign(new Error("boom"), { digest: "1234567890" })),
    false,
    "a hashed production digest is a real error, not a redirect"
  );
  assert.equal(isControlFlow("just a string"), false);
  assert.equal(isControlFlow(null), false);
  assert.equal(isControlFlow({ digest: 42 }), false);
});

/* ---------------- what makes two errors the same ---------------- */

test("the same fault on the same page groups into one row", () => {
  const a = fingerprintOf("Cannot read properties of undefined", "/menu");
  const b = fingerprintOf("Cannot read properties of undefined", "/menu");
  assert.equal(a, b);
});

test("the same message on a different page is a different fault", () => {
  assert.notEqual(
    fingerprintOf("Database timeout", "/menu"),
    fingerprintOf("Database timeout", "/admin/money")
  );
});

test("ids inside a message do not split one fault into hundreds", () => {
  // This is the rule that decides whether the screen says "broken 93 times"
  // or shows 93 rows saying the same thing.
  const first = fingerprintOf("Ingredient mt9svomb0ynv2 not found", "/admin/inventory");
  const second = fingerprintOf("Ingredient mtavhj8u086mj not found", "/admin/inventory");
  assert.equal(first, second);
});

test("numbers are flattened for the same reason", () => {
  assert.equal(
    fingerprintOf("Order 1043 has no lines", "/admin/orders"),
    fingerprintOf("Order 2211 has no lines", "/admin/orders")
  );
});

test("case and spacing do not create a second row", () => {
  assert.equal(
    fingerprintOf("Stock  went   negative", "/admin"),
    fingerprintOf("stock went negative", "/admin")
  );
});

test("genuinely different messages stay apart", () => {
  assert.notEqual(
    fingerprintOf("Stock went negative", "/admin"),
    fingerprintOf("Payment provider refused", "/admin")
  );
});

test("a missing route still fingerprints rather than throwing", () => {
  assert.equal(fingerprintOf("Something failed", null), "?::something failed");
});
