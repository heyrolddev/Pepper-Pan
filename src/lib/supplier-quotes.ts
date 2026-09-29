/**
 * What a supplier says they charge, turned into something comparable —
 * or an honest refusal.
 *
 * ── Why this is its own file with its own tests ──────────────────────────
 *
 * The market sells chicken by the kilo. `ingredients.cost` is per ONE unit —
 * ₱0.018 per gram of salt, not ₱18 per kilo. So every quote has to cross a
 * unit boundary before it can be held against anything, and a wrong factor
 * here does not look wrong: it makes one supplier appear a thousand times
 * cheaper than another, on a screen whose entire job is choosing between
 * them.
 *
 * So the conversions are a written-down list of pairs this shop actually
 * uses, and everything else returns "cannot compare" rather than a number.
 * The quote is still shown — the owner typed it and it is true — it simply
 * is not dressed up as a comparison it cannot support.
 *
 * That is the same rule `entryBasis` in `lib/nutrition.ts` already follows
 * for the same hazard, and the reason is the one written there: a wrong
 * guess silently scales a real figure, where a refusal is a mismatch
 * somebody can see and fix.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

export type Quote = {
  /** What they said. */
  price: number;
  /** How much that price is for. "₱230 for 1 kg" is 230 and 1. */
  qty: number;
  /** The unit they quoted in, as typed. */
  unit: string;
};

const fold = (u: string) => u.trim().toLowerCase().replace(/\.$/, "");

/**
 * How many of the smaller unit are in one of the larger.
 *
 * Only the pairs a Philippine stall actually buys in. Adding a row is a
 * decision somebody makes on purpose; inferring one from a name is how
 * "lb" quietly becomes a kilo.
 */
const PER: Record<string, { base: string; factor: number }> = {
  kg: { base: "g", factor: 1000 },
  kilo: { base: "g", factor: 1000 },
  kilos: { base: "g", factor: 1000 },
  kilogram: { base: "g", factor: 1000 },
  kilograms: { base: "g", factor: 1000 },
  g: { base: "g", factor: 1 },
  gram: { base: "g", factor: 1 },
  grams: { base: "g", factor: 1 },
  l: { base: "ml", factor: 1000 },
  li: { base: "ml", factor: 1000 },
  liter: { base: "ml", factor: 1000 },
  litre: { base: "ml", factor: 1000 },
  liters: { base: "ml", factor: 1000 },
  litres: { base: "ml", factor: 1000 },
  ml: { base: "ml", factor: 1 },
  millilitre: { base: "ml", factor: 1 },
  milliliter: { base: "ml", factor: 1 },
  // Counted things. A piece is a piece whatever it is called.
  pc: { base: "pc", factor: 1 },
  pcs: { base: "pc", factor: 1 },
  piece: { base: "pc", factor: 1 },
  pieces: { base: "pc", factor: 1 },
  pack: { base: "pack", factor: 1 },
  packs: { base: "pack", factor: 1 },
};

export type PerUnit =
  | { ok: true; perUnit: number; unit: string }
  | { ok: false; why: string };

/**
 * The quote as pesos per one of the INGREDIENT's own unit.
 *
 * Refuses rather than guesses when the two units are not a pair it knows —
 * a quote in sacks against a recipe in grams is a real thing to want and
 * not a thing this can answer without being told how big a sack is.
 */
export function perUnitPrice(quote: Quote, ingredientUnit: string): PerUnit {
  const price = Number(quote.price);
  const qty = Number(quote.qty);
  if (!Number.isFinite(price) || price < 0) return { ok: false, why: "That price isn't a number." };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, why: "That quantity isn't a number." };

  const from = PER[fold(quote.unit)];
  const to = PER[fold(ingredientUnit)];

  if (!from || !to) {
    return {
      ok: false,
      why: `Nothing here knows how to turn ${quote.unit.trim() || "that"} into ${
        ingredientUnit.trim() || "the recipe's unit"
      }, so this price is shown as quoted and not compared.`,
    };
  }
  if (from.base !== to.base) {
    return {
      ok: false,
      why: `${quote.unit.trim()} and ${ingredientUnit.trim()} measure different things, so these two prices can't be compared.`,
    };
  }

  // qty of `from` units → how many `to` units that is.
  const inTargetUnits = (qty * from.factor) / to.factor;
  if (inTargetUnits <= 0) return { ok: false, why: "That comes to nothing." };
  return { ok: true, perUnit: price / inTargetUnits, unit: ingredientUnit.trim() };
}

export type Verdict =
  | { kind: "unknown"; why: string }
  | { kind: "cheaper" | "dearer" | "same"; perUnit: number; against: number; change: number };

/**
 * The quote against what the shop is currently paying for that ingredient.
 *
 * Under a twentieth is called the same, for the reason every threshold in
 * this system has one: two prices within five per cent are not a reason to
 * change who you buy from, and a screen that says they are gets ignored.
 */
export function compareToCost(
  quote: Quote,
  ingredient: { unit: string; cost: number | null }
): Verdict {
  const per = perUnitPrice(quote, ingredient.unit);
  if (!per.ok) return { kind: "unknown", why: per.why };

  const cost = Number(ingredient.cost);
  if (!Number.isFinite(cost) || cost <= 0) {
    return {
      kind: "unknown",
      why: "Nothing is recorded as the current cost of this one, so there is nothing to compare against yet.",
    };
  }

  const change = (per.perUnit - cost) / cost;
  if (Math.abs(change) < 0.05) {
    return { kind: "same", perUnit: per.perUnit, against: cost, change };
  }
  return {
    kind: change < 0 ? "cheaper" : "dearer",
    perUnit: per.perUnit,
    against: cost,
    change,
  };
}

/** The quote the way it was given, for a screen. */
export function quoteLabel(quote: Quote): string {
  const qty = Number(quote.qty);
  const unit = quote.unit.trim();
  const amount = `₱${Number(quote.price).toFixed(2)}`;
  // "₱230.00 per kg" reads better than "for 1 kg", and only when it IS one.
  return qty === 1 ? `${amount} per ${unit}` : `${amount} for ${qty} ${unit}`;
}

/**
 * Who sells this ingredient cheapest, out of the quotes on file.
 *
 * The question somebody actually has standing at the market, and the shop
 * has never been able to ask it. Only quotes that convert are ranked —
 * one in sacks cannot be placed against one in kilos, and leaving it out
 * of the ranking is better than putting it somewhere invented.
 */
export function cheapestFor(
  ingredientUnit: string,
  quotes: (Quote & { supplierId: string; supplierName: string; quotedOn: string })[]
): { supplierId: string; supplierName: string; perUnit: number; quotedOn: string }[] {
  const ranked: {
    supplierId: string;
    supplierName: string;
    perUnit: number;
    quotedOn: string;
  }[] = [];
  for (const q of quotes) {
    const per = perUnitPrice(q, ingredientUnit);
    if (!per.ok) continue;
    ranked.push({
      supplierId: q.supplierId,
      supplierName: q.supplierName,
      perUnit: per.perUnit,
      quotedOn: q.quotedOn,
    });
  }
  return ranked.sort((a, b) => a.perUnit - b.perUnit);
}
