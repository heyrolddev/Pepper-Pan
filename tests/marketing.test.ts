import test from "node:test";
import assert from "node:assert/strict";
import {
  discountLift,
  evaluateCampaign,
  type CampaignInput,
} from "../src/lib/marketing.ts";

/**
 * Whether the marketing paid.
 *
 * These sums decide where the shop's advertising money goes next month, and
 * every one of them is a figure the owner cannot check by counting something.
 * A wrong margin on the costing screen shows up as a dish that looks odd; a
 * wrong break-even here reads as a confident verdict and is believed.
 *
 * So the cases below are the ones that separate this from the arithmetic a
 * shop would do on paper: the baseline, the margin, and the discount.
 */

const base: CampaignInput = {
  kind: "ads",
  spend: 2000,
  giveawayCost: 0,
  discountGiven: 0,
  days: 7,
  baselinePerDay: 4000,
  duringPerDay: 5000,
  marginRatio: 0.6,
  newCustomers: 0,
  returned: 0,
  avgOrderValue: 250,
  dailySwing: 400,
};

test("only the extra counts, not the whole week's takings", () => {
  // ₱5,000 a day for 7 days is ₱35,000 through the till, and a shop reading
  // that against ₱2,000 of ads declares a triumph. ₱1,000 a day of it is the
  // campaign; the rest would have happened anyway.
  const r = evaluateCampaign(base);
  assert.equal(r.extraSales, 7000);
  assert.notEqual(r.extraSales, 35000);
});

test("extra sales are not extra money — ingredients come out first", () => {
  const r = evaluateCampaign(base);
  assert.equal(r.extraProfit, 4200); // 7,000 × 60%
  assert.equal(r.net, 2200); // 4,200 kept, 2,000 spent
});

test("a campaign that sold more can still have lost money", () => {
  // The case the ad platform's own dashboard will call a success: sales are
  // up, and the shop is worse off.
  const r = evaluateCampaign({ ...base, spend: 5000 });
  assert.equal(r.extraSales, 7000);
  assert.ok(r.roas !== null && r.roas > 1, "returned more sales than it cost");
  assert.ok(r.net < 0, "and still lost money");
  assert.equal(r.verdict, "toosmall");
});

test("break-even ROAS is one over the margin, not one", () => {
  const r = evaluateCampaign(base);
  assert.ok(r.breakEvenRoas !== null);
  assert.ok(Math.abs(r.breakEvenRoas! - 1 / 0.6) < 1e-9);
  // At a 60% margin, ₱1.50 back per peso spent is a loss.
  assert.ok(1.5 < r.breakEvenRoas!);
});

test("break-even sales say what the campaign has to bring in", () => {
  const r = evaluateCampaign(base);
  // ₱2,000 spent at a 60% margin needs ₱3,333 of extra sales to cover it.
  assert.ok(Math.abs(r.breakEvenSales - 2000 / 0.6) < 1e-9);
  assert.ok(Math.abs(r.breakEvenPerDay - 2000 / 0.6 / 7) < 1e-9);
});

test("no lift at all is a loss, whatever else is true", () => {
  const r = evaluateCampaign({ ...base, duringPerDay: 4000 });
  assert.equal(r.extraSales, 0);
  assert.equal(r.net, -2000);
  assert.equal(r.verdict, "lost");
});

test("takings that fell during the campaign are not a small win", () => {
  const r = evaluateCampaign({ ...base, duringPerDay: 3500 });
  assert.ok(r.extraSales < 0);
  assert.equal(r.verdict, "lost");
});

test("a lift smaller than an ordinary day's swing is too close to call", () => {
  // ₱200 a day up, on a shop whose takings bounce ₱400 a day by themselves.
  // Profitable on paper — and not evidence of anything.
  const r = evaluateCampaign({ ...base, duringPerDay: 4200, spend: 300 });
  assert.ok(r.net > 0, "it looks profitable");
  assert.equal(r.verdict, "noise");
});

test("a lift bigger than the swing, and profitable, is a result", () => {
  const r = evaluateCampaign(base);
  assert.equal(r.verdict, "worked");
});

test("a shop with no history to compare against still gets a verdict", () => {
  // dailySwing of 0 means "we don't know the usual swing" — that must not
  // silently turn every campaign into "too close to call".
  const r = evaluateCampaign({ ...base, dailySwing: 0 });
  assert.equal(r.swings, null);
  assert.equal(r.verdict, "worked");
});

test("a discount is counted as money the shop did not collect", () => {
  const r = evaluateCampaign({
    ...base,
    kind: "promo",
    spend: 0,
    discountGiven: 1500,
  });
  assert.equal(r.totalCost, 1500);
  assert.equal(r.net, 4200 - 1500);
});

test("giveaways cost what they cost to make, and count", () => {
  const r = evaluateCampaign({
    ...base,
    kind: "freebie",
    spend: 0,
    giveawayCost: 900,
  });
  assert.equal(r.totalCost, 900);
});

test("a free taste that loses money on the day can pay back on the return", () => {
  // The case that matters for sampling: negative in the window, positive once
  // the people who came back buy once more. Shown as two figures, because one
  // is measured and the other is a projection.
  const r = evaluateCampaign({
    ...base,
    kind: "freebie",
    spend: 0,
    giveawayCost: 5000,
    duringPerDay: 4300,
    newCustomers: 40,
    returned: 30,
  });
  assert.ok(r.net < 0, "the week itself lost money");
  assert.equal(r.repeatProfit, 30 * 250 * 0.6);
  assert.ok(r.netWithRepeat > 0, "and the returns turn it around");
});

test("nobody can come back who never came in the first place", () => {
  const r = evaluateCampaign({ ...base, newCustomers: 5, returned: 99 });
  assert.equal(r.repeatProfit, 5 * 250 * 0.6);
});

test("cost per new customer counts everything the campaign cost", () => {
  const r = evaluateCampaign({ ...base, giveawayCost: 500, newCustomers: 25 });
  assert.equal(r.cac, 2500 / 25);
});

test("a campaign that hasn't run yet gives a target, not a verdict", () => {
  const r = evaluateCampaign({ ...base, duringPerDay: null });
  assert.equal(r.verdict, "forecast");
  assert.equal(r.extraSales, 0);
  assert.equal(r.roas, null);
  // The useful half still works: it says what the campaign has to achieve.
  assert.ok(Math.abs(r.breakEvenSales - 2000 / 0.6) < 1e-9);
  assert.ok(Math.abs(r.breakEvenPerDay - 2000 / 0.6 / 7) < 1e-9);
});

test("zero days is read as one, not as a division by zero", () => {
  const r = evaluateCampaign({ ...base, days: 0 });
  assert.ok(Number.isFinite(r.breakEvenPerDay));
  assert.ok(Number.isFinite(r.extraSales));
});

test("an uncosted shop is not told it needs infinite sales", () => {
  // marginRatio 0 means the shop has no costing yet. Break-even is then
  // genuinely unanswerable, and the figure must not read as ₱0 — which would
  // say "this campaign is free".
  const r = evaluateCampaign({ ...base, marginRatio: 0 });
  assert.equal(r.breakEvenRoas, null);
  assert.equal(r.breakEvenSales, 0);
  assert.equal(r.extraProfit, 0);
});

/* ── The discount trap ──────────────────────────────────────────────────── */

test("20% off a 60% margin needs half again as many sales to stand still", () => {
  // The number nobody works out before printing the tarpaulin. Each peso now
  // carries 40 points of margin instead of 60, so it takes 60/40 = 1.5× the
  // sales — a 50% increase — for the shop to end up exactly where it started.
  const lift = discountLift(0.6, 0.2);
  assert.ok(lift !== null);
  assert.ok(Math.abs(lift! - 0.5) < 1e-9);
});

test("a discount at the margin can never be made up on volume", () => {
  // At 60% off a 60% margin, every sale earns nothing. Selling twice as many
  // earns twice nothing. The honest answer is "no number", not a big one.
  assert.equal(discountLift(0.6, 0.6), null);
  assert.equal(discountLift(0.6, 0.75), null);
});

test("no discount needs no extra sales", () => {
  assert.equal(discountLift(0.6, 0), 0);
});

test("a shallow discount on a fat margin is cheap to make up", () => {
  // 10% off a 70% margin: 10/(70−10) = one sixth more sales.
  const lift = discountLift(0.7, 0.1);
  assert.ok(lift !== null && Math.abs(lift! - 1 / 6) < 1e-9);
});

test("the same discount on a thin margin is brutal", () => {
  // 10% off a 20% margin needs the shop to sell twice as much.
  const lift = discountLift(0.2, 0.1);
  assert.ok(lift !== null && Math.abs(lift! - 1) < 1e-9);
});
