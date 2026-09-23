/**
 * What actually sold, add-ons included.
 *
 * Pulled out of `buildSnapshot` so it can be tested over rows instead of over
 * a database, and because what it counts turned out to be a decision rather
 * than a loop: for thirty days after the add-ons shipped, this tally read
 * `order_lines` and nothing else. Every extra rice, every upgraded drink, every
 * combo side was invisible to it.
 *
 * That is not a rounding error in a report. The same tally feeds the slow
 * movers — the list the owner is invited to cut from the menu — so a dish
 * selling three hundred a month purely as an add-on came back as ZERO and sat
 * at the top of it. The software was recommending the removal of a best
 * seller, in a confident voice, with a number beside it.
 *
 * Deliberately free of imports, like `costing.ts` and `restore-order.ts`, so
 * the tests can load it straight through Node.
 */

/** One add-on as it was sold, from `order_line_extras`. */
export type SoldExtra = {
  /** Copies of this add-on on ONE of the line's units — "2 extra rice". */
  qty: number;
  price_at_sale: number;
  /** What the chip said, frozen at the time of sale. */
  label: string;
  /** The dish this add-on is, or null once that dish has been deleted. */
  meals: { name: string } | null;
};

/** One order line, with whatever was added to it. */
export type SoldLine = {
  qty: number;
  price_at_sale: number;
  meals: { name: string } | null;
  order_line_extras?: SoldExtra[] | null;
  orders?: { status: string } | null;
};

export type SoldItem = { name: string; qty: number; revenue: number };

/**
 * Every dish that left the kitchen, by name, most-sold first.
 *
 * An add-on is counted under the dish it *is*, merged with any direct sales of
 * the same dish — because that is what it is. Extra rice comes off the same
 * shelf, out of the same recipe, at the same cost; whether it arrived on its
 * own line or hanging off a rice meal is a fact about the order form, not
 * about what the shop sold.
 *
 * When the option no longer names a dish (`meals` null, because that dish has
 * since been deleted) it falls back to the label the customer was shown. The
 * sale still happened, and "Extra rice" is a better answer than dropping it.
 *
 * Cancelled orders earned nothing and cost nothing, so they are skipped here
 * rather than by the query — the caller may legitimately want both.
 */
export function tallySales(lines: SoldLine[]): SoldItem[] {
  const tally = new Map<string, { qty: number; revenue: number }>();
  const add = (name: string, qty: number, revenue: number) => {
    const cur = tally.get(name) ?? { qty: 0, revenue: 0 };
    cur.qty += qty;
    cur.revenue += revenue;
    tally.set(name, cur);
  };

  for (const line of lines) {
    if (line.orders?.status === "cancelled") continue;
    const units = Math.max(0, Number(line.qty) || 0);
    add(line.meals?.name ?? "Unknown item", units, units * (Number(line.price_at_sale) || 0));

    for (const e of line.order_line_extras ?? []) {
      // Two extra rice on a line of three is six portions — the same
      // multiplication `order_requirements` does to work out the stock.
      const each = Math.max(1, Number(e.qty) || 1);
      const sold = each * units;
      add(e.meals?.name ?? e.label, sold, sold * (Number(e.price_at_sale) || 0));
    }
  }

  return [...tally.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);
}
