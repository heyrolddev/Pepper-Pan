/**
 * Did the marketing work?
 *
 * Every figure in HQ so far has been a fact: this is what was sold, this is
 * what it cost. This one is an argument, and it is the argument a small shop
 * gets wrong most often — not because the arithmetic is hard, but because
 * three mistakes are built into the obvious way of doing it.
 *
 * ── Mistake one: counting all the sales ──────────────────────────────────
 *
 * "We spent ₱2,000 on ads and took ₱18,000 that week" is not a result. The
 * shop would have taken something that week anyway. What the ads did is the
 * DIFFERENCE between what happened and what would have happened — the
 * baseline. Overstating the difference by forgetting the baseline is how a
 * promotion that brought in a handful of genuinely new visits gets reported
 * as a thirty-percent success.
 *
 * So nothing here works from total sales. Everything works from the gap
 * between the usual day and the campaign day, and the baseline is a required
 * input rather than an optional refinement.
 *
 * ── Mistake two: counting sales instead of profit ────────────────────────
 *
 * ₱10,000 of extra noodles is not ₱10,000 of extra money. The ingredients for
 * those noodles still had to be bought. At Pepper Pan's margin, ₱10,000 of
 * extra sales is about ₱6,000 of extra gross profit — and if the ads cost
 * ₱8,000, that week lost money while every figure on the ad platform said it
 * was a triumph. Return on ad spend, the number the platforms show, ignores
 * this entirely.
 *
 * Which gives the single most useful number here, and the one worth knowing
 * BEFORE spending anything: break-even ROAS = 1 ÷ margin. At a 60% margin
 * every peso of ad money has to bring back ₱1.67 of sales just to stand
 * still. A campaign returning ₱1.50 per peso is losing money.
 *
 * ── Mistake three: treating a discount as a cost ─────────────────────────
 *
 * A discount does not cost cash; it costs margin, and it costs it on every
 * sale including the ones that would have happened anyway. Twenty percent off
 * a 60%-margin dish does not leave 40% of the margin — it leaves 40 points
 * out of 60, which is two thirds. The shop then needs HALF AGAIN as many
 * sales just to end up where it started. `discountLift` below is that
 * number, and almost nobody works it out before printing the tarpaulin.
 *
 * ── And a fourth thing, which is not a mistake but a limit ───────────────
 *
 * Sales move on their own. A good Saturday is not a marketing result. Before
 * calling an uplift real, it is worth knowing how big the shop's ordinary
 * day-to-day swing is — and the shop has years of its own daily takings to
 * answer that with. `verdictFor` compares the uplift against that swing and
 * says "too close to call" when it is inside the noise, instead of handing
 * back a confident number that is really a coin flip.
 *
 * Nothing in this file reads or writes money. It is arithmetic on numbers the
 * owner types in, kept separate from every screen that shows it so the sums
 * can be tested on their own — which is the whole reason to believe them.
 */

export type ShopNormal = {
  /** Median takings on a trading day. Median, not mean — one fiesta shouldn't set the bar. */
  baselinePerDay: number;
  /** Of every peso taken, what's left after ingredients. 0–1. */
  marginRatio: number;
  /** What an order is worth, on average. */
  avgOrderValue: number;
  /**
   * How much a normal day differs from the usual, in pesos.
   *
   * This is what tells an uplift apart from a Tuesday. Measured as the median
   * distance from the median — one freak day moves it barely at all, where a
   * standard deviation would be dragged up by that same day and then quietly
   * excuse every campaign as "within noise".
   */
  dailySwing: number;
  /** Trading days the figures above are built from. */
  days: number;
  /** True when there isn't enough history to fill anything in. */
  thin: boolean;
};

export const CAMPAIGN_KINDS = ["ads", "promo", "freebie", "other"] as const;
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];

export const KIND_LABEL: Record<CampaignKind, string> = {
  ads: "Ads / boosted post",
  promo: "Discount or promo",
  freebie: "Free taste / giveaway",
  other: "Something else",
};

export const KIND_HINT: Record<CampaignKind, string> = {
  ads: "Facebook, TikTok, a boosted post, tarpaulin, flyers — money paid out to be seen.",
  promo: "Money off the price. It costs no cash, it costs margin — including on the people who would have bought anyway.",
  freebie: "Samples, a free drink with every order, a giveaway. The cost is what the giveaway cost you to make.",
  other: "Anything else you spent money or margin on to bring people in.",
};

/** Everything the owner types, or leaves alone. */
export type CampaignInput = {
  kind: CampaignKind;
  /** Cash actually paid out — ad spend, printing, a fee. */
  spend: number;
  /** What the giveaways cost to make. Ingredients, not menu price. */
  giveawayCost: number;
  /**
   * Money taken off the price, in total, across the whole campaign.
   *
   * Real money the shop did not collect, so it counts against the result the
   * same way cash does — but it is entered apart from `spend` because it
   * behaves differently and is worth seeing on its own line.
   */
  discountGiven: number;
  /** How many trading days it ran. */
  days: number;
  /** What a normal day took, before any of this. */
  baselinePerDay: number;
  /**
   * What a day took while it was running.
   *
   * Null means the campaign hasn't happened yet — the calculator then answers
   * the other question: how much would it have to bring in to be worth doing?
   */
  duringPerDay: number | null;
  /** Of every peso taken, what is left after ingredients. 0–1. */
  marginRatio: number;
  /** Optional: people who had never bought before. */
  newCustomers: number;
  /** Optional: how many of them have come back since. */
  returned: number;
  /**
   * What an order is worth on average, in pesos.
   *
   * Not typed in — taken from the shop's own completed orders. Used only to
   * put a figure on the people who came back.
   */
  avgOrderValue: number;
  /**
   * The shop's ordinary day-to-day swing in takings, in pesos.
   *
   * Not typed in — measured from the shop's own history. Used only to say
   * whether an uplift is big enough to be worth believing.
   */
  dailySwing: number;
};

export type Verdict = "worked" | "lost" | "noise" | "toosmall" | "forecast";

export type CampaignResult = {
  /** Sales that would not have happened without it. */
  extraSales: number;
  /** What was left of those sales after ingredients. */
  extraProfit: number;
  /** Everything it cost: cash out, giveaways made, and margin given away. */
  totalCost: number;
  /** The answer. Positive is money made; negative is money lost. */
  net: number;
  /** Net over cost, as a percentage. Null when nothing was spent. */
  roi: number | null;
  /** Sales returned per peso spent. Null when nothing was spent. */
  roas: number | null;
  /** What ROAS has to reach before a peso of this is worth spending. */
  breakEvenRoas: number | null;
  /** Extra sales needed across the whole campaign just to break even. */
  breakEvenSales: number;
  /** The same, per trading day — the number to judge a day against. */
  breakEvenPerDay: number;
  /** What one new customer cost. Null when none were counted. */
  cac: number | null;
  /**
   * Gross profit from the ones who came back, at one more order each.
   *
   * Kept apart from `net` rather than folded into it, because it is the one
   * figure here that is a projection instead of a measurement.
   */
  repeatProfit: number;
  /** The result once the returning customers' next order is counted. */
  netWithRepeat: number;
  /** How the uplift compares to an ordinary day's swing. Null when unknown. */
  swings: number | null;
  verdict: Verdict;
};

const safe = (n: number) => (Number.isFinite(n) ? n : 0);
const clamp01 = (n: number) => Math.min(1, Math.max(0, safe(n)));

/**
 * How much more you must sell to stand still after cutting the price.
 *
 * At margin `m` and a discount of `d` (both fractions of the price), each
 * remaining peso of sales carries `m − d` of margin instead of `m`, so
 * keeping the same gross profit takes `m ÷ (m − d)` times the sales —
 * an increase of `d ÷ (m − d)`.
 *
 * Returns null when the discount is at or past the margin, because then there
 * is no answer: every extra sale loses money, and selling more makes it
 * worse. That case is worth showing as "no amount of extra sales fixes this"
 * rather than as a very large percentage.
 */
export function discountLift(marginRatio: number, discountRatio: number): number | null {
  const m = clamp01(marginRatio);
  const d = clamp01(discountRatio);
  if (d <= 0) return 0;
  if (d >= m) return null;
  return d / (m - d);
}

/**
 * The whole verdict, from what was typed in.
 *
 * Written as one function returning every figure rather than a handful of
 * small ones, because the numbers are not independent — the verdict depends
 * on the net, the net on the cost, the cost on which kind of campaign it was.
 * Splitting them up invites a screen to show two figures that were worked out
 * under different assumptions.
 */
export function evaluateCampaign(input: CampaignInput): CampaignResult {
  const days = Math.max(1, Math.round(safe(input.days)) || 1);
  const margin = clamp01(input.marginRatio);
  const spend = Math.max(0, safe(input.spend));
  const giveaway = Math.max(0, safe(input.giveawayCost));
  const discount = Math.max(0, safe(input.discountGiven));
  const baseline = Math.max(0, safe(input.baselinePerDay));

  // Cash paid out, giveaways made, and price given away. All three are money
  // the shop does not have because of this campaign, so all three count.
  const totalCost = spend + giveaway + discount;

  // What it has to bring in before any of it is profit. This is the number
  // that answers "is this worth doing?" without knowing anything about how it
  // went — which is why it is computed whether or not the campaign has run.
  const breakEvenSales = margin > 0 ? totalCost / margin : Infinity;
  const breakEvenPerDay = Number.isFinite(breakEvenSales) ? breakEvenSales / days : Infinity;
  const breakEvenRoas = margin > 0 ? 1 / margin : null;

  // A campaign with no "during" figure hasn't happened yet. Everything that
  // depends on a result is zero rather than guessed, and the verdict says so.
  if (input.duringPerDay === null) {
    return {
      extraSales: 0,
      extraProfit: 0,
      totalCost,
      net: -totalCost,
      roi: null,
      roas: null,
      breakEvenRoas,
      breakEvenSales: Number.isFinite(breakEvenSales) ? breakEvenSales : 0,
      breakEvenPerDay: Number.isFinite(breakEvenPerDay) ? breakEvenPerDay : 0,
      cac: null,
      repeatProfit: 0,
      netWithRepeat: -totalCost,
      swings: null,
      verdict: "forecast",
    };
  }

  const during = Math.max(0, safe(input.duringPerDay));

  // The only honest measure of what the marketing did: the gap, not the
  // total. A campaign that ran during a week the shop would have had anyway
  // shows a gap of zero here, which is the correct answer.
  const upliftPerDay = during - baseline;
  const extraSales = upliftPerDay * days;
  const extraProfit = extraSales * margin;
  const net = extraProfit - totalCost;

  const roi = totalCost > 0 ? (net / totalCost) * 100 : null;
  const roas = spend > 0 ? extraSales / spend : null;

  const newCustomers = Math.max(0, Math.round(safe(input.newCustomers)));
  const returned = Math.min(newCustomers, Math.max(0, Math.round(safe(input.returned))));
  const cac = newCustomers > 0 ? totalCost / newCustomers : null;

  // What the ones who came back are worth, counting ONE more order each at
  // the shop's own average order value.
  //
  // This is where a free taste usually lives: it loses money on the day and
  // earns it back on the second visit, so a calculator that stops at the day
  // tells the shop to stop doing the one thing that was working. Kept to a
  // single extra order on purpose — a lifetime-value figure for a street
  // stall is a number somebody invented, and inventing it here would make
  // every giveaway look good.
  const repeatProfit = returned * Math.max(0, safe(input.avgOrderValue)) * margin;

  // How many ordinary daily swings the uplift amounts to. A shop whose
  // takings bounce by ₱800 a day on their own has learned nothing from a
  // ₱300 uplift, however many days it ran.
  const swing = Math.max(0, safe(input.dailySwing));
  const swings = swing > 0 ? upliftPerDay / swing : null;

  return {
    extraSales,
    extraProfit,
    totalCost,
    net,
    roi,
    roas,
    breakEvenRoas,
    breakEvenSales: Number.isFinite(breakEvenSales) ? breakEvenSales : 0,
    breakEvenPerDay: Number.isFinite(breakEvenPerDay) ? breakEvenPerDay : 0,
    cac,
    repeatProfit,
    netWithRepeat: net + repeatProfit,
    swings,
    verdict: verdictFor(net, swings, upliftPerDay),
  };
}

/**
 * Worked, lost, or not enough to tell.
 *
 * The third answer is the one that earns its place. An uplift smaller than
 * the shop's own day-to-day wobble is not evidence of anything — it is a
 * Tuesday. Saying "too close to call" costs nothing and stops the shop
 * spending next month's money on a result that was weather.
 *
 * One ordinary swing is the line. It is not a significance test and does not
 * pretend to be; it is the difference between "this is bigger than a normal
 * day's noise" and "this is not", which is the question actually being asked.
 */
function verdictFor(net: number, swings: number | null, upliftPerDay: number): Verdict {
  if (upliftPerDay <= 0) return "lost";
  if (swings !== null && Math.abs(swings) < 1) return "noise";
  if (net < 0) return "toosmall";
  return "worked";
}

export const VERDICT_COPY: Record<
  Verdict,
  { label: string; tone: "good" | "bad" | "wait"; line: string }
> = {
  worked: {
    label: "It paid",
    tone: "good",
    line: "The extra it brought in was worth more than it cost. Worth doing again — and worth trying bigger.",
  },
  lost: {
    label: "It didn't sell more",
    tone: "bad",
    line: "Takings during the campaign were no better than a normal day, so everything it cost came straight off the shop's profit.",
  },
  toosmall: {
    label: "It sold more, but not enough",
    tone: "bad",
    line: "There was a real lift — it just didn't cover what the campaign cost. Same idea, cheaper, and it might. Same idea at this price won't.",
  },
  noise: {
    label: "Too close to call",
    tone: "wait",
    line: "The lift is smaller than the shop's ordinary day-to-day swing, so it could just as easily be a good week. Run it longer, or bigger, before deciding anything.",
  },
  forecast: {
    label: "Not run yet",
    tone: "wait",
    line: "This is the target. Fill in what a day actually took once it has run, and this becomes a verdict.",
  },
};
