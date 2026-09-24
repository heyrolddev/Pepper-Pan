/**
 * Where this is heading, if nothing changes.
 *
 * The owner's question is the simplest one a business has — "is it growing or
 * dying?" — and it is genuinely hard to answer from a stall's daily takings,
 * because those swing more from what day it is than from how the business is
 * doing. So the answer is built in four deliberate steps, and every one of
 * them exists to stop this panel lying confidently.
 *
 * ── 1. WEEKS, NOT DAYS ───────────────────────────────────────────────────
 *
 * A Saturday takes several times a Tuesday. A daily line is therefore a
 * sawtooth, and a trend drawn through it says whatever the last day happened
 * to be. Summing to whole weeks removes the day-of-week pattern exactly —
 * every week contains one of each day — without needing a seasonal model,
 * which short histories cannot support anyway.
 *
 * The week in progress is always dropped. It is incomplete by definition, so
 * including it puts a false crash at the end of every chart and tips the
 * trend down on a Monday morning.
 *
 * ── 2. A DAMPED TREND, NOT A STRAIGHT LINE ───────────────────────────────
 *
 * A ruler laid on the last few weeks is the obvious thing and the wrong one.
 * A stall growing ₱2,000 a month does not grow ₱24,000 a month by next year;
 * it fills its pitch, its hours and its pans, and flattens. A straight line
 * says otherwise, in a confident voice, twelve months out.
 *
 * So: Holt's linear trend with the damping of Gardner & McKenzie (1985),
 * where each step forward carries the trend at φ of the step before, and the
 * forecast approaches ℓ + φb/(1−φ) rather than running away. It is the method
 * that has been hardest to beat in the M-competitions, and its flatter long
 * horizons are most of why. φ is kept in the 0.8–0.98 band that practice
 * settles on: below that the trend dies within a month, at 1 it is undamped
 * Holt again.
 *
 * ── 3. A RANGE, NOT A NUMBER ─────────────────────────────────────────────
 *
 * A single projected line is the thing that gets believed. The interval comes
 * from the model's own one-step errors and widens with the horizon, which is
 * the fan chart the Bank of England made standard — and the point of drawing
 * it is that a narrow fan and a hopeless one look different at a glance.
 *
 * ── 4. AND IT REFUSES ────────────────────────────────────────────────────
 *
 * Under `MIN_WEEKS` of trading there is no answer, and it says so instead of
 * drawing a line. Two weeks of a new stall contain no information about next
 * year, and software that projects anyway is not being helpful.
 *
 * Everything here is pure — rows in, numbers out — so the same figures come
 * out on the server, in a test, and in the browser. No imports, so the tests
 * can load it straight through Node.
 */

/** One trading day's takings. */
export type DayTake = { date: string; revenue: number };

/** One completed week. `weekStart` is the Monday, as `YYYY-MM-DD`. */
export type Week = { weekStart: string; revenue: number };

/**
 * Weeks of history below which this refuses to forecast.
 *
 * Six is not a statistical threshold — there isn't an honest one this low. It
 * is the point at which a trend is at least being drawn through more weeks
 * than it has parameters, and below it the fan would be wider than the chart.
 */
export const MIN_WEEKS = 6;

/**
 * How far the damping band is allowed to stretch.
 *
 * Practice puts φ in 0.8–0.98, and the top of that range is dropped here on
 * purpose. Over a fifty-two week horizon φ = 0.98 is undamped Holt in all but
 * name — it re-introduces exactly the runaway line damping exists to prevent,
 * and in simulation it was the value that took a declining stall to ₱0 a week
 * and a growing one to the moon.
 */
const PHI_CHOICES = [0.8, 0.85, 0.9, 0.95];

/** Fixed when the history is too short to choose it without overfitting. */
const PHI_DEFAULT = 0.85;

/**
 * The most the trend is allowed to move on one week's surprise.
 *
 * A street stall's takings swing hard week to week — weather, a fiesta, a
 * closed road — and none of that is the business changing direction. Left
 * free, the fit reads those swings as the trend.
 */
const BETA_CAP = 0.1;

/** Normal quantiles for the two bands the fan draws. */
const Z80 = 1.2816;
const Z50 = 0.6745;

/**
 * The horizon the verdict is read at, whatever the chart is showing.
 *
 * Thirteen weeks — a quarter. Far enough to be a direction rather than this
 * week's weather, near enough that the band has not opened so wide that
 * everything is "too early to tell". Reading the verdict off the end of a
 * twelve-month view would answer "don't know" forever, which is useless even
 * when it is technically correct.
 */
export const VERDICT_WEEKS = 13;

/** Monday of the week containing `date`, as `YYYY-MM-DD`. */
export function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // getUTCDay: 0 is Sunday. Monday-based weeks, so Sunday counts back six.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** `date` shifted by whole weeks. */
export function addWeeks(date: string, weeks: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Daily takings folded into completed weeks.
 *
 * Weeks with no trading are kept as zeros rather than skipped: a week the
 * stall did not open is a real ₱0, and dropping it would quietly close the
 * gap and hide the dip. Only weeks before the first sale are absent, because
 * those are not zeros — they are before the business existed.
 *
 * `today` decides which week is still in progress, and that week never comes
 * back. Pass the shop's own date, not the server's.
 */
export function weeklySeries(days: DayTake[], today: string): Week[] {
  if (days.length === 0) return [];

  const sums = new Map<string, number>();
  for (const d of days) {
    const wk = weekStartOf(d.date);
    sums.set(wk, (sums.get(wk) ?? 0) + (Number(d.revenue) || 0));
  }

  const starts = [...sums.keys()].sort();
  const first = starts[0];
  const currentWeek = weekStartOf(today);

  const out: Week[] = [];
  for (let wk = first; wk < currentWeek; wk = addWeeks(wk, 1)) {
    out.push({ weekStart: wk, revenue: sums.get(wk) ?? 0 });
  }
  return out;
}

export type Fit = {
  alpha: number;
  beta: number;
  phi: number;
  /** Where the series is now, and how fast it is moving, per week. */
  level: number;
  trend: number;
  /** Standard deviation of the one-step-ahead errors. */
  sigma: number;
  /** What the model said each week would be, one step ahead. */
  fitted: number[];
};

/**
 * Where the line starts and how fast it is going, before any smoothing.
 *
 * A least-squares line through the whole history, rather than the average of
 * the first few week-on-week gaps. That earlier version had a failure mode
 * that only showed up in simulation: when the fit picks β = 0 — which it does
 * whenever a business is genuinely flat — the trend NEVER updates, so
 * whatever the opening slope said is what gets projected for a year. Three
 * noisy weeks at the start of a flat series produced a confident twelve-month
 * decline out of nothing at all.
 *
 * Taken across every week, a run of good or bad Saturdays cannot set the
 * direction, and β = 0 degrades to the sensible thing: a straight line
 * through the history, damped.
 */
function openingState(values: number[]): { level: number; trend: number } {
  const n = values.length;
  if (n < 2) return { level: values[0] ?? 0, trend: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const trend = den === 0 ? 0 : num / den;
  return { level: meanY - trend * meanX, trend };
}

/** How far ahead the fit is scored. See `fitDampedTrend`. */
const FIT_HORIZON = 4;

/** Damped Holt's state after walking `values` up to `upto`, plus its one-step error. */
function run(
  values: number[],
  alpha: number,
  beta: number,
  phi: number,
  upto = values.length
): { level: number; trend: number; sse: number; fitted: number[] } {
  const opening = openingState(values);
  let level = opening.level;
  let trend = opening.trend;

  let sse = 0;
  const fitted: number[] = [];
  for (let t = 1; t < upto; t++) {
    const guess = level + phi * trend;
    fitted.push(guess);
    const error = values[t] - guess;
    sse += error * error;
    const nextLevel = guess + alpha * error;
    trend = phi * trend + beta * error;
    level = nextLevel;
  }
  return { level, trend, sse, fitted };
}

/** The damped sum φ + φ² + … + φʰ, which is what the trend is multiplied by. */
function dampedSum(phi: number, h: number): number {
  let s = 0;
  for (let i = 1; i <= h; i++) s += Math.pow(phi, i);
  return s;
}

/**
 * How badly these parameters would have predicted the weeks ahead.
 *
 * Scored FOUR weeks out, from every origin in the back half of the history —
 * not one week out, and that choice is the difference between this panel
 * working and not.
 *
 * One-step error is the textbook criterion and it is actively wrong here. A
 * model that chases last week's wobble predicts next week beautifully, so
 * minimising one-step error on a noisy sixteen-week series picks a large β —
 * a trend that swings with every good Saturday. Its one-step fit looks great
 * and its projection is nonsense: the trend term is enormous, the variance
 * formula compounds it honestly, and a stall plainly growing came back as
 * "somewhere between ₱14,000 and ₱48,000 a week, too early to tell".
 *
 * Measured at the horizon it is actually used for, chasing noise is punished,
 * because the wobble it chased is gone by week four. The same series then
 * fits a small β, a steady trend, and a band narrow enough to answer the
 * owner's question.
 */
function horizonError(
  values: number[],
  alpha: number,
  beta: number,
  phi: number
): number {
  const n = values.length;
  const from = Math.max(3, Math.floor(n / 2));
  let sse = 0;
  let count = 0;

  for (let origin = from; origin < n; origin++) {
    const state = run(values, alpha, beta, phi, origin);
    for (let h = 1; h <= FIT_HORIZON && origin + h - 1 < n; h++) {
      const guess = state.level + dampedSum(phi, h) * state.trend;
      const error = values[origin + h - 1] - guess;
      sse += error * error;
      count++;
    }
  }
  return count > 0 ? sse / count : Infinity;
}

/**
 * The smoothing parameters that would have predicted this history best.
 *
 * A grid rather than an optimiser: the surface is small, the search is a few
 * thousand passes over a few dozen numbers, and a grid cannot wander off to a
 * corner of the parameter space the way an unconstrained fit can on a short
 * series.
 *
 * β is held under both α and `BETA_CAP`. The first is the usual stability
 * condition — a trend updating faster than the level it is a trend in
 * oscillates. The second is a plain admission about street-stall data: a
 * business does not change direction weekly, so a β that says it does is
 * fitting Saturdays.
 *
 * φ is only searched once there are enough weeks to afford a third parameter.
 * Below that it is fixed — fitting how fast the trend should die out, from
 * ten weeks, fits the noise.
 */
export function fitDampedTrend(values: number[]): Fit | null {
  if (values.length < MIN_WEEKS) return null;

  const phis = values.length >= 12 ? PHI_CHOICES : [PHI_DEFAULT];
  let bestAlpha = 0.2;
  let bestBeta = 0.02;
  let bestPhi = PHI_DEFAULT;
  let bestScore = Infinity;

  for (const phi of phis) {
    for (let a = 1; a <= 19; a++) {
      const alpha = a / 20;
      for (let b = 0; b <= 10; b++) {
        const beta = Math.min((b / 10) * BETA_CAP, alpha);
        const score = horizonError(values, alpha, beta, phi);
        if (score < bestScore) {
          bestScore = score;
          bestAlpha = alpha;
          bestBeta = beta;
          bestPhi = phi;
        }
      }
    }
  }

  // σ stays the ONE-step standard deviation, because that is what the
  // interval formula below is written in terms of. The horizon score above
  // chooses the parameters; it does not measure the noise.
  const final = run(values, bestAlpha, bestBeta, bestPhi);
  return {
    alpha: bestAlpha,
    beta: bestBeta,
    phi: bestPhi,
    level: final.level,
    trend: final.trend,
    // n−1 one-step errors, two parameters' worth of freedom spent.
    sigma: Math.sqrt(final.sse / Math.max(1, values.length - 2)),
    fitted: final.fitted,
  };
}

export type Point = {
  /** Weeks ahead of the last completed week. 1 is next week. */
  h: number;
  mean: number;
  lo80: number;
  hi80: number;
  lo50: number;
  hi50: number;
};

/**
 * The projection, with its fan.
 *
 * The mean is ℓ + (φ + φ² + … + φʰ)b — the damped sum, which is why it bends
 * flat instead of climbing forever.
 *
 * The interval is the additive-error state-space variance for this model:
 * σ²ₕ = σ²(1 + Σⱼ cⱼ²) with cⱼ = α + βφ(1 − φʲ)/(1 − φ). It is the honest
 * width *if the model is right*, which is a real caveat and the reason the
 * screen says how much history it is working from rather than presenting the
 * band as the whole truth.
 *
 * Every figure is floored at zero. A week cannot take negative money, and a
 * lower band that dips below the axis makes a shop look like it owes its
 * customers.
 */
export function project(fit: Fit, weeks: number): Point[] {
  const { alpha, beta, phi, level, trend, sigma } = fit;
  const out: Point[] = [];

  let phiSum = 0;
  let varSum = 1;

  for (let h = 1; h <= weeks; h++) {
    phiSum += Math.pow(phi, h);
    const mean = Math.max(0, level + phiSum * trend);

    if (h > 1) {
      const j = h - 1;
      const c = alpha + (beta * phi * (1 - Math.pow(phi, j))) / (1 - phi);
      varSum += c * c;
    }
    const sd = sigma * Math.sqrt(varSum);

    out.push({
      h,
      mean,
      lo80: Math.max(0, mean - Z80 * sd),
      hi80: Math.max(0, mean + Z80 * sd),
      lo50: Math.max(0, mean - Z50 * sd),
      hi50: Math.max(0, mean + Z50 * sd),
    });
  }
  return out;
}

export type Direction = "growing" | "slowing" | "steady";

/**
 * The 90th percentile of Student's t, by degrees of freedom.
 *
 * Which is the 80% two-sided level — deliberately the same confidence the fan
 * on the chart is drawn at, so the picture and the sentence beside it are
 * making the same claim. Short histories need a wider bar than the 1.28 a
 * normal distribution would give, and with six weeks of data that difference
 * is the whole question.
 */
const T90: [number, number][] = [
  [4, 1.533], [5, 1.476], [6, 1.44], [7, 1.415], [8, 1.397], [10, 1.372],
  [12, 1.356], [15, 1.341], [20, 1.325], [30, 1.31], [60, 1.296], [1e6, 1.282],
];

function tCritical(df: number): number {
  if (df <= 4) return T90[0][1];
  for (let i = 1; i < T90.length; i++) {
    const [dfHi, tHi] = T90[i];
    if (df <= dfHi) {
      const [dfLo, tLo] = T90[i - 1];
      const at = (df - dfLo) / (dfHi - dfLo);
      return tLo + at * (tHi - tLo);
    }
  }
  return 1.282;
}

/**
 * The smallest move worth calling a direction: 5% over the verdict horizon.
 *
 * Statistical significance is not the same as mattering. Given enough weeks,
 * a drift of ₱20 a week becomes detectable — and telling a stall owner their
 * business is "growing" on the strength of ₱250 a quarter is a true sentence
 * that wastes their attention.
 */
const MATERIAL = 0.05;

/**
 * Growing, slowing, or too close to call.
 *
 * ── WHY THIS IS NOT READ OFF THE FAN ─────────────────────────────────────
 *
 * The obvious implementation is to look at where the projected band sits at
 * the horizon and compare it to today. It is wrong, and it was wrong in a way
 * that only showed up in simulation: a shop with forty weeks of unmistakable
 * growth — a slope twenty-five times its own standard error — came back
 * "too early to tell".
 *
 * The reason is that the two questions are different. The fan answers "what
 * might ONE week look like", so it necessarily contains the whole week-to-week
 * scatter: the weather, a fiesta, a closed road. The owner is not asking that.
 * They are asking whether the LEVEL is moving, and comparing a single-week
 * prediction interval against a single past week counts that scatter twice —
 * once in the band and once in the point it is measured against. A business
 * can be growing beyond any doubt while next Tuesday remains a coin toss.
 *
 * So the verdict is a test on the slope itself: the least-squares trend
 * through the weekly takings against its own standard error, at the same 80%
 * the fan is drawn at, and only then against a materiality floor. The chart
 * keeps the honest width; the sentence answers the honest question.
 */
export function directionOf(weeks: Week[]): Direction {
  const n = weeks.length;
  if (n < MIN_WEEKS) return "steady";

  const y = weeks.map((w) => w.revenue);
  const meanX = (n - 1) / 2;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (i - meanX) * (y[i] - meanY);
    sxx += (i - meanX) * (i - meanX);
  }
  if (sxx === 0) return "steady";
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = y[i] - (intercept + slope * i);
    sse += r * r;
  }
  const df = n - 2;
  const se = Math.sqrt(sse / df / sxx);

  // Detectable above the wobble. A dead-flat fit (se of 0, which only happens
  // on made-up data) skips this test rather than dividing by nothing — but it
  // does NOT skip the one below, which is the whole point of having two.
  if (se > 0 && Math.abs(slope) < tCritical(df) * se) return "steady";

  // … and big enough to be worth saying.
  const over = Math.abs(slope) * VERDICT_WEEKS;
  if (meanY > 0 && over < meanY * MATERIAL) return "steady";

  return slope > 0 ? "growing" : slope < 0 ? "slowing" : "steady";
}

export type Outlook = {
  weeks: Week[];
  /** Null when there is not enough history — the screen then says so. */
  fit: Fit | null;
  forecast: Point[];
  direction: Direction;
  /** The last completed week's takings, which everything is judged against. */
  now: number;
  /** Weekly figures scaled to the month a shop actually budgets in. */
  monthlyNow: number;
  monthlyThen: number;
  /** How far out `monthlyThen` is, in whole months. */
  horizonMonths: number;
};

/** Weeks to months, on the 52/12 ratio rather than a sloppy ×4. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Everything the panel needs, from the daily takings.
 *
 * Returns a shaped answer even when it cannot forecast: the weeks are still
 * worth drawing, and a chart of what happened with an honest "not enough yet"
 * beats an empty panel.
 */
export function outlook(days: DayTake[], today: string, months: number): Outlook {
  const weeks = weeklySeries(days, today);
  const horizonWeeks = Math.round(months * WEEKS_PER_MONTH);
  const now = weeks.length > 0 ? weeks[weeks.length - 1].revenue : 0;

  const fit = fitDampedTrend(weeks.map((w) => w.revenue));
  if (!fit) {
    return {
      weeks,
      fit: null,
      forecast: [],
      direction: "steady",
      now,
      monthlyNow: now * WEEKS_PER_MONTH,
      monthlyThen: now * WEEKS_PER_MONTH,
      horizonMonths: months,
    };
  }

  const forecast = project(fit, Math.max(horizonWeeks, VERDICT_WEEKS));
  const end = forecast[horizonWeeks - 1] ?? forecast[forecast.length - 1];

  return {
    weeks,
    fit,
    // Trimmed to what was asked for; the verdict read further in is already
    // taken below, off the untrimmed run.
    forecast: forecast.slice(0, horizonWeeks),
    direction: directionOf(weeks),
    now,
    monthlyNow: now * WEEKS_PER_MONTH,
    monthlyThen: (end?.mean ?? now) * WEEKS_PER_MONTH,
    horizonMonths: months,
  };
}

/** Weeks to months, for a caller holding a forecast it sliced itself. */
export function monthlyFrom(weekly: number): number {
  return weekly * WEEKS_PER_MONTH;
}

/** How many whole weeks make up `months`, the way `outlook` counts them. */
export function weeksFor(months: number): number {
  return Math.round(months * WEEKS_PER_MONTH);
}
