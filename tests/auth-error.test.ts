import test from "node:test";
import assert from "node:assert/strict";

import { readAuthError } from "../src/lib/auth-error.ts";

/**
 * The URL a customer actually landed on, from the live shop:
 *
 *   /?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
 *    #error=access_denied&error_code=otp_expired&error_description=…
 *
 * Nothing read it, so the page showed its ordinary self and the customer
 * tried again, and again.
 */

const REAL_QUERY =
  "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
const REAL_HASH =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";

test("the link that failed on the live shop is recognised", () => {
  const e = readAuthError(REAL_QUERY, REAL_HASH);
  assert.equal(e?.code, "otp_expired");
  assert.match(e!.message, /expired/i);
  assert.equal(e?.retryable, true);
  // No jargon reaches the customer.
  assert.doesNotMatch(e!.message, /otp|access_denied|error_code/i);
});

test("the hash alone is enough", () => {
  // The implicit flow puts it only here. Reading the query and not the hash
  // is a bug that shows up for half of the flows and no others.
  assert.equal(readAuthError("", REAL_HASH)?.code, "otp_expired");
});

test("the query alone is enough", () => {
  assert.equal(readAuthError(REAL_QUERY, "")?.code, "otp_expired");
});

test("an ordinary page visit is not an error", () => {
  assert.equal(readAuthError("", ""), null);
  assert.equal(readAuthError("?next=/orders", ""), null);
  assert.equal(readAuthError("?", "#"), null);
});

test("a code nobody wrote a sentence for still says what to do", () => {
  const e = readAuthError("?error_code=flux_capacitor_failure", "");
  assert.ok(e);
  assert.match(e!.message, /ask for a new/i);
});

test("supabase's own description is passed on, decoded", () => {
  const e = readAuthError(
    "?error_code=something_new&error_description=Email+link+is+invalid+or+has+expired",
    ""
  );
  // Plus-encoded on the way in; a customer must not read "Email+link+is".
  assert.match(e!.message, /Email link is invalid or has expired/);
  assert.doesNotMatch(e!.message, /\+/);
});

test("falls back to `error` when there is no `error_code`", () => {
  assert.equal(readAuthError("?error=access_denied", "")?.code, "access_denied");
});

test("the query wins over the hash when they disagree", () => {
  // A hash survives navigations the server never saw, so it is the more
  // likely of the two to be a leftover.
  const e = readAuthError("?error_code=server_error", "#error_code=otp_expired");
  assert.equal(e?.code, "server_error");
});
