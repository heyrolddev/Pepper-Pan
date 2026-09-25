/**
 * What is in a dish.
 *
 * Built the same way the cost is: a figure per unit on the ingredient,
 * multiplied by what the recipe takes, summed through batches and combos. The
 * alternative — four numbers typed onto the dish — is right on the day it is
 * typed and wrong the first time somebody adds a slice of cheese, and nothing
 * anywhere would say it had gone wrong.
 *
 * THE RULE THAT MATTERS is what happens when the data is incomplete, because
 * it will be incomplete for weeks: nobody fills in forty ingredients in one
 * sitting. A dish whose recipe has five lines and nutrition on three of them
 * has a SUM, and that sum is smaller than the truth. Showing it would be the
 * worst thing this file could do — a customer counting calories is given a
 * number that is confidently too low, and it looks exactly like a correct one.
 *
 * So: `missing` comes back with every figure, and nothing customer-facing
 * renders until it is zero. The admin screens show the partial total AND what
 * is missing, because there the number is a progress bar, not a claim.
 */

/** Grams for the macros, kilocalories for the energy. */
export type Nutrition = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export const NO_NUTRITION: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Per one unit of whatever the ingredient is measured in. Null = not known. */
export type PerUnit = {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export const hasNutrition = (n: PerUnit | null | undefined): boolean =>
  !!n &&
  (n.kcal !== null || n.protein !== null || n.carbs !== null || n.fat !== null);

function num(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function scale(n: PerUnit, qty: number): Nutrition {
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  return {
    kcal: num(n.kcal) * q,
    protein: num(n.protein) * q,
    carbs: num(n.carbs) * q,
    fat: num(n.fat) * q,
  };
}

export function add(a: Nutrition, b: Nutrition): Nutrition {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

/**
 * Energy worked out from the macros, when nobody typed it.
 *
 * The Atwater factors — 4 kcal a gram for protein and for carbohydrate, 9 for
 * fat — which is how every food label in the world is produced. Worth doing
 * because the macros are the part somebody reading a packet can see, and
 * making them type a fourth number they would only be computing from the
 * other three is a way to get it wrong.
 */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

export function energyFromMacros(n: Nutrition): number {
  return (
    n.protein * ATWATER.protein + n.carbs * ATWATER.carbs + n.fat * ATWATER.fat
  );
}

/** What a dish works out to, and how much of it is actually known. */
export type DishNutrition = {
  per: Nutrition;
  /** Recipe lines carrying no nutrition. Zero means the figure is complete. */
  missing: number;
  /** Those lines by name, so a screen can say which. */
  missingNames: string[];
  /** The owner typed these rather than the recipe producing them. */
  manual: boolean;
};

/** Only a complete figure may be shown to a customer. */
export const isComplete = (d: DishNutrition | null | undefined): boolean =>
  !!d && d.missing === 0 && d.per.kcal > 0;

/* ------------------------------------------------------------------
 * The rollup
 * ------------------------------------------------------------------ */

export type NutritionLine = { ref_type: string; ref_id: string; qty: number };

export type RollupInput = {
  /** Recipe lines by meal id. */
  mealLines: Map<string, NutritionLine[]>;
  /** Combo parts by meal id: another meal, times a quantity. */
  mealParts: Map<string, { component_meal_id: string; qty: number }[]>;
  /** Recipe lines by batch id — a batch may contain other batches. */
  batchLines: Map<string, NutritionLine[]>;
  /** How many yield units one run of a batch makes. */
  batchYield: Map<string, number>;
  /** Nutrition per unit, by ingredient id. */
  perIngredient: Map<string, PerUnit>;
  /** Names, so a missing line can be named rather than counted. */
  nameOf: Map<string, string>;
  /** The owner's override, by meal id. All-null means there is none. */
  override?: Map<string, PerUnit>;
};

type Partial_ = { total: Nutrition; missing: string[] };

/**
 * One yield unit of a batch.
 *
 * Divided by the yield, exactly as `batch_cost_per_unit` divides the cost, so
 * a recipe asking for 60 g of marinade gets 60 units' worth and not a whole
 * batch's. A batch with no yield recorded cannot be divided by, so it counts
 * as unknown rather than as infinity or as zero.
 */
function batchPerUnit(id: string, input: RollupInput, seen: Set<string>): Partial_ {
  if (seen.has(id)) {
    // A batch that contains itself. Costing already survives this by
    // returning a number; so does this, rather than recursing until the page
    // dies — but the loop is reported as missing, because nothing about the
    // figure can be trusted.
    return { total: { ...NO_NUTRITION }, missing: [input.nameOf.get(id) ?? "A recipe loop"] };
  }
  const yieldQty = Number(input.batchYield.get(id));
  if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
    return { total: { ...NO_NUTRITION }, missing: [input.nameOf.get(id) ?? "A batch"] };
  }

  const next = new Set(seen).add(id);
  const whole = linesTotal(input.batchLines.get(id) ?? [], input, next);
  return {
    total: {
      kcal: whole.total.kcal / yieldQty,
      protein: whole.total.protein / yieldQty,
      carbs: whole.total.carbs / yieldQty,
      fat: whole.total.fat / yieldQty,
    },
    missing: whole.missing,
  };
}

function linesTotal(
  lines: NutritionLine[],
  input: RollupInput,
  seen: Set<string>
): Partial_ {
  let total: Nutrition = { ...NO_NUTRITION };
  const missing: string[] = [];

  for (const line of lines) {
    const qty = Number(line.qty) || 0;
    if (line.ref_type === "batch") {
      const per = batchPerUnit(line.ref_id, input, seen);
      total = add(total, {
        kcal: per.total.kcal * qty,
        protein: per.total.protein * qty,
        carbs: per.total.carbs * qty,
        fat: per.total.fat * qty,
      });
      missing.push(...per.missing);
      continue;
    }

    const per = input.perIngredient.get(line.ref_id);
    if (!hasNutrition(per)) {
      missing.push(input.nameOf.get(line.ref_id) ?? "An ingredient");
      continue;
    }
    total = add(total, scale(per!, qty));
  }

  return { total, missing };
}

/**
 * Every dish, worked out.
 *
 * Combos recurse into their parts. The `seen` set is the same guard costing
 * uses: a combo containing itself is a data problem, and it should surface as
 * a dish with no figure rather than as a page that never finishes loading.
 */
export function nutritionOf(
  mealIds: readonly string[],
  input: RollupInput
): Map<string, DishNutrition> {
  const out = new Map<string, DishNutrition>();

  const build = (mealId: string, seen: Set<string>): DishNutrition => {
    const override = input.override?.get(mealId);
    if (hasNutrition(override)) {
      const per = scale(override!, 1);
      return {
        per: per.kcal > 0 ? per : { ...per, kcal: energyFromMacros(per) },
        missing: 0,
        missingNames: [],
        manual: true,
      };
    }

    if (seen.has(mealId)) {
      return {
        per: { ...NO_NUTRITION },
        missing: 1,
        missingNames: [input.nameOf.get(mealId) ?? "A combo loop"],
        manual: false,
      };
    }
    const next = new Set(seen).add(mealId);

    const own = linesTotal(input.mealLines.get(mealId) ?? [], input, next);
    let total = own.total;
    const missing = [...own.missing];

    for (const part of input.mealParts.get(mealId) ?? []) {
      const inner = build(part.component_meal_id, next);
      const qty = Number(part.qty) || 0;
      total = add(total, {
        kcal: inner.per.kcal * qty,
        protein: inner.per.protein * qty,
        carbs: inner.per.carbs * qty,
        fat: inner.per.fat * qty,
      });
      missing.push(...inner.missingNames);
    }

    // A dish with no recipe at all is not "complete with zero calories" — it
    // is unknown, and saying 0 kcal would be a claim nobody made.
    const empty =
      (input.mealLines.get(mealId) ?? []).length === 0 &&
      (input.mealParts.get(mealId) ?? []).length === 0;

    const names = [...new Set(missing)];
    return {
      per: total.kcal > 0 ? total : { ...total, kcal: energyFromMacros(total) },
      missing: empty ? 1 : names.length,
      missingNames: empty ? ["No recipe yet"] : names,
      manual: false,
    };
  };

  for (const id of mealIds) out.set(id, build(id, new Set()));
  return out;
}

/* ------------------------------------------------------------------
 * Saying it
 * ------------------------------------------------------------------ */

/** Rounded the way a food label rounds: energy whole, macros to the gram. */
export function round(n: Nutrition): Nutrition {
  return {
    kcal: Math.round(n.kcal),
    protein: Math.round(n.protein),
    carbs: Math.round(n.carbs),
    fat: Math.round(n.fat),
  };
}

/**
 * How the three macros divide the energy, as percentages that add to 100.
 *
 * For the bar on the card. Computed from the macros' own energy rather than
 * from the stated kcal, so the three segments always fill the bar exactly —
 * a label whose stated energy disagrees with its macros (common, because both
 * get rounded) would otherwise leave a gap or overflow.
 */
export function macroSplit(n: Nutrition): { protein: number; carbs: number; fat: number } {
  const p = n.protein * ATWATER.protein;
  const c = n.carbs * ATWATER.carbs;
  const f = n.fat * ATWATER.fat;
  const all = p + c + f;
  if (all <= 0) return { protein: 0, carbs: 0, fat: 0 };
  const protein = Math.round((p / all) * 100);
  const carbs = Math.round((c / all) * 100);
  return { protein, carbs, fat: 100 - protein - carbs };
}

/* ------------------------------------------------------------------
 * Typing it in
 * ------------------------------------------------------------------ */

/**
 * How many units the owner is quoting for.
 *
 * The column stores per ONE unit, because that is what a recipe quantity
 * multiplies. Nobody can type that. A packet of breading says "368 kcal per
 * 100 g", and asking for 3.68 per gram invites exactly one mistake — a
 * decimal place — which multiplies every dish using it by ten and reads as a
 * perfectly plausible number.
 *
 * So weight and volume are entered per 100, the way the packet prints them,
 * and counted things per one, the way a cheese slice is sold. Anything
 * unrecognised is per one: a wrong guess here silently scales a real figure,
 * where per-one is at worst a units mismatch the owner can see.
 */
const PER_HUNDRED = new Set(["g", "gram", "grams", "ml", "millilitre", "milliliter"]);

export function entryBasis(unit: string | null | undefined): 1 | 100 {
  return PER_HUNDRED.has((unit ?? "").trim().toLowerCase()) ? 100 : 1;
}

/** What the owner types, turned into what the column holds. */
export function toPerUnit(typed: number | null, unit: string | null | undefined): number | null {
  if (typed === null || !Number.isFinite(typed) || typed < 0) return null;
  return typed / entryBasis(unit);
}

/** What the column holds, turned back into what the owner typed. */
export function fromPerUnit(stored: number | null, unit: string | null | undefined): number | null {
  if (stored === null || !Number.isFinite(stored)) return null;
  return stored * entryBasis(unit);
}
