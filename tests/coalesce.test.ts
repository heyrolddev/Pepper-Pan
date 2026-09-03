import test from "node:test";
import assert from "node:assert/strict";
import { coalesce } from "../src/lib/coalesce.ts";

/**
 * The timing behind every live screen in HQ.
 *
 * Each realtime event used to cost a full server round-trip. During a rush
 * that is a queue of refreshes where all but the last are superseded before
 * anyone sees them — which is what made the board feel stuck on stall wifi.
 */

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of events costs one refresh, not one each", async () => {
  let runs = 0;
  const gate = coalesce(() => runs++, 20);
  for (let i = 0; i < 10; i++) gate.call();
  await tick(60);
  assert.equal(runs, 1);
});

test("nothing runs until the burst has actually stopped", async () => {
  let runs = 0;
  const gate = coalesce(() => runs++, 30);
  gate.call();
  await tick(20);
  gate.call(); // still arriving — the deadline moves out
  await tick(20);
  assert.equal(runs, 0, "fired while events were still coming in");
  await tick(30);
  assert.equal(runs, 1);
});

test("separate bursts each get their own refresh", async () => {
  let runs = 0;
  const gate = coalesce(() => runs++, 15);
  gate.call();
  await tick(40);
  gate.call();
  await tick(40);
  assert.equal(runs, 2);
});

test("cancelling drops a pending refresh", async () => {
  // What unmounting does: the screen is gone, so the fetch is wasted.
  let runs = 0;
  const gate = coalesce(() => runs++, 20);
  gate.call();
  gate.cancel();
  await tick(50);
  assert.equal(runs, 0);
});
