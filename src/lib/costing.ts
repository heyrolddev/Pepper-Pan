/**
 * What a dish actually costs to make.
 *
 * Fourteen tables have been sitting in this database since the first
 * migration — ingredients, batches, recipes, waste — and until now not one
 * line of the app read them. So the shop knew exactly what came in and nothing
 * at all about what went out, which means the number everyone actually cares
 * about, "did I make money on that", has never once been on screen.
 *
 * The arithmetic is small. Getting it *honest* is the work, and that's what
 * most of this file is about: a dish with no recipe entered must never render
 * as "₱0 cost, 100% margin", and a recipe pointing at an ingredient that was
 * deleted must not quietly cost ₱0. Both look like fantastic news. Both are
 * the software failing silently, which is the failure mode this project keeps
 * having to design against.
 *
 * Everything here is a pure function over rows, so the same numbers come out
 * on the server, in a CSV, and in the browser.
 */

export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  /** Cost of ONE unit — ₱0.018 per gram of salt, not ₱18 per kilo. */
  cost: number;
  stock: number;
  reorder: number;
  purchase_price: number;
  purchase_qty: number;
  categories: string[] | null;
};

export type Batch = {
  id: string;
  name: string;
  yield_qty: number;
  yield_unit: string;
  batch_stock: number;
  reorder_level: number;
  /** Set for repacks that have no recipe — a bought item split into portions. */
  manual_cost_per_unit: number | null;
};

export type BatchIngredient = {
  batch_id: string;
  ingredient_id: string;
  qty: number;
};

export type Meal = {
  id: string;
  name: string;
  price: number;
  kind: string;
  categories: string[] | null;
  is_public: boolean;
  is_available: boolean;
  image_url: string | null;
};

export type MealIngredient = {
  meal_id: string;
  ref_type: string; // "inv" | "batch"
  ref_id: string;
  qty: number;
};

export type MealComponent = {
  meal_id: string;
  component_meal_id: string;
  qty: number;
};

/** One line of a recipe, priced. */
export type CostLine = {
  label: string;
  kind: "ingredient" | "batch" | "meal";
  qty: number;
  unit: string;
  /** ₱ per unit of whatever `unit` is. */
  unitCost: number;
  /** qty × unitCost. */
  cost: number;
  /** Set when the thing this line points at could not be priced. */
  problem: string | null;
};

export type BatchCost = {
  batch: Batch;
  /** ₱ to make one full batch. */
  total: number;
  /** ₱ per unit of yield — this is what a recipe multiplies by. */
  perUnit: number;
  lines: CostLine[];
  /** True when nothing reliable can be said about this batch's cost. */
  unknown: boolean;
  problems: string[];
};

export type MealCost = {
  meal: Meal;
  /** ₱ of ingredients in one serving. Only meaningful when `costed` is true. */
  cost: number;
  lines: CostLine[];
  /**
   * False when the dish has no recipe at all. The difference between "this
   * costs nothing" and "nobody has told the system what's in it" is the whole
   * point — one is a triumph, the other is a blank.
   */
  costed: boolean;
  /** Priced, but with holes — the cost shown is a floor, not the truth. */
  problems: string[];
};

/** Never divide by a zero yield. */
function safeDiv(total: number, by: number): number | null {
  return by > 0 ? total / by : null;
}

/**
 * Price every batch.
 *
 * Batches only ever contain ingredients, never other batches, so there's no
 * recursion to worry about here — a single pass is enough.
 */
export function costBatches(
  batches: Batch[],
  batchIngredients: BatchIngredient[],
  ingredients: Ingredient[]
): Map<string, BatchCost> {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const linesFor = new Map<string, BatchIngredient[]>();
  for (const bi of batchIngredients) {
    const list = linesFor.get(bi.batch_id) ?? [];
    list.push(bi);
    linesFor.set(bi.batch_id, list);
  }

  const out = new Map<string, BatchCost>();
  for (const batch of batches) {
    const raw = linesFor.get(batch.id) ?? [];
    const problems: string[] = [];
    const lines: CostLine[] = raw.map((bi) => {
      const ing = byId.get(bi.ingredient_id);
      if (!ing) {
        const problem = "Ingredient no longer exists";
        problems.push(`A line in this batch points at a deleted ingredient.`);
        return {
          label: "Deleted ingredient",
          kind: "ingredient" as const,
          qty: Number(bi.qty) || 0,
          unit: "",
          unitCost: 0,
          cost: 0,
          problem,
        };
      }
      const qty = Number(bi.qty) || 0;
      const unitCost = Number(ing.cost) || 0;
      if (unitCost <= 0) problems.push(`${ing.name} has no purchase price set.`);
      return {
        label: ing.name,
        kind: "ingredient" as const,
        qty,
        unit: ing.unit,
        unitCost,
        cost: qty * unitCost,
        problem: unitCost > 0 ? null : "No price set",
      };
    });

    const total = lines.reduce((sum, l) => sum + l.cost, 0);

    // A repack — bought ready-made and split into portions — has no recipe by
    // design, and its cost is typed in directly. Checked first, or a repack
    // would be reported as an empty batch.
    const manual = batch.manual_cost_per_unit;
    if (manual !== null && manual !== undefined && Number(manual) > 0) {
      out.set(batch.id, {
        batch,
        total: Number(manual) * (Number(batch.yield_qty) || 0),
        perUnit: Number(manual),
        lines,
        unknown: false,
        problems,
      });
      continue;
    }

    const perUnit = safeDiv(total, Number(batch.yield_qty) || 0);
    if (perUnit === null) {
      problems.push(
        raw.length === 0
          ? "No recipe entered for this batch."
          : "Yield is zero, so a per-gram cost can't be worked out."
      );
    }
    out.set(batch.id, {
      batch,
      total,
      perUnit: perUnit ?? 0,
      lines,
      unknown: perUnit === null || raw.length === 0,
      problems,
    });
  }
  return out;
}

/**
 * Price every meal, including combos built out of other meals.
 *
 * Combos recurse, and a combo that contains itself — however it got entered —
 * would otherwise hang the page rather than show a wrong number. The `seen`
 * set turns that into a visible problem on the dish instead.
 */
export function costMeals(
  meals: Meal[],
  mealIngredients: MealIngredient[],
  mealComponents: MealComponent[],
  ingredients: Ingredient[],
  batchCosts: Map<string, BatchCost>
): Map<string, MealCost> {
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const mealById = new Map(meals.map((m) => [m.id, m]));

  const ingLines = new Map<string, MealIngredient[]>();
  for (const mi of mealIngredients) {
    const list = ingLines.get(mi.meal_id) ?? [];
    list.push(mi);
    ingLines.set(mi.meal_id, list);
  }
  const compLines = new Map<string, MealComponent[]>();
  for (const mc of mealComponents) {
    const list = compLines.get(mc.meal_id) ?? [];
    list.push(mc);
    compLines.set(mc.meal_id, list);
  }

  const done = new Map<string, MealCost>();

  function build(meal: Meal, seen: Set<string>): MealCost {
    const cached = done.get(meal.id);
    if (cached) return cached;

    const problems: string[] = [];
    const lines: CostLine[] = [];

    for (const mi of ingLines.get(meal.id) ?? []) {
      const qty = Number(mi.qty) || 0;
      if (mi.ref_type === "batch") {
        const bc = batchCosts.get(mi.ref_id);
        if (!bc) {
          problems.push("A line points at a batch that no longer exists.");
          lines.push({
            label: "Deleted batch",
            kind: "batch",
            qty,
            unit: "",
            unitCost: 0,
            cost: 0,
            problem: "Batch no longer exists",
          });
          continue;
        }
        if (bc.unknown) {
          problems.push(`${bc.batch.name} has no cost yet, so it counts as ₱0 here.`);
        }
        lines.push({
          label: bc.batch.name,
          kind: "batch",
          qty,
          unit: bc.batch.yield_unit,
          unitCost: bc.perUnit,
          cost: qty * bc.perUnit,
          problem: bc.unknown ? "Batch not costed" : null,
        });
        continue;
      }

      const ing = ingById.get(mi.ref_id);
      if (!ing) {
        problems.push("A line points at an ingredient that no longer exists.");
        lines.push({
          label: "Deleted ingredient",
          kind: "ingredient",
          qty,
          unit: "",
          unitCost: 0,
          cost: 0,
          problem: "Ingredient no longer exists",
        });
        continue;
      }
      const unitCost = Number(ing.cost) || 0;
      if (unitCost <= 0) problems.push(`${ing.name} has no purchase price set.`);
      lines.push({
        label: ing.name,
        kind: "ingredient",
        qty,
        unit: ing.unit,
        unitCost,
        cost: qty * unitCost,
        problem: unitCost > 0 ? null : "No price set",
      });
    }

    for (const mc of compLines.get(meal.id) ?? []) {
      const qty = Number(mc.qty) || 0;
      const child = mealById.get(mc.component_meal_id);
      if (!child) {
        problems.push("A combo line points at a dish that no longer exists.");
        lines.push({
          label: "Deleted dish",
          kind: "meal",
          qty,
          unit: "serving",
          unitCost: 0,
          cost: 0,
          problem: "Dish no longer exists",
        });
        continue;
      }
      if (seen.has(child.id)) {
        // A combo containing itself. Left as a problem rather than followed,
        // because following it never returns.
        problems.push(`${child.name} contains this dish, so the loop is ignored.`);
        lines.push({
          label: child.name,
          kind: "meal",
          qty,
          unit: "serving",
          unitCost: 0,
          cost: 0,
          problem: "Combo refers back to itself",
        });
        continue;
      }
      const childCost = build(child, new Set([...seen, meal.id]));
      if (!childCost.costed) {
        problems.push(`${child.name} has no recipe, so it counts as ₱0 here.`);
      }
      problems.push(...childCost.problems);
      lines.push({
        label: child.name,
        kind: "meal",
        qty,
        unit: "serving",
        unitCost: childCost.cost,
        cost: qty * childCost.cost,
        problem: childCost.costed ? null : "Dish not costed",
      });
    }

    const result: MealCost = {
      meal,
      cost: lines.reduce((sum, l) => sum + l.cost, 0),
      lines,
      costed: lines.length > 0,
      // Deduped: one ingredient with no price can otherwise be reported once
      // per dish that uses it, and the list becomes unreadable.
      problems: [...new Set(problems)],
    };
    // Only cached once built without an active cycle above it, so a dish
    // reached through a loop isn't memoised with its loop-truncated cost.
    if (seen.size === 0) done.set(meal.id, result);
    return result;
  }

  const out = new Map<string, MealCost>();
  for (const meal of meals) out.set(meal.id, build(meal, new Set()));
  return out;
}

// ---------------------------------------------------------------------------
// The numbers the owner actually reads
// ---------------------------------------------------------------------------

export type Margin = {
  /** ₱ left over on one serving, after ingredients. */
  gross: number;
  /** Ingredients as a share of the price. The trade calls this food cost. */
  foodCostPct: number | null;
  /** gross ÷ price. */
  marginPct: number | null;
  /** Verdict, for colour and sorting. */
  verdict: "losing" | "tight" | "ok" | "great" | "unknown";
};

/**
 * Where the thresholds come from.
 *
 * Street food generally aims for food cost around 30%: a third to ingredients,
 * the rest covering gas, packaging, rent, the stall, labour, and profit. Under
 * 25% is comfortable, over 40% is thin once everything else is paid, and above
 * 100% the dish costs more than it sells for.
 *
 * These are rules of thumb, not physics, which is why the UI shows the actual
 * percentage next to the verdict rather than only a colour.
 */
export const FOOD_COST_TARGET = 30;

export function marginFor(price: number, cost: number, costed: boolean): Margin {
  const p = Number(price) || 0;
  if (!costed || p <= 0) {
    return { gross: 0, foodCostPct: null, marginPct: null, verdict: "unknown" };
  }
  const gross = p - cost;
  const foodCostPct = (cost / p) * 100;
  const verdict: Margin["verdict"] =
    gross < 0 ? "losing" : foodCostPct > 40 ? "tight" : foodCostPct > 25 ? "ok" : "great";
  return { gross, foodCostPct, marginPct: (gross / p) * 100, verdict };
}

/** ₱1,234.50 — two decimals, because ingredient costs live in centavos. */
export function peso(n: number, decimals = 2): string {
  return "₱" + n.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** What this ingredient's remaining stock is worth. */
export function stockValue(i: Ingredient): number {
  return (Number(i.stock) || 0) * (Number(i.cost) || 0);
}

export function isLow(i: Ingredient): boolean {
  const reorder = Number(i.reorder) || 0;
  return reorder > 0 && (Number(i.stock) || 0) <= reorder;
}

// ---------------------------------------------------------------------------
// Menu engineering
// ---------------------------------------------------------------------------

/**
 * Where a dish sits on the only two axes that matter.
 *
 * Popularity and margin, each split at the average, giving four boxes the
 * restaurant trade has used for decades. The value is not the label — it is
 * that each box implies a *different* action, and the wrong action on the
 * wrong box loses money. Discounting a Plowhorse (already popular, already
 * thin) is the classic way to be busier and poorer.
 */
export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

export const MENU_CLASS: Record<
  MenuClass,
  { label: string; blurb: string; action: string; chip: string }
> = {
  star: {
    label: "Star",
    blurb: "Sells well and earns well.",
    action: "Protect it. Keep it consistent, keep the ingredients in stock, don't discount it.",
    chip: "bg-jade-600 text-cream-50",
  },
  plowhorse: {
    label: "Plowhorse",
    blurb: "Sells well, earns little.",
    action: "Raise the price a little, or find a cheaper way to make it. Never discount it — you'd just be busier and poorer.",
    chip: "bg-gold-400 text-ink-950",
  },
  puzzle: {
    label: "Puzzle",
    blurb: "Earns well, hardly sells.",
    action: "Push it. Better name, better photo, put it in front of people — the money is already in it.",
    chip: "bg-chili-500 text-cream-50",
  },
  dog: {
    label: "Dog",
    blurb: "Doesn't sell, doesn't earn.",
    action: "Reprice it, remake it, or take it off. It's using space on the menu and stock in the fridge.",
    chip: "bg-ink-950/15 text-ink-800/80",
  },
};

/**
 * Split at the average rather than the median.
 *
 * A median guarantees a 50/50 split whatever the numbers look like, which
 * would label half the menu "Dog" even in a shop where everything sells. The
 * average moves with the shop, so a menu where one dish carries the day is
 * described as exactly that.
 */
export function classifyMenu(
  rows: { qty: number; gross: number }[]
): { avgQty: number; avgGross: number } {
  const selling = rows.filter((r) => r.qty > 0);
  const base = selling.length > 0 ? selling : rows;
  if (base.length === 0) return { avgQty: 0, avgGross: 0 };
  return {
    avgQty: base.reduce((s, r) => s + r.qty, 0) / base.length,
    avgGross: base.reduce((s, r) => s + r.gross, 0) / base.length,
  };
}

export function menuClassFor(
  qty: number,
  gross: number,
  avgQty: number,
  avgGross: number
): MenuClass {
  const popular = qty >= avgQty;
  const earns = gross >= avgGross;
  if (popular && earns) return "star";
  if (popular) return "plowhorse";
  if (earns) return "puzzle";
  return "dog";
}
