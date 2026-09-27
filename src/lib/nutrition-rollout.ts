import { isComplete, type DishNutrition } from "./nutrition.ts";

/**
 * Why the calories are not on the menu yet.
 *
 * ── The question ────────────────────────────────────────────────────────
 *
 * "Fill calories from the reference" reported 44 ingredients already had
 * figures, and the customer menu showed no calories anywhere. Nothing was
 * broken. Three separate things all have to be true before a customer sees
 * a number, and the owner was standing in front of the one screen that
 * could not tell them which one was false:
 *
 *   1. EVERY ingredient in a dish's recipe has figures. Not most — every
 *      one, including the ones inside its batches. A dish with one blank
 *      ingredient shows nothing at all, deliberately: a total computed from
 *      nine lines out of ten is not a low estimate, it is a wrong number
 *      with a calorie sign in front of it, and somebody counting theirs
 *      would be misled by it.
 *
 *   2. AT LEAST ONE DISH clears that bar. 44 filled ingredients sounds like
 *      a lot and unlocks nothing if the forty-fifth is the soy sauce that
 *      is in everything.
 *
 *   3. THE MASTER SWITCH IS ON. It defaults to off and lives on the Menu
 *      screen, two tabs from the button that does the filling.
 *
 * Each of those was visible on some screen; none of them was visible on the
 * screen where the work happens. The same shape of bug this project keeps
 * finding — the software knowing something and not saying it.
 *
 * ── The useful part ─────────────────────────────────────────────────────
 *
 * `blockers` is what turns this from a status line into a plan. Filling
 * ingredients in the order they happen to appear on the shelf is eighty
 * lookups with nothing to show until the last one; filling them in the
 * order of how many dishes each one unblocks usually lights up half the
 * menu in five. Nothing here computes a new fact — `loadNutrition` already
 * said which lines each dish was missing. This counts them.
 */

export type DishStatus = {
  mealId: string;
  name: string;
  kcal: number;
  /** Ingredients or batches with no figures yet. Empty means complete. */
  missing: string[];
  /** The owner typed the figures rather than the recipe producing them. */
  manual: boolean;
};

/** An ingredient standing in the way, and how much it is standing in. */
export type Blocker = {
  name: string;
  /** Dishes it alone is blocking. */
  dishes: number;
  /** Dishes it is the ONLY thing blocking — fill it and they go live. */
  unlocks: number;
};

export type Verdict =
  | { kind: "no-dishes" }
  | { kind: "nothing-ready"; blocked: number }
  | { kind: "switch-off"; ready: number; total: number }
  | { kind: "showing"; ready: number; total: number };

export type Rollout = {
  on: boolean;
  ready: DishStatus[];
  /** Missing something, fewest missing first — the closest to done at the top. */
  blocked: DishStatus[];
  /** No recipe at all, so there is nothing to work a figure out from. */
  noRecipe: DishStatus[];
  /** Worst first, by what filling it would unlock. */
  blockers: Blocker[];
  verdict: Verdict;
};

export function rolloutOf(
  meals: { id: string; name: string }[],
  nutrition: Map<string, DishNutrition>,
  on: boolean
): Rollout {
  const ready: DishStatus[] = [];
  const blocked: DishStatus[] = [];
  const noRecipe: DishStatus[] = [];

  for (const m of meals) {
    const n = nutrition.get(m.id);
    const row: DishStatus = {
      mealId: m.id,
      name: m.name,
      kcal: Math.round(n?.per.kcal ?? 0),
      missing: n?.missingNames ?? [],
      manual: n?.manual === true,
    };
    // A dish nobody has written a recipe for is not "missing an ingredient";
    // it is missing a recipe. Counting it as blocked would put it at the top
    // of the list with nothing to go and fill in.
    if (!n || (row.missing.length === 0 && row.kcal <= 0 && !n.manual)) {
      noRecipe.push(row);
    } else if (isComplete(n)) {
      ready.push(row);
    } else {
      blocked.push(row);
    }
  }

  blocked.sort((a, b) => a.missing.length - b.missing.length || a.name.localeCompare(b.name));

  // Counted across the blocked dishes only. An ingredient that appears in
  // twenty dishes that are already complete is not blocking anything.
  const tally = new Map<string, Blocker>();
  for (const d of blocked) {
    // Deduplicated per dish: one ingredient used twice in a recipe is one
    // thing to go and fill in, not two dishes' worth of urgency.
    for (const name of new Set(d.missing)) {
      const at = tally.get(name) ?? { name, dishes: 0, unlocks: 0 };
      at.dishes += 1;
      // The number that actually decides what to do first. A dish missing
      // three things is not unlocked by filling one of them.
      if (new Set(d.missing).size === 1) at.unlocks += 1;
      tally.set(name, at);
    }
  }
  const blockers = [...tally.values()].sort(
    (a, b) => b.unlocks - a.unlocks || b.dishes - a.dishes || a.name.localeCompare(b.name)
  );

  const total = meals.length;
  const verdict: Verdict =
    total === 0
      ? { kind: "no-dishes" }
      : ready.length === 0
        ? { kind: "nothing-ready", blocked: blocked.length }
        : on
          ? { kind: "showing", ready: ready.length, total }
          : { kind: "switch-off", ready: ready.length, total };

  return { on, ready, blocked, noRecipe, blockers, verdict };
}

/**
 * The verdict as a sentence, and what to do about it.
 *
 * Two fields rather than one paragraph because they are read at different
 * speeds: the headline answers "is it on or not" at a glance, and the
 * second line is the instruction. Kept here beside the rule so the wording
 * is covered by the same tests.
 */
export function verdictText(v: Verdict): { headline: string; next: string } {
  switch (v.kind) {
    case "no-dishes":
      return {
        headline: "No dishes on the menu yet.",
        next: "Add a dish and give it a recipe, and its calories work themselves out.",
      };
    case "nothing-ready":
      return {
        headline: "Nothing is showing, because no dish has a complete figure yet.",
        next: `All ${v.blocked} ${v.blocked === 1 ? "dish is" : "dishes are"} still missing at least one ingredient's figures. A dish stays blank until every last one is filled in — a total built from most of a recipe is a wrong number, not a low one.`,
      };
    case "switch-off":
      return {
        headline: `${v.ready} of ${v.total} dishes are ready — but calories are switched OFF for customers.`,
        next: "Turn them on under Menu → Calories on the menu. Until then nobody sees them however many are filled in.",
      };
    case "showing":
      return {
        headline: `Showing on ${v.ready} of ${v.total} dishes.`,
        next: "The rest stay blank rather than showing a total that is too low.",
      };
  }
}
