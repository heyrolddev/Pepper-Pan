/**
 * The month, closed and read back.
 *
 * ── Why a calendar month and not the rolling thirty days ─────────────────
 *
 * Analytics already shows the last thirty days against the thirty before
 * them, which is the right shape for "how are we doing right now". It is the
 * wrong shape for the question this answers: what did SEPTEMBER come to.
 * A month is what a shop plans in, pays rent in and remembers in — "we did
 * well in September" is a sentence somebody says, and "we did well in the
 * rolling window ending the 14th" is not.
 *
 * ── The trap this is built around ────────────────────────────────────────
 *
 * On the 29th, September is not a month. Nine days of October against
 * thirty-one of September is a shop that looks like it is collapsing, and
 * the figure is wrong in the most convincing way: every number in it is
 * real. So an unfinished month is MARKED unfinished, its comparison is made
 * over the SAME NUMBER OF DAYS on both sides, and the screen says which.
 *
 * ── What a finding is allowed to be ──────────────────────────────────────
 *
 * Every strength, weakness and action carries the number it came from.
 * "Delivery is weak" is an opinion; "delivery was 8% of orders and carried
 * ₱1,240 of fees" is a fact somebody can act on or argue with. Anything
 * this cannot measure, it does not mention — a report padded with generic
 * advice teaches the owner to skim it, and then the one month it says
 * something urgent, they skim that too.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

/* Relative, with the extension: `node --test` runs this module directly and
   cannot resolve `@/`, so an aliased import here stops the entire test file
   loading while tsc and the build stay green. */
import { wasCalledOff } from "./order-void.ts";

export type OrderRow = {
  /** Shop day, YYYY-MM-DD. */
  date: string;
  status: string;
  /** Struck out as a wrong entry, and so never an order. See `order-void`. */
  voidedAt: string | null;
  revenue: number;
  cogs: number;
  discount: number;
  customerId: string | null;
  fulfillment: string;
};

export type DishRow = {
  mealId: string;
  name: string;
  qty: number;
  revenue: number;
  cogs: number;
  /**
   * False when the dish has no recipe.
   *
   * Such a dish costs zero, which is not the same as being free to make —
   * and left unmarked it tops the profit ranking on the strength of a blank.
   * That is the most flattering possible way to be wrong, and it is wrong
   * about the dishes the shop knows least about.
   */
  costed: boolean;
};

export type MonthInput = {
  /** "2026-09". */
  month: string;
  /** The shop's own day, so "is this month over" is decided, not assumed. */
  today: string;
  orders: OrderRow[];
  /** The month before, for the comparison. Empty when there isn't one. */
  prior: OrderRow[];
  dishes: DishRow[];
  /** Pesos of stock thrown away in the month. */
  waste: number;
  /** What the shop pays out monthly whether it opens or not. */
  fixedCosts: number;
};

export type Finding = {
  /** A short headline. */
  title: string;
  /** The number it rests on, in words. */
  detail: string;
};

export type Action = Finding & {
  /** Higher first. Ranked by what it is worth, not by how easy it is. */
  weight: number;
};

export type Report = {
  month: string;
  label: string;
  /** False while the month is still running. */
  complete: boolean;
  /**
   * How many days of each month the comparison used.
   *
   * On an unfinished month both sides are cut to the same length, and this
   * is how the screen says so instead of quietly comparing 9 days to 31.
   */
  comparedOver: number | null;

  money: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    /** Gross margin as a fraction, or null when nothing was sold. */
    margin: number | null;
    discounts: number;
    waste: number;
    fixedCosts: number;
    /** Gross profit less fixed costs and waste. The figure that is the point. */
    netProfit: number;
    /** Change against the prior month as a fraction. Null with no prior. */
    revenueChange: number | null;
  };

  trading: {
    orders: number;
    avgOrder: number;
    cancelRate: number;
    /** Days with at least one completed sale. */
    daysOpen: number;
    best: { date: string; revenue: number } | null;
    quietest: { date: string; revenue: number } | null;
    /** Every day of the month, for the chart. Zero on days with no sales. */
    byDay: { date: string; revenue: number }[];
  };

  dishes: {
    topSellers: DishRow[];
    topEarners: (DishRow & { profit: number })[];
    /** Sold at or below what they cost to make. */
    losers: (DishRow & { profit: number })[];
    /** Sold, but with no recipe — so nothing here knows what they earned. */
    uncosted: (DishRow & { profit: number })[];
  };

  customers: {
    total: number;
    returning: number;
    /** Fraction of identified customers who ordered more than once. */
    repeatRate: number | null;
    walkIns: number;
  };

  strengths: Finding[];
  weaknesses: Finding[];
  actions: Action[];
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * What the month before came to, worked back from the change.
 *
 * Derived rather than carried, so the pesos in the sentence and the
 * percentage beside it cannot drift — two figures for one fact is how a
 * report comes to contradict itself in the same paragraph.
 */
function priorRevenueOf(r: Report): number {
  const c = r.money.revenueChange;
  if (c === null || c === -1) return 0;
  return money(r.money.revenue / (1 + c));
}
const pct = (n: number) => Math.round(n * 100);
/* The minus goes BEFORE the sign, the way money is written. `₱-800` reads
   as a typo and makes a reader stop; `−₱800` reads as a loss. */
const peso = (n: number) => {
  const r = Math.round(n);
  return r < 0
    ? `−₱${Math.abs(r).toLocaleString("en-PH")}`
    : `₱${r.toLocaleString("en-PH")}`;
};

/** How many days are in a month, from its own name. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-09" → "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][m - 1];
  return name ? `${name} ${y}` : month;
}

/**
 * How many days of this month have actually happened.
 *
 * The whole month once it is over; the day-of-month so far while it is
 * running. This is the number that stops a comparison being nonsense.
 */
export function daysElapsed(month: string, today: string): number {
  const size = daysInMonth(month);
  if (today.slice(0, 7) > month) return size;
  if (today.slice(0, 7) < month) return 0;
  return Math.min(size, Number(today.slice(8, 10)));
}

/* Both a cancellation and a void are `status = 'cancelled'` in the row, and
   neither is money the shop took — so this one line is right for both and
   needs no edit. That is the whole point of a void being a cancellation
   underneath: every revenue filter in the system already excludes it. */
const sold = (o: OrderRow) => o.status !== "cancelled";

export function buildMonthlyReport(input: MonthInput): Report {
  const size = daysInMonth(input.month);
  const elapsed = daysElapsed(input.month, input.today);
  const complete = elapsed >= size;

  const live = input.orders.filter(sold);
  const revenue = money(live.reduce((s, o) => s + (Number(o.revenue) || 0), 0));
  const cogs = money(live.reduce((s, o) => s + (Number(o.cogs) || 0), 0));
  const discounts = money(live.reduce((s, o) => s + (Number(o.discount) || 0), 0));
  const grossProfit = money(revenue - cogs);

  /* Both sides cut to the same number of days.
  
     Nine days of October against thirty-one of September is a shop that
     looks like it is collapsing, and every number in that comparison is
     real — which is what makes it convincing and what makes it dangerous. */
  const priorLive = input.prior.filter(sold);
  const priorCut = complete
    ? priorLive
    : priorLive.filter((o) => Number(o.date.slice(8, 10)) <= elapsed);
  const priorRevenue = money(priorCut.reduce((s, o) => s + (Number(o.revenue) || 0), 0));

  const revenueChange =
    priorLive.length === 0 || priorRevenue <= 0
      ? null
      : (revenue - priorRevenue) / priorRevenue;

  // Every day of the month, so a gap in trading reads as a gap rather than
  // being closed up by the chart.
  const byDate = new Map<string, number>();
  for (const o of live) {
    byDate.set(o.date, money((byDate.get(o.date) ?? 0) + (Number(o.revenue) || 0)));
  }
  const byDay: { date: string; revenue: number }[] = [];
  for (let d = 1; d <= (complete ? size : Math.max(elapsed, 1)); d++) {
    const date = `${input.month}-${String(d).padStart(2, "0")}`;
    byDay.push({ date, revenue: byDate.get(date) ?? 0 });
  }

  const trading = byDay.filter((d) => d.revenue > 0);
  const best = trading.length > 0
    ? trading.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    : null;
  const quietest = trading.length > 1
    ? trading.reduce((a, b) => (b.revenue < a.revenue ? b : a))
    : null;

  /* Voids leave this figure entirely, numerator and denominator both.
     
     The month's cancellation rate is read as "how often did we let a
     customer down". A ticket punched twice on a Tuesday let nobody down
     and was never an order the shop took, so counting it in either half
     answers a different question than the one being asked. */
  const real = input.orders.filter((o) => !o.voidedAt);
  const cancelled = real.filter(wasCalledOff).length;
  const cancelRate = real.length > 0 ? cancelled / real.length : 0;

  const withProfit = input.dishes.map((d) => ({
    ...d,
    profit: money((Number(d.revenue) || 0) - (Number(d.cogs) || 0)),
  }));

  // Identified customers only. A walk-in has no account, so counting them as
  // "never came back" would make every counter-heavy shop look like it
  // cannot keep anybody.
  const identified = live.filter((o) => o.customerId);
  const seen = new Map<string, number>();
  for (const o of identified) {
    seen.set(o.customerId!, (seen.get(o.customerId!) ?? 0) + 1);
  }
  const returning = [...seen.values()].filter((n) => n > 1).length;

  const waste = money(input.waste);
  const fixedCosts = money(complete ? input.fixedCosts : (input.fixedCosts / size) * elapsed);
  const netProfit = money(grossProfit - fixedCosts - waste);
  const margin = revenue > 0 ? grossProfit / revenue : null;

  const report: Report = {
    month: input.month,
    label: monthLabel(input.month),
    complete,
    comparedOver: priorLive.length === 0 ? null : complete ? size : elapsed,
    money: {
      revenue, cogs, grossProfit, margin, discounts, waste, fixedCosts,
      netProfit, revenueChange,
    },
    trading: {
      orders: live.length,
      avgOrder: live.length > 0 ? money(revenue / live.length) : 0,
      cancelRate,
      daysOpen: trading.length,
      best,
      quietest,
      byDay,
    },
    dishes: {
      // How many sold needs no recipe to be true.
      topSellers: [...input.dishes].sort((a, b) => b.qty - a.qty).slice(0, 5),
      // Profit does. An uncosted dish is left out of both rankings rather
      // than flattered into the top of one and kept out of the other.
      topEarners: withProfit
        .filter((d) => d.costed)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5),
      losers: withProfit.filter((d) => d.costed && d.profit <= 0 && d.qty > 0),
      uncosted: withProfit.filter((d) => !d.costed && d.qty > 0),
    },
    customers: {
      total: seen.size,
      returning,
      repeatRate: seen.size > 0 ? returning / seen.size : null,
      walkIns: live.length - identified.length,
    },
    strengths: [],
    weaknesses: [],
    actions: [],
  };

  const found = judge(report);
  report.strengths = found.strengths;
  report.weaknesses = found.weaknesses;
  report.actions = found.actions;
  return report;
}

/**
 * What the month is good at, what it is not, and what to do about it.
 *
 * Every rule here needs a number before it will speak. Nothing is added to
 * fill space: a report padded with generic advice teaches the owner to skim
 * it, and then the one month it says something urgent, they skim that too.
 */
function judge(r: Report): {
  strengths: Finding[];
  weaknesses: Finding[];
  actions: Action[];
} {
  const strengths: Finding[] = [];
  const weaknesses: Finding[] = [];
  const actions: Action[] = [];
  const { money: m, trading: t, dishes: d, customers: c } = r;

  // ── Is the shop making money at all ─────────────────────────────────
  if (m.revenue > 0 && m.netProfit > 0) {
    strengths.push({
      title: "The month paid for itself",
      detail: `${peso(m.revenue)} in, ${peso(m.netProfit)} left after ingredients, waste and the monthly bills.`,
    });
  } else if (m.revenue > 0 && m.netProfit <= 0) {
    weaknesses.push({
      title: "The month did not cover its costs",
      detail: `${peso(m.grossProfit)} of gross profit against ${peso(m.fixedCosts + m.waste)} of bills and waste — short by ${peso(Math.abs(m.netProfit))}.`,
    });
    actions.push({
      weight: 100,
      title: "Find the gap before next month",
      detail: `Covering ${peso(Math.abs(m.netProfit))} means about ${peso(Math.abs(m.netProfit) / Math.max(1, t.daysOpen))} more a trading day, or the same sales at a better margin.`,
    });
  }

  // ── Margin ──────────────────────────────────────────────────────────
  if (m.margin !== null) {
    if (m.margin >= 0.6) {
      strengths.push({
        title: "Healthy margin",
        detail: `${pct(m.margin)}% of every peso is left after ingredients.`,
      });
    } else if (m.margin < 0.45) {
      weaknesses.push({
        title: "Thin margin",
        detail: `Only ${pct(m.margin)}% of a peso survives the ingredients. A food stall usually wants 55–65%.`,
      });
      actions.push({
        weight: 80,
        title: "Check the dishes that sell most against what they cost",
        detail: `Every point of margin is worth about ${peso(m.revenue / 100)} a month at this volume. Dish costs ranks them — a best-seller at a thin margin is the most expensive one to leave alone, because volume multiplies it.`,
      });
    }
  }

  // ── Direction ───────────────────────────────────────────────────────
  if (m.revenueChange !== null) {
    if (m.revenueChange >= 0.1) {
      strengths.push({
        title: "Growing",
        detail: `${pct(m.revenueChange)}% more than the month before, over the same number of days.`,
      });
    } else if (m.revenueChange <= -0.1) {
      weaknesses.push({
        title: "Down on last month",
        detail: `${pct(Math.abs(m.revenueChange))}% less than the month before, over the same number of days.`,
      });
      actions.push({
        weight: 90,
        title: "Ask what changed",
        detail: `${peso(priorRevenueOf(r))} down to ${peso(m.revenue)}. A price rise, a dish that went off the menu, a quiet week, or weather — History has the daily figures side by side.`,
      });
    }
  }

  // ── Dishes that lose money ──────────────────────────────────────────
  if (d.losers.length > 0) {
    const worst = d.losers.reduce((a, b) => (b.profit < a.profit ? b : a));
    weaknesses.push({
      title: `${d.losers.length} dish${d.losers.length === 1 ? "" : "es"} sold at a loss`,
      detail: `${worst.name} is the worst: ${worst.qty} sold, ${peso(worst.profit)} of profit.`,
    });
    /* The per-serving figure, not the month's total.
    
       "This dish lost ₱320" is a number to feel bad about; "every one you
       sell costs you ₱40" is the one that decides what the new price is. */
    const each = money(worst.profit / Math.max(1, worst.qty));
    actions.push({
      weight: 95,
      title: `Reprice or retire ${worst.name}`,
      detail: `Every one sold costs the shop ${peso(Math.abs(each))} — ${peso(Math.abs(worst.profit))} across the ${worst.qty} sold this month. Raising the price, shrinking the portion or taking it off all stop it; selling more does not.`,
    });
  }

  // ── Dishes nobody has costed ────────────────────────────────────────
  if (d.uncosted.length > 0) {
    const sold = d.uncosted.reduce((s, x) => s + x.qty, 0);
    const took = money(d.uncosted.reduce((s, x) => s + x.revenue, 0));
    weaknesses.push({
      title: `${d.uncosted.length} dish${d.uncosted.length === 1 ? " has" : "es have"} no recipe`,
      detail: `${sold} sold for ${peso(took)} this month, and nothing here knows what any of it earned — or takes it off the shelf when it sells.`,
    });
    actions.push({
      weight: 88,
      title: "Give them a recipe",
      detail: `Until then ${peso(took)} of sales sit outside every margin figure on this page, and the ingredients they used never came off stock. Inventory → the dish → Recipe.`,
    });
  }

  // ── Waste ───────────────────────────────────────────────────────────
  if (m.revenue > 0) {
    const wasteShare = m.waste / m.revenue;
    if (wasteShare >= 0.05) {
      weaknesses.push({
        title: "Waste is eating the margin",
        detail: `${peso(m.waste)} thrown away — ${pct(wasteShare)}% of everything sold.`,
      });
      actions.push({
        weight: 85,
        title: "Look at what is being thrown away",
        detail: `Halving it would put ${peso(m.waste / 2)} back. Inventory → waste log groups it, and prepping less of one thing usually fixes most of it.`,
      });
    } else if (m.waste > 0 && wasteShare < 0.02) {
      strengths.push({
        title: "Very little waste",
        detail: `${peso(m.waste)} thrown away all month — under ${Math.max(1, pct(wasteShare))}% of sales.`,
      });
    }
  }

  // ── Discounts ───────────────────────────────────────────────────────
  if (m.discounts > 0 && m.revenue > 0) {
    const share = m.discounts / (m.revenue + m.discounts);
    if (share >= 0.1) {
      weaknesses.push({
        title: "A lot went out as discount",
        detail: `${peso(m.discounts)} — ${pct(share)}% of what the food would have sold for.`,
      });
      actions.push({
        weight: 60,
        title: "Check the promos earned their keep",
        detail: "A discount costs margin on every order, including the ones that would have happened anyway. Promos & news has what each code was used for.",
      });
    }
  }

  // ── Cancellations ───────────────────────────────────────────────────
  if (t.cancelRate >= 0.1 && t.orders >= 10) {
    weaknesses.push({
      title: "Orders are being cancelled",
      detail: `${pct(t.cancelRate)}% of orders this month did not go through.`,
    });
    actions.push({
      weight: 70,
      title: "Read the cancellation reasons",
      detail: "Orders keeps them. Running out mid-service and a customer changing their mind need completely different fixes.",
    });
  }

  // ── Customers coming back ───────────────────────────────────────────
  if (c.repeatRate !== null && c.total >= 10) {
    if (c.repeatRate >= 0.3) {
      strengths.push({
        title: "Customers come back",
        detail: `${c.returning} of ${c.total} account holders ordered more than once.`,
      });
    } else if (c.repeatRate < 0.15) {
      weaknesses.push({
        title: "Few customers order twice",
        detail: `Only ${c.returning} of ${c.total} account holders came back this month.`,
      });
      actions.push({
        weight: 75,
        title: "Give them a reason to return",
        detail: `${c.total - c.returning} people ordered once and did not come back. At ${peso(t.avgOrder)} an order, getting a third of them to return is about ${peso(((c.total - c.returning) / 3) * t.avgOrder)} — and a promo code for a second order is the cheapest customer a shop ever buys, because they already know the food.`,
      });
    }
  }

  // ── The quiet day ───────────────────────────────────────────────────
  if (t.best && t.quietest && t.best.revenue > 0) {
    const spread = t.quietest.revenue / t.best.revenue;
    if (spread <= 0.35) {
      actions.push({
        weight: 50,
        title: "The quiet days are very quiet",
        detail: `${peso(t.best.revenue)} on the best day against ${peso(t.quietest.revenue)} on the slowest. A quiet kitchen can carry a promo that a busy one cannot.`,
      });
    }
  }

  // ── Nothing measured ────────────────────────────────────────────────
  if (t.orders === 0) {
    weaknesses.push({
      title: "No sales recorded",
      detail: "Either the shop did not trade, or sales were not rung up here.",
    });
  }

  return {
    strengths,
    weaknesses,
    actions: actions.sort((a, b) => b.weight - a.weight),
  };
}
