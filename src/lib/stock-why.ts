import type { PoolShort, Shortfall } from "./costing";

/**
 * Why a dish says the number it says.
 *
 * ── The question this exists to answer ───────────────────────────────────
 *
 * Four dishes on the till — La/BP Chicken Noodles, XL/BP Chicken Noodles,
 * La/BP Chicken Rice, XL/BP Chicken Rice — all cook from one batch, "BP
 * M.Chicken", and that batch had 18 packs made. The till showed 7, 7, 8 and
 * 8. The owner's question was the right one: where did 18 go, and why do
 * four dishes sharing one thing disagree with each other?
 *
 * Both halves of the answer were already computed and neither was ever
 * shown:
 *
 *   1. THE CHICKEN IS NOT WHAT IS HOLDING THEM BACK. A dish can make as many
 *      servings as its TIGHTEST recipe line allows, and for the noodle
 *      dishes that line is the noodles, not the chicken. 18 packs of chicken
 *      is plenty; there are only enough noodles for 7. The rice dishes stop
 *      at 8 for the same reason with a different ingredient. Nothing on the
 *      screen said which line was doing the stopping, so the only number the
 *      cashier could compare it against was the one they had just seen on
 *      the batch.
 *
 *   2. THE FOUR COUNTS CANNOT BE ADDED UP. Each is worked out as if that
 *      dish were the only thing being sold. 7 + 7 + 8 + 8 is 30 servings out
 *      of 18 packs of chicken — every number true on its own and the set of
 *      them badly misleading. The till already subtracts the basket from
 *      every dish sharing a shelf (`remainingFor`), so it KNOWS they are
 *      linked; it just never said so until something was in the basket.
 *
 * So this is the same class of bug the whole project keeps finding: the
 * software knowing something and not saying it. Nothing here computes a new
 * fact. It takes the lines `limitingFor` already produced and says which one
 * is answering, which ones are not, and who else is drinking from the same
 * well.
 *
 * Pure and separate from the component so it can be tested, because the
 * arithmetic is the part that has to be right — a "why" panel that explains
 * the wrong reason is worse than no panel, since it will be believed.
 */

/** One recipe line, with what the basket has already spoken for. */
export type WhyLine = Shortfall & {
  /** Taken by what is already on the ticket. */
  claimed: number;
  /** Left on the shelf after the ticket. Never below zero. */
  haveNow: number;
  /** Servings this line alone still allows, after the ticket. */
  allowsNow: number;
  /** True when this line is the one setting the dish's number. */
  binding: boolean;
};

export type StockWhy = {
  /**
   * The number on the badge. Null when the dish has no recipe — which is not
   * zero, and must never be drawn as a shortage.
   */
  left: number | null;
  /** Every line, tightest first. */
  lines: WhyLine[];
  /** The line or lines that set the number. Empty when there is no recipe. */
  binding: WhyLine[];
  /** The lines with room to spare — the ones the cashier can stop worrying about. */
  roomy: WhyLine[];
};

/**
 * Work out the number and, more importantly, what produced it.
 *
 * `left` is recomputed here from the same lines rather than taken as an
 * argument. A panel that explains a number it was handed can drift from the
 * badge beside it — and then two things on one screen state different facts
 * while both look authoritative, which is worse than either being wrong
 * alone. One set of rows, one answer, no way for them to disagree.
 */
export function explainStock(
  limits: Shortfall[],
  claimed: Map<string, PoolShort> = new Map()
): StockWhy {
  const lines: WhyLine[] = limits
    .filter((s) => Number(s.need) > 0)
    .map((s) => {
      const taken = claimed.get(s.refId)?.need ?? 0;
      const haveNow = Math.max(0, Number(s.have) - taken);
      return {
        ...s,
        claimed: taken,
        haveNow,
        allowsNow: Math.max(0, Math.floor(haveNow / Number(s.need))),
        binding: false,
      };
    })
    .sort((a, b) => a.allowsNow - b.allowsNow);

  if (lines.length === 0) {
    return { left: null, lines: [], binding: [], roomy: [] };
  }

  const left = Math.min(...lines.map((l) => l.allowsNow));
  // Ties are all marked, not just the first. Two things running out together
  // is a real state — restocking only the one at the top would move the
  // number by nothing, and the cashier would reasonably conclude the panel
  // had lied to them.
  for (const l of lines) l.binding = l.allowsNow === left;

  return {
    left,
    lines,
    binding: lines.filter((l) => l.binding),
    roomy: lines.filter((l) => !l.binding),
  };
}

/** Another dish drawing on the same ingredient or batch. */
export type Sharer = {
  mealId: string;
  name: string;
  /** How much of it one serving of THAT dish takes. */
  need: number;
};

/**
 * Who else is drinking from this well.
 *
 * The missing half of the owner's question. Knowing that the noodles are
 * what stop this dish at 7 explains one tile; knowing that three other tiles
 * are counting the same packs of chicken explains the screen.
 *
 * Sorted by the heaviest user first, because that is the one that will move
 * the number most when it sells — and named rather than counted, since "3
 * other dishes" still leaves somebody opening tiles to find out which.
 */
export function alsoDrawOn(
  refId: string,
  meals: { id: string; name: string; limits?: Shortfall[] }[],
  exceptMealId: string
): Sharer[] {
  const out: Sharer[] = [];
  for (const m of meals) {
    if (m.id === exceptMealId) continue;
    const line = (m.limits ?? []).find(
      (s) => s.refId === refId && Number(s.need) > 0
    );
    if (!line) continue;
    out.push({ mealId: m.id, name: m.name, need: Number(line.need) });
  }
  return out.sort((a, b) => b.need - a.need || a.name.localeCompare(b.name));
}

/**
 * The sentence under the number.
 *
 * Written here rather than in the component so the wording is covered by the
 * tests too. The three cases are genuinely different questions and a single
 * phrasing bent to cover all of them would answer none of them well.
 */
export function whySentence(why: StockWhy): string {
  if (why.left === null) {
    return "No recipe entered, so nothing here knows what this dish takes. The count is blank rather than zero — it is unknown, not sold out.";
  }
  const names = why.binding.map((l) => l.label);
  const first = names[0] ?? "";
  if (why.left <= 0) {
    return names.length === 1
      ? `Out because ${first} has run out.`
      : `Out because ${names.join(" and ")} have run out.`;
  }
  return names.length === 1
    ? `${why.left} left because ${first} runs out first.`
    : `${why.left} left because ${names.join(" and ")} run out together.`;
}

/** "1,400 g on the shelf, 200 g a serving" — the division, spelled out. */
export function lineArithmetic(l: WhyLine): string {
  const n = (v: number) =>
    Number.isInteger(v)
      ? v.toLocaleString("en-PH")
      : v.toLocaleString("en-PH", { maximumFractionDigits: 3 });
  const shelf = `${n(l.haveNow)} ${l.unit}`;
  const per = `${n(Number(l.need))} ${l.unit} a serving`;
  return l.claimed > 0
    ? `${shelf} left after this ticket (${n(Number(l.have))} on the shelf, ${n(l.claimed)} spoken for), ${per}`
    : `${shelf} on the shelf, ${per}`;
}
