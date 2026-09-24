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
  /** 'inv' for something off the shelf, 'batch' for another batch. */
  ref_type: string;
  /** An ingredients.id or a batches.id, per `ref_type`. */
  ref_id: string;
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
 * Price every batch, including the ones made out of other batches.
 *
 * Liquid butter is a batch. Marinated ji pai is a batch made WITH the liquid
 * butter. So the cost per unit of ji pai depends on the cost per unit of
 * butter, and the butter has to be priced first.
 *
 * This used to be a single flat pass, correctly, because `batch_ingredients`
 * could only point at ingredients. Migration 0046 changed that, and two
 * things then have to be handled or the screen either shows a wrong number or
 * hangs:
 *
 *   ORDER. A batch must be costed after everything it draws on. Done by
 *   resolving on demand and memoising rather than by sorting the graph first:
 *   the recursion visits exactly what it needs, in the only order that works,
 *   and a batch nothing depends on costs itself.
 *
 *   CYCLES. Butter uses ji pai uses butter. However it got entered — two
 *   people editing, or a rename — it must not hang the page. `visiting` is
 *   the guard: a batch already on the stack stops the descent, contributes
 *   nothing, and says so as a problem rather than as a silent zero.
 *
 * The database refuses the direct case (a batch listing itself) in 0046. This
 * catches the transitive one, which is the only place the whole graph is
 * visible at once.
 */
export function costBatches(
  batches: Batch[],
  batchIngredients: BatchIngredient[],
  ingredients: Ingredient[]
): Map<string, BatchCost> {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const linesFor = new Map<string, BatchIngredient[]>();
  for (const bi of batchIngredients) {
    const list = linesFor.get(bi.batch_id) ?? [];
    list.push(bi);
    linesFor.set(bi.batch_id, list);
  }

  const out = new Map<string, BatchCost>();
  // On the stack right now. Not the same as "already done" — a diamond
  // (two batches both using the butter) is perfectly fine and must not be
  // mistaken for a loop.
  const visiting = new Set<string>();

  function resolve(id: string): BatchCost | null {
    const done = out.get(id);
    if (done) return done;
    const batch = batchById.get(id);
    if (!batch) return null;
    if (visiting.has(id)) return null; // a cycle; the caller reports it
    visiting.add(id);

    const raw = linesFor.get(id) ?? [];
    const problems: string[] = [];

    const lines: CostLine[] = raw.map((bi) => {
      const qty = Number(bi.qty) || 0;

      if (bi.ref_type === "batch") {
        const sub = batchById.get(bi.ref_id);
        if (!sub) {
          problems.push("A line in this batch points at a deleted batch.");
          return {
            label: "Deleted batch",
            kind: "batch" as const,
            qty,
            unit: "",
            unitCost: 0,
            cost: 0,
            problem: "Batch no longer exists",
          };
        }
        const cost = resolve(bi.ref_id);
        if (cost === null) {
          // Only reachable through a cycle: `sub` exists, so `resolve` can
          // only decline because this batch is already on the stack.
          problems.push(
            `"${sub.name}" and this batch are made of each other, so neither can be priced.`
          );
          return {
            label: sub.name,
            kind: "batch" as const,
            qty,
            unit: sub.yield_unit,
            unitCost: 0,
            cost: 0,
            problem: "Circular recipe",
          };
        }
        if (cost.unknown) {
          problems.push(`"${sub.name}" has no price of its own yet.`);
        }
        return {
          label: sub.name,
          kind: "batch" as const,
          qty,
          unit: sub.yield_unit,
          unitCost: cost.perUnit,
          cost: qty * cost.perUnit,
          problem: cost.perUnit > 0 ? null : "No price yet",
        };
      }

      const ing = byId.get(bi.ref_id);
      if (!ing) {
        problems.push("A line in this batch points at a deleted ingredient.");
        return {
          label: "Deleted ingredient",
          kind: "ingredient" as const,
          qty,
          unit: "",
          unitCost: 0,
          cost: 0,
          problem: "Ingredient no longer exists",
        };
      }
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
    let result: BatchCost;
    if (manual !== null && manual !== undefined && Number(manual) > 0) {
      result = {
        batch,
        total: Number(manual) * (Number(batch.yield_qty) || 0),
        perUnit: Number(manual),
        lines,
        unknown: false,
        problems,
      };
    } else {
      const perUnit = safeDiv(total, Number(batch.yield_qty) || 0);
      if (perUnit === null) {
        problems.push(
          raw.length === 0
            ? "No recipe entered for this batch."
            : "Yield is zero, so a per-gram cost can't be worked out."
        );
      }
      result = {
        batch,
        total,
        perUnit: perUnit ?? 0,
        lines,
        unknown: perUnit === null || raw.length === 0,
        problems,
      };
    }

    visiting.delete(id);
    out.set(id, result);
    return result;
  }

  for (const batch of batches) resolve(batch.id);
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

/**
 * Money is written in `@/lib/peso`, not here.
 *
 * `peso` and `pesoRound` used to live in this file, and every screen that
 * needed to render an amount imported them from it. That meant the checkout
 * and the floating cart — which want a peso sign and nothing else — reached
 * for seven hundred lines of margin arithmetic to get one. It also kept this
 * file honest in a way worth keeping: it has no imports at all, which is what
 * lets the tests load it straight through Node.
 */

/** What this ingredient's remaining stock is worth. */
export function stockValue(i: Ingredient): number {
  return (Number(i.stock) || 0) * (Number(i.cost) || 0);
}

/**
 * What a batch's remaining stock is worth.
 *
 * `batch_stock` is held in YIELD UNITS, not in whole batches — producing one
 * batch adds `yield_qty` to it, and a sale takes off whatever the recipe asked
 * for. `perUnit` is ₱ per yield unit, the same figure a recipe multiplies by.
 * So the two simply multiply, exactly as they do for an ingredient.
 *
 * This is not double counting. Making a batch takes its ingredients off the
 * shelf as it goes: the peanuts are gone from `ingredients.stock` by the time
 * the sauce exists in `batches.batch_stock`. Counting only the ingredients —
 * which is what the shelf total did until now — throws away the value of
 * everything the shop has already prepped, and for a stall that preps sauces
 * and marinades in advance that is most of a busy week's work.
 */
export function batchStockValue(b: { stock: number; perUnit: number }): number {
  return (Number(b.stock) || 0) * (Number(b.perUnit) || 0);
}

/** One thing sitting on a shelf, priced or not. */
export type ShelfLine = { value: number; priced: boolean };

/**
 * Everything on the shelves, and how much of it the shop cannot price.
 *
 * The count comes back with the total on purpose. A shelf total assembled
 * from things the system has no price for is not wrong by a little — an
 * unpriced item contributes exactly zero — and a figure that quietly reads
 * low is worse than one that says it is low, because only the second one gets
 * corrected. The screen prints both.
 */
export function shelfTotal(lines: ShelfLine[]): { total: number; unpriced: number } {
  let total = 0;
  let unpriced = 0;
  for (const l of lines) {
    total += Number(l.value) || 0;
    if (!l.priced) unpriced += 1;
  }
  return { total, unpriced };
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
    chip: "bg-brand-600 text-cream-50",
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

// ---------------------------------------------------------------------------
// How many can we actually make?
// ---------------------------------------------------------------------------

/**
 * Servings the shelf can still produce.
 *
 * Worked out from live stock every time it is asked, and deliberately NOT
 * written back to `meals.is_available`. That column is the owner's own switch
 * — "we've 86'd it today" — and a background process overwriting it would
 * destroy an intent the system can't tell apart from its own guess, then need
 * undoing on every restock. Availability from stock is derived; availability
 * by decision is stored. Two different facts, two different homes.
 *
 * A dish with no recipe returns Infinity rather than zero. We don't know what
 * it takes, so we can't say it can't be made — and refusing to sell something
 * because nobody has entered its recipe yet would be the software inventing a
 * shortage.
 */
export function makeableServings(
  mealId: string,
  mealIngredients: MealIngredient[],
  mealComponents: MealComponent[],
  ingredients: Ingredient[],
  batches: Batch[],
  seen: Set<string> = new Set()
): number {
  if (seen.has(mealId)) return Infinity; // a combo containing itself
  const next = new Set([...seen, mealId]);

  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const batchById = new Map(batches.map((b) => [b.id, b]));

  const lines = mealIngredients.filter((mi) => mi.meal_id === mealId);
  const parts = mealComponents.filter((mc) => mc.meal_id === mealId);
  if (lines.length === 0 && parts.length === 0) return Infinity;

  let limit = Infinity;

  for (const line of lines) {
    const need = Number(line.qty) || 0;
    if (need <= 0) continue;
    const have =
      line.ref_type === "batch"
        ? Number(batchById.get(line.ref_id)?.batch_stock ?? 0)
        : Number(ingById.get(line.ref_id)?.stock ?? 0);
    // A line pointing at something deleted is a broken recipe, not an empty
    // shelf. The costing screens already name it; blocking sales over it
    // would turn a data problem into lost trade.
    const exists =
      line.ref_type === "batch"
        ? batchById.has(line.ref_id)
        : ingById.has(line.ref_id);
    if (!exists) continue;
    limit = Math.min(limit, Math.floor(have / need));
  }

  for (const part of parts) {
    const qty = Number(part.qty) || 0;
    if (qty <= 0) continue;
    const child = makeableServings(
      part.component_meal_id,
      mealIngredients,
      mealComponents,
      ingredients,
      batches,
      next
    );
    limit = Math.min(limit, Math.floor(child / qty));
  }

  return Math.max(0, limit);
}

/** Runs low before it runs out, so the shop gets a warning rather than a wall. */
export const LOW_STOCK_SERVINGS = 3;

/**
 * What is actually holding a dish back.
 *
 * `makeableServings` answers "how many" and stops there, which is the wrong
 * place to stop at a counter. A cashier looking at a NO STOCK badge has a
 * customer in front of them and one question: *what* are we out of, and can
 * somebody go and make it. "No stock" answers neither, so the badge gets
 * ignored and the shop sells something it cannot cook.
 *
 * Returns every line of the recipe against what is on hand, tightest first,
 * so the thing to go and fix is at the top. Combos are flattened into their
 * parts: the cashier does not care that the shortage is two dishes down, only
 * that the marinade has run out.
 *
 * Deliberately NOT recursive into a batch's own recipe. A batch that has run
 * out has run out — whether there are ingredients to make more of it is the
 * kitchen's next question, not the counter's, and answering it here would put
 * "we could make more sauce" in front of somebody who needs to say yes or no
 * to a customer right now.
 */
export type Shortfall = {
  label: string;
  kind: "ingredient" | "batch";
  unit: string;
  /** How much one serving of the dish needs. */
  need: number;
  /** How much is on the shelf. */
  have: number;
  /** Servings this line alone allows. */
  allows: number;
};

export function limitingFor(
  mealId: string,
  mealIngredients: MealIngredient[],
  mealComponents: MealComponent[],
  ingredients: Ingredient[],
  batches: Batch[],
  seen: Set<string> = new Set()
): Shortfall[] {
  if (seen.has(mealId)) return [];
  const next = new Set([...seen, mealId]);

  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const batchById = new Map(batches.map((b) => [b.id, b]));

  const out: Shortfall[] = [];

  for (const line of mealIngredients.filter((mi) => mi.meal_id === mealId)) {
    const need = Number(line.qty) || 0;
    if (need <= 0) continue;
    const isBatch = line.ref_type === "batch";
    const thing = isBatch ? batchById.get(line.ref_id) : ingById.get(line.ref_id);
    // A line pointing at something deleted is a broken recipe, not an empty
    // shelf — the costing screens name it, and it must not read here as a
    // shortage of a thing with no name.
    if (!thing) continue;
    const have = isBatch
      ? Number((thing as Batch).batch_stock) || 0
      : Number((thing as Ingredient).stock) || 0;
    out.push({
      label: thing.name,
      kind: isBatch ? "batch" : "ingredient",
      unit: isBatch ? (thing as Batch).yield_unit : (thing as Ingredient).unit,
      need,
      have,
      allows: Math.floor(have / need),
    });
  }

  for (const part of mealComponents.filter((mc) => mc.meal_id === mealId)) {
    const qty = Number(part.qty) || 0;
    if (qty <= 0) continue;
    // A combo needs `qty` of the child per serving, so each of the child's
    // own limits is divided down before it is compared with the rest.
    for (const inner of limitingFor(
      part.component_meal_id,
      mealIngredients,
      mealComponents,
      ingredients,
      batches,
      next
    )) {
      out.push({
        ...inner,
        need: inner.need * qty,
        allows: Math.floor(inner.have / (inner.need * qty)),
      });
    }
  }

  return out.sort((a, b) => a.allows - b.allows);
}
