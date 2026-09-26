/**
 * What goes on the buying list, and why.
 *
 * Pulled out of `inventory-insight.ts` so it can be tested without a
 * database — that file imports the admin client at the top, and this rule is
 * the part that was wrong.
 *
 * TWO REASONS TO BE ON THE LIST. For a long time only one of them counted,
 * and the owner's report was simply "hindi lahat ng low stock ay nandito":
 *
 *   RUNNING OUT. Worked out from what the shop actually gets through. This
 *   one always worked, and it is the better signal when there is history —
 *   a static level cannot know that the breading goes four times faster in
 *   December.
 *
 *   BELOW THE OWNER'S LEVEL. Somebody sets "tell me at 500 g" on the cooking
 *   oil. The oil drops to 400 g. The list stayed quiet, because seven days'
 *   usage happened to be less than 500 g and usage was the only thing asked.
 *
 * And underneath both, the one that removed the most: an ingredient the shop
 * has never recorded USING was skipped before either test ran. That is most
 * of a new store room, and everything that goes into a dish nobody has
 * ordered yet.
 */

/** Days of cover the usage-based level aims for. */
export const COVER_DAYS = 7;

export type ShelfItem = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** The owner's own "tell me at this much". Zero means they set none. */
  reorder: number;
  /** Cost of one unit. */
  cost: number;
};

export type BuyLine = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  dailyAvg: number;
  /** Null when the shop has never recorded using this one. */
  daysLeft: number | null;
  parLevel: number;
  buy: number;
  cost: number;
  reason: "running-out" | "below-level";
};

/**
 * Does this one need buying, and on what grounds?
 *
 * Null when it does not. `dailyAvg` of zero is a real answer — "never
 * recorded used" — and must not be mistaken for "uses none", which is why
 * the level test runs regardless of it.
 */
export function buyLineFor(
  item: ShelfItem,
  dailyAvg: number,
  coverDays = COVER_DAYS
): BuyLine | null {
  const stock = Number(item.stock) || 0;
  const reorder = Number(item.reorder) || 0;
  const rate = Number.isFinite(dailyAvg) && dailyAvg > 0 ? dailyAvg : 0;

  const usagePar = rate * coverDays;
  const runningOut = rate > 0 && stock < usagePar;
  const belowLevel = reorder > 0 && stock <= reorder;
  if (!runningOut && !belowLevel) return null;

  // Back over BOTH lines. Buying up to only one of them leaves the row on
  // the list tomorrow, which teaches the owner the list is wrong.
  const parLevel = Math.max(usagePar, reorder);
  const buy = Math.max(0, parLevel - stock);

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    stock,
    dailyAvg: rate,
    daysLeft: rate > 0 ? stock / rate : null,
    parLevel,
    buy,
    cost: buy * (Number(item.cost) || 0),
    reason: runningOut ? "running-out" : "below-level",
  };
}

/**
 * The list, in the order you would actually shop in.
 *
 * Soonest to run out first. The ones with no usage history have no
 * "soonest", so they go after everything that does — rather than sorting as
 * zero, which puts them at the top looking like emergencies, or as Infinity,
 * which in a list of days is indistinguishable from a large number.
 */
export function orderBuyList<T extends Pick<BuyLine, "daysLeft" | "name">>(
  lines: readonly T[]
): T[] {
  return [...lines].sort((a, b) => {
    if (a.daysLeft === null && b.daysLeft === null) {
      return a.name.localeCompare(b.name);
    }
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });
}
