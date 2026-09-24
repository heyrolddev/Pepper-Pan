import test from "node:test";
import assert from "node:assert/strict";

import {
  poolShortfalls,
  remainingFor,
  ticketDraw,
  type Shortfall,
} from "../src/lib/costing.ts";

/**
 * One shelf, many dishes.
 *
 * Modelled on the shop's real Giant Ji Pai: three variants, all drawing on the
 * same tub of breading and the same pack of marinated chicken. The owner read
 * "2 left" on every one of them and concluded the thirteen marinated chickens
 * were being divided between the variants. They were not — the breading was
 * the limit, and nothing on screen said so.
 */

const line = (refId: string, label: string, need: number, have: number, unit = "g"): Shortfall => ({
  refId,
  label,
  kind: refId.startsWith("b") ? "batch" : "ingredient",
  unit,
  need,
  have,
  allows: Math.floor(have / need),
});

/** Marinated chicken is plentiful; breading is not. This is the real shape. */
const CHICKEN = (have = 13) => line("b-chicken", "M. Giant Ji Pai", 1, have, "pack");
const BREADING = (have = 150) => line("b-breading", "Breading", 60, have);

const giantOriginal = [CHICKEN(), BREADING()];
const giantSpicy = [CHICKEN(), BREADING()];
const soloSpicy = [line("b-solo", "M. Solo Ji Pai", 1, 40, "pack"), line("b-breading", "Breading", 30, 150)];

const limits = new Map<string, Shortfall[]>([
  ["giant-og", giantOriginal],
  ["giant-spicy", giantSpicy],
  ["solo-spicy", soloSpicy],
]);

// --- what each card says on its own -----------------------------------------

test("variants sharing a batch each show the whole batch, not a share of it", () => {
  // Nothing is reserved in advance. Both variants may be sold right up until
  // somebody actually takes the stock — the ordinary warehouse rule.
  const empty = new Map();
  assert.equal(remainingFor(giantOriginal, empty), 2);
  assert.equal(remainingFor(giantSpicy, empty), 2);
});

test("the tightest line sets the number, and it is not always the obvious one", () => {
  // Thirteen chickens, but breading for two. The card must say 2, and the
  // reason must be findable — that is what the owner could not see.
  const n = remainingFor(giantOriginal, new Map());
  assert.equal(n, 2);
  const tightest = [...giantOriginal].sort((a, b) => a.allows - b.allows)[0];
  assert.equal(tightest.label, "Breading");
});

test("a dish that uses less of the shared thing gets more servings", () => {
  // The Solos show 5 off the same 150 g, because they use 30 g not 60 g.
  // Which is the detail that proves the batch is not being divided.
  assert.equal(remainingFor(soloSpicy, new Map()), 5);
});

test("a dish with no recipe is unlimited, not zero", () => {
  assert.equal(remainingFor([], new Map()), null);
});

// --- what the whole ticket draws --------------------------------------------

test("two variants on one ticket are added up, not checked separately", () => {
  // The bug: 2 Original and 2 Spicy each pass their own test (2 ≤ 2), and the
  // pair of them take four Giants' worth of breading out of a tub holding two.
  const ticket = [
    { mealId: "giant-og", qty: 2 },
    { mealId: "giant-spicy", qty: 2 },
  ];
  const short = poolShortfalls(ticket, limits);
  assert.equal(short.length, 1);
  assert.equal(short[0].label, "Breading");
  assert.equal(short[0].have, 150);
  assert.equal(short[0].need, 240);
});

test("a ticket the shelf can actually cover is not refused", () => {
  const short = poolShortfalls(
    [{ mealId: "giant-og", qty: 1 }, { mealId: "giant-spicy", qty: 1 }],
    limits
  );
  assert.deepEqual(short, []);
});

test("the refusal names the ingredient, never the dish", () => {
  // "Not enough stock for Cheesy Giant Jipai" sent the owner to look at a
  // shelf of thirteen marinated chickens. The chickens were never the problem.
  const short = poolShortfalls([{ mealId: "giant-og", qty: 6 }], limits);
  assert.equal(short[0].label, "Breading");
  assert.notEqual(short[0].label, "M. Giant Ji Pai");
});

test("dishes sharing nothing do not interfere", () => {
  const separate = new Map<string, Shortfall[]>([
    ["a", [line("i-1", "Pork", 100, 1000)]],
    ["b", [line("i-2", "Beef", 100, 200)]],
  ]);
  const short = poolShortfalls([{ mealId: "a", qty: 5 }, { mealId: "b", qty: 2 }], separate);
  assert.deepEqual(short, []);
});

test("an exact fit goes through", () => {
  // 150 g of breading, 2 Giants at 60 g plus a Solo at 30 g. Exactly 150.
  const short = poolShortfalls(
    [{ mealId: "giant-og", qty: 2 }, { mealId: "solo-spicy", qty: 1 }],
    limits
  );
  assert.deepEqual(short, [], "a ticket that fits exactly must not be refused");
});

test("a rounding hair does not refuse a sale", () => {
  // These are numerics out of Postgres. Refusing over 0.0000001 g of salt
  // would be a bug with a straight face.
  const hair = new Map<string, Shortfall[]>([
    ["x", [line("i-salt", "Salt", 1.0000000001, 1)]],
  ]);
  assert.deepEqual(poolShortfalls([{ mealId: "x", qty: 1 }], hair), []);
});

// --- the live countdown while the basket fills -------------------------------

test("adding one variant counts the others down with it", () => {
  // The thing that makes the shared tub visible instead of a surprise.
  const basket = ticketDraw([{ mealId: "giant-og", qty: 1 }], limits);
  assert.equal(remainingFor(giantOriginal, basket), 1);
  assert.equal(remainingFor(giantSpicy, basket), 1, "the other variant must drop too");
});

test("the count reaches zero rather than going negative", () => {
  const basket = ticketDraw([{ mealId: "giant-og", qty: 5 }], limits);
  assert.equal(remainingFor(giantSpicy, basket), 0);
});

test("a shared thing drains across different dishes, at their own rates", () => {
  // Two Giants take 120 g of the 150 g. A Solo needs 30 g, so exactly one is
  // left — while the Giants are down to nothing.
  const basket = ticketDraw([{ mealId: "giant-og", qty: 2 }], limits);
  assert.equal(remainingFor(giantSpicy, basket), 0);
  assert.equal(remainingFor(soloSpicy, basket), 1);
});

test("an add-on drawing on the same shelf is counted", () => {
  // An add-on is a dish and takes the same stock.
  const draw = ticketDraw(
    [{ mealId: "giant-og", qty: 1 }, { mealId: "solo-spicy", qty: 2 }],
    limits
  );
  assert.equal(draw.get("b-breading")?.need, 60 + 60);
});
