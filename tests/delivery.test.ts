import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DELIVERY,
  distanceKm,
  quoteDelivery,
  type DeliverySettings,
} from "../src/lib/delivery.ts";
import { SHOP } from "../src/lib/site.ts";

/**
 * What a delivery costs, and who is refused one.
 *
 * Every assertion here is money the shop either collects or eats, so the
 * figures are worked out by hand in the comments rather than copied from a
 * run — a test that only records what the code did cannot catch the code
 * being wrong.
 */

const settings: DeliverySettings = { ...DEFAULT_DELIVERY };

/**
 * Quote a drop `km` due north of the stall.
 *
 * Due north on purpose: a degree of latitude is the same length everywhere,
 * so the straight-line distance is exactly the number asked for and each fee
 * below can be worked out by hand.
 */
const quoteKmAway = (s: DeliverySettings, km: number, subtotal: number) =>
  quoteDelivery(s, s.shop_lat + km / 111.32, s.shop_lng, subtotal);

test("the delivery origin is the shop's own pin", () => {
  // These drifted apart once — 270 m — and nobody noticed, because both
  // numbers look plausible on their own.
  assert.equal(settings.shop_lat, SHOP.lat);
  assert.equal(settings.shop_lng, SHOP.lng);
});

test("distance is zero at the shop and symmetric", () => {
  assert.equal(distanceKm(14.95, 120.75, 14.95, 120.75), 0);
  const there = distanceKm(14.95, 120.75, 14.96, 120.76);
  const back = distanceKm(14.96, 120.76, 14.95, 120.75);
  assert.ok(Math.abs(there - back) < 1e-9);
});

test("a nearby drop pays the base fee, not less", () => {
  // 1 km straight line -> 1.3 km charged, inside base_km (2), so base_fee.
  const q = quoteKmAway(settings, 1, 300);
  assert.ok(q.ok);
  assert.equal(q.fee, settings.base_fee);
  assert.equal(q.waived, false);
});

test("distance beyond the base is charged per kilometre", () => {
  // 4 km straight -> 5.2 km charged. 5.2 - 2 = 3.2 extra km.
  // 30 + 3.2 * 10 = 62.
  const q = quoteKmAway(settings, 4, 300);
  assert.ok(q.ok);
  assert.equal(q.km, 5.2);
  assert.equal(q.fee, 62);
});

test("the fee never drops below the minimum", () => {
  const cheap: DeliverySettings = { ...settings, base_fee: 5, min_fee: 30 };
  const q = quoteKmAway(cheap, 0.5, 300);
  assert.ok(q.ok);
  assert.equal(q.fee, 30);
});

test("past the limit is a refusal, not an expensive quote", () => {
  // 9 km straight -> 11.7 km charged, past the 10 km limit.
  const q = quoteKmAway(settings, 9, 300);
  assert.equal(q.ok, false);
  assert.match(q.ok === false ? q.reason : "", /limit/i);
});

test("a big enough basket waives the fee", () => {
  const withFree: DeliverySettings = { ...settings, free_over: 500 };
  const under = quoteKmAway(withFree, 1, 499);
  const over = quoteKmAway(withFree, 1, 500);
  assert.ok(under.ok && under.fee > 0 && under.waived === false);
  assert.ok(over.ok && over.fee === 0 && over.waived === true);
});

test("delivery switched off refuses every address", () => {
  const paused: DeliverySettings = { ...settings, is_enabled: false };
  const q = quoteKmAway(paused, 0.2, 1000);
  assert.equal(q.ok, false);
});

test("numeric settings arriving as strings still add up", () => {
  // Postgres numerics come back as strings through PostgREST. The maths has
  // to coerce, or `base_fee + extra * rate` silently concatenates.
  const fromDb = {
    ...settings,
    base_fee: "30",
    per_km_fee: "10",
    base_km: "2",
    min_fee: "30",
    max_km: "10",
    free_over: "0",
  } as unknown as DeliverySettings;
  const q = quoteKmAway(fromDb, 4, 300);
  assert.ok(q.ok);
  assert.equal(q.fee, 62);
});
