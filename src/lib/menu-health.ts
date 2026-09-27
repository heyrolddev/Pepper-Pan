/**
 * Dishes the shop can sell but cannot cost.
 *
 * A dish with no recipe is not a gap in a form. It is a sale that takes
 * nothing off the shelf, books ₱0 of cost, and reports as 100% margin —
 * silently, on screens that look entirely normal. Measured against this
 * schema: `order_requirements` returns no rows, `apply_order_stock` returns
 * 0.00, and the order sits there looking like the best sale the shop ever
 * made. Watch the shelf not move and the obvious conclusion is that stock
 * deduction is broken.
 *
 * Migration 0060 makes the SALE say it, at the moment it happens. This says
 * it before a sale happens at all, which is the half that can still be acted
 * on: the log tells you an order was wrong, this tells you which dish to fix.
 *
 * ── Why a combo can be blind and still be fine ───────────────────────────
 *
 * A combo often carries no `meal_ingredients` of its own — its parts do. So
 * "has no rows in meal_ingredients" is the wrong test and would accuse every
 * properly built combo on the menu. The real question is whether anything in
 * the dish's whole tree carries ingredients, which is the same walk
 * `order_requirements` does in SQL. Kept to the same depth limit for the same
 * reason: a recipe that refers to itself must not hang the page.
 */

export const MAX_DEPTH = 5;

export type MenuDish = { id: string; name: string; isPublic: boolean };
export type Component = { mealId: string; componentMealId: string };

/**
 * Which dishes yield no ingredients at all, anywhere in their tree.
 *
 * `withIngredients` is the set of meal ids that have at least one row in
 * `meal_ingredients` — passed in rather than looked up so this stays pure and
 * testable, and so the caller can fetch it in one query instead of one per
 * dish.
 */
export function dishesWithoutRecipe(
  dishes: MenuDish[],
  withIngredients: Set<string>,
  components: Component[]
): MenuDish[] {
  const childrenOf = new Map<string, string[]>();
  for (const c of components) {
    const list = childrenOf.get(c.mealId);
    if (list) list.push(c.componentMealId);
    else childrenOf.set(c.mealId, [c.componentMealId]);
  }

  const yields = (id: string, depth: number, seen: Set<string>): boolean => {
    if (withIngredients.has(id)) return true;
    // A cycle, or a tree deeper than anything real. Either way the answer is
    // "nothing found", which is the safe direction: it flags a dish for a
    // human to look at rather than quietly passing it.
    if (depth >= MAX_DEPTH || seen.has(id)) return false;
    seen.add(id);
    return (childrenOf.get(id) ?? []).some((child) => yields(child, depth + 1, seen));
  };

  return dishes.filter((d) => !yields(d.id, 0, new Set()));
}

/** The sentence a screen puts in front of the owner. */
export function blindDishNote(dishes: MenuDish[]): string {
  const live = dishes.filter((d) => d.isPublic).length;
  const one = dishes.length === 1;
  return (
    `${dishes.length} dish${one ? "" : "es"} ${one ? "has" : "have"} no recipe` +
    (live > 0 ? `, and ${live === dishes.length ? (one ? "it is" : "they are") : `${live} of them are`} on the menu now` : "") +
    `. Every sale of ${one ? "it" : "them"} moves no stock and books ₱0 of cost, ` +
    `so it reads as pure profit.`
  );
}
