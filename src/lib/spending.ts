/**
 * What the shop buys that is not an ingredient.
 *
 * Three kinds of money leave a food business, and until now this system only
 * modelled one of them.
 *
 *   INGREDIENTS become a dish. They are consumed in a measured amount per
 *   serving, which is what lets `orders.cogs` be a fact rather than an
 *   estimate. Inventory already handles these.
 *
 *   ASSETS are money turned into a thing that is still there afterwards — a
 *   freezer, a storage box, the cart. Not a cost at all: the question they
 *   answer is payback. `assets` has handled these since 0019.
 *
 *   RUNNING COSTS are consumed and gone, and nothing was left to show for
 *   them: paper towels, alcohol, batteries, a gas refill, a wok repair. They
 *   are not fixed — they do not arrive on the first of the month — and they
 *   are not ingredients, because no recipe uses them.
 *
 * That third kind had nowhere to go, so it went nowhere, and break-even was
 * computed from fixed costs and spoilage alone. The shop has therefore been
 * told it needs LESS a day than it really does, every day, and the error is
 * invisible precisely because the sum it appears in is self-consistent.
 *
 * ── Why gas is here and not in Inventory ─────────────────────────────────
 *
 * Gas was the obvious candidate for an ingredient: it has a quantity, it runs
 * out, and running out stops the shop. But an ingredient earns its place by
 * being consumed in a MEASURED amount per dish — that is the whole reason
 * `orders.cogs` can be trusted. Nobody can weigh the gas that went into one
 * bowl, so modelling it as an ingredient would put a guess inside every COGS
 * figure downstream, to buy a stock level nobody could keep accurate anyway.
 *
 * So gas is a running cost, and the thing the owner actually wanted from a
 * stock level — a warning before the tank dies mid-service — is worked out
 * from the refill dates instead. `tankLife` below does that. It needs no
 * measurement, no discipline, and it gets better on its own as the shop
 * records more refills.
 *
 * And it handles the two things the owner asked about directly: the price
 * moves between refills, which is fine because every purchase carries its own
 * amount; and the gas does not last a fixed number of days, which is the
 * point — the gap between refills IS the usage, so a busier month shortens
 * it without anybody adjusting anything.
 */

export const SPEND_KINDS = ["supplies", "gas", "repair", "other"] as const;
export type SpendKind = (typeof SPEND_KINDS)[number];

export const SPEND_LABEL: Record<SpendKind, string> = {
  supplies: "Supplies",
  gas: "Gas refill",
  repair: "Repair",
  other: "Something else",
};

export const SPEND_HINT: Record<SpendKind, string> = {
  supplies: "Paper towels, alcohol, batteries, bags — things that get used up.",
  gas: "An LPG refill. The size matters more than the price, which moves.",
  repair: "Fixing something that broke. The repair, not the replacement.",
  other: "Anything else that gets consumed and isn't an ingredient.",
};

export type RunningCost = {
  id: string;
  label: string;
  kind: SpendKind;
  amount: number;
  /** "22kg", "11kg" — gas only. */
  sizeLabel: string | null;
  spentOn: string;
  supplierName: string | null;
  note: string | null;
};

/** How long a tank of one size actually lasts this shop, from its own refills. */
export type TankLife = {
  size: string;
  /** Median days between refills of this size. Null until there are two. */
  days: number | null;
  /** Days since the last one of this size went in. */
  sinceLast: number;
  /** What the last one cost — the price moves, so the last one is the useful one. */
  lastPaid: number;
  lastOn: string;
  /** True once the shop is at or past the usual life of this tank. */
  dueNow: boolean;
  /** How many refills of this size the estimate rests on. */
  refills: number;
};

const dayOf = (iso: string) => new Date(iso + "T00:00:00Z").getTime() / 864e5;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * How long a tank lasts, per size, from the gaps between refills.
 *
 * Median rather than mean: one fiesta week where two tanks went in three days
 * would otherwise drag the estimate down for months, and a warning that fires
 * too early gets ignored, which is the same as not having one.
 *
 * Sizes are kept apart because they are different questions. A shop that runs
 * an 11kg as a spare and a 22kg as the main tank has two different intervals,
 * and averaging them describes neither.
 *
 * Returns nothing for a size with one refill: a single date says when the
 * tank went in and nothing whatever about how long it lasts. Better to show
 * "not enough yet" than a confident number invented from one data point.
 */
export function tankLife(rows: RunningCost[], today: string): TankLife[] {
  const gas = rows
    .filter((r) => r.kind === "gas" && (r.sizeLabel ?? "").trim() !== "")
    .sort((a, b) => (a.spentOn < b.spentOn ? -1 : a.spentOn > b.spentOn ? 1 : 0));

  const bySize = new Map<string, RunningCost[]>();
  for (const r of gas) {
    const size = r.sizeLabel!.trim();
    bySize.set(size, [...(bySize.get(size) ?? []), r]);
  }

  const now = dayOf(today);
  const out: TankLife[] = [];

  for (const [size, refills] of bySize) {
    const gaps: number[] = [];
    for (let i = 1; i < refills.length; i++) {
      const gap = dayOf(refills[i].spentOn) - dayOf(refills[i - 1].spentOn);
      // A same-day second refill is a spare being bought, not a tank running
      // out in zero days. Counting it would halve every estimate.
      if (gap > 0) gaps.push(gap);
    }
    const last = refills[refills.length - 1];
    const days = gaps.length > 0 ? median(gaps) : null;
    const sinceLast = Math.max(0, Math.round(now - dayOf(last.spentOn)));

    out.push({
      size,
      days: days === null ? null : Math.round(days),
      sinceLast,
      lastPaid: last.amount,
      lastOn: last.spentOn,
      dueNow: days !== null && sinceLast >= days,
      refills: refills.length,
    });
  }

  // The one closest to running out first — that is the one worth acting on.
  return out.sort((a, b) => {
    const aLeft = a.days === null ? Infinity : a.days - a.sinceLast;
    const bLeft = b.days === null ? Infinity : b.days - b.sinceLast;
    return aLeft - bLeft;
  });
}

/**
 * What running costs amount to in a month.
 *
 * Averaged over the window they were measured in and scaled to thirty days —
 * the same treatment spoilage already gets, and for the same reason: these
 * are an ongoing cost to cover, not a one-off, so break-even has to carry
 * them whether or not one happened to land this week.
 *
 * Scaled by CALENDAR days rather than trading days, deliberately, and this is
 * the one place in the file where the two differ. Spoilage happens on days
 * the shop trades. A gas tank empties on those days too, but rent-like
 * regularity is not the claim here — the honest claim is "over the last N
 * calendar days the shop spent this much", and a month is thirty of those.
 */
export function monthlyRunningRate(
  rows: RunningCost[],
  windowDays: number
): number {
  if (windowDays <= 0) return 0;
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (total / windowDays) * 30;
}
