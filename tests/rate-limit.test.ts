import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "../src/lib/rate-limit.ts";

/**
 * The ceiling on the three doors anyone can knock on without signing in.
 *
 * These are the only endpoints in the app that an anonymous caller can reach,
 * and two of them write to the database with a key that bypasses every
 * security policy. Without a limit, filling the shop's inbox with junk costs
 * an attacker one loop.
 */

test("calls up to the limit are allowed, the next is not", () => {
  resetRateLimits();
  for (let i = 0; i < 5; i++) {
    assert.equal(rateLimit("a", 5, 60_000).allowed, true, `call ${i + 1} refused`);
  }
  assert.equal(rateLimit("a", 5, 60_000).allowed, false);
});

test("callers are counted separately", () => {
  resetRateLimits();
  for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
  assert.equal(rateLimit("a", 5, 60_000).allowed, false);
  assert.equal(rateLimit("b", 5, 60_000).allowed, true, "one caller blocked another");
});

test("the window slides, so a quota does not double at its edge", async () => {
  resetRateLimits();
  rateLimit("a", 2, 60);
  rateLimit("a", 2, 60);
  assert.equal(rateLimit("a", 2, 60).allowed, false);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(rateLimit("a", 2, 60).allowed, true, "window never reopened");
});

test("a refusal says how long to wait, and it is inside the window", () => {
  resetRateLimits();
  rateLimit("a", 1, 60_000);
  const r = rateLimit("a", 1, 60_000);
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs > 0 && r.retryAfterMs <= 60_000);
});

test("rotating keys cannot grow memory without bound", () => {
  // The limiter is keyed by something the caller picks, so it could have been
  // the denial-of-service it exists to prevent. Eviction keeps it bounded.
  resetRateLimits();
  for (let i = 0; i < 20_000; i++) rateLimit(`k${i}`, 1, 60_000);
  // Evicting a legitimate caller early lets them through, which is the right
  // way to fail — but the map must not have kept all 20,000.
  assert.equal(rateLimit("k0", 1, 60_000).allowed, true, "oldest key was never evicted");
});
