/**
 * Add-ons: extra rice, and a drink with that.
 *
 * ── Variant or modifier? ─────────────────────────────────────────────────
 *
 * A VARIANT is which dish this is. Exactly one, its own recipe, its own
 * photograph, its own stock — `menu-products.ts` handles those.
 *
 * A MODIFIER is what goes on top. Zero or more, each adding its own money and
 * drawing its own stock, with the dish underneath unchanged.
 *
 * The distinction is the whole reason this file exists. Treating "with extra
 * rice" as a variant turns two flavours × with-rice × extra-rice × six drinks
 * into 48 rows in `meals` — 48 recipes to keep in step and a best-seller list
 * split 48 ways. Treating it as a modifier is one dish, two variants, three
 * reusable groups.
 *
 * ── An option is a dish ──────────────────────────────────────────────────
 *
 * Every option points at a real `meals` row — hidden from the menu, with a
 * recipe and a price. That is what makes `orders.cogs` stay true: the
 * database has walked order_lines → components → ingredients since 0016, so
 * an extra that names a dish is costed and deducted by machinery that already
 * existed. An option carrying a bare price and no dish would be revenue with
 * no cost against it, overstating the margin on every combo ever sold.
 *
 * So an option whose dish has been deleted is not offered. It is not a
 * cheaper version of itself; it is a sale the shop cannot cost.
 */

export type ModifierOption = {
  id: string;
  label: string;
  /** The dish it adds. Null once that dish has been deleted. */
  mealId: string | null;
  /** Resolved already: the override if there is one, else the dish's price. */
  price: number;
  /** Servings the shelf can still make. Null when there is no recipe to go on. */
  makeable?: number | null;
  /** The owner's own "we've run out of this today" switch, on the dish. */
  available: boolean;
  sort: number;
};

export type ModifierGroup = {
  id: string;
  name: string;
  helper: string | null;
  /** 1 or more means the customer cannot get past it without answering. */
  min: number;
  /** 1 is a radio; more is a checklist that stops at that many. */
  max: number;
  sort: number;
  options: ModifierOption[];
};

/** What goes in the cart, and what the receipt is written from. */
export type ChosenExtra = {
  optionId: string;
  groupId: string;
  label: string;
  price: number;
  mealId: string | null;
};

/** groupId → the option ids chosen in it. */
export type ModifierChoice = Record<string, string[]>;

/* ------------------------------------------------------------------ */
/* What can actually be picked                                         */
/* ------------------------------------------------------------------ */

/**
 * The price to show and charge.
 *
 * Null override means "whatever that dish costs", which is the answer that
 * stays right when the price of rice goes up. Zero is a real answer — a drink
 * that comes free with the combo — so it must not be confused with "not set",
 * which is why the column is nullable rather than defaulting to 0.
 */
export function optionPrice(
  override: number | null | undefined,
  mealPrice: number | null | undefined
): number {
  const chosen = override ?? mealPrice ?? 0;
  return Number.isFinite(Number(chosen)) ? Number(chosen) : 0;
}

/** Run out, by either of the two routes it can. */
export function optionSoldOut(o: ModifierOption): boolean {
  if (!o.available) return true;
  return o.makeable !== null && o.makeable !== undefined && o.makeable <= 0;
}

/**
 * An option with no dish behind it is dropped rather than greyed.
 *
 * Greyed would be a promise: come back and it'll be here. It won't — the dish
 * it named is gone, and until the owner points it at another one there is
 * nothing to cook, nothing to cost and nothing to take off the shelf.
 */
export const offerable = (o: ModifierOption) => o.mealId !== null;

const byOrder = <T extends { sort: number; label?: string; name?: string }>(
  a: T,
  b: T
) => a.sort - b.sort || (a.label ?? a.name ?? "").localeCompare(b.label ?? b.name ?? "");

/**
 * The groups to show on a dish: the ones attached to it, plus the ones
 * attached to the menu card it sits on.
 *
 * Both, and deduped, because they answer different questions. "Choose your
 * drink" belongs to the card — all four Solo Ji Pai take the same six drinks,
 * and attaching it four times is three chances to forget the seventh. "Extra
 * noodles" belongs to the one dish that has noodles in it.
 *
 * An empty group is dropped here rather than rendered as a heading with
 * nothing under it, which is what a customer reads as a broken page.
 */
export function groupsFor(
  mealId: string,
  productId: string | null,
  byMeal: Map<string, ModifierGroup[]>,
  byProduct: Map<string, ModifierGroup[]>
): ModifierGroup[] {
  const seen = new Set<string>();
  const out: ModifierGroup[] = [];

  for (const g of [
    ...(productId ? (byProduct.get(productId) ?? []) : []),
    ...(byMeal.get(mealId) ?? []),
  ]) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    const options = g.options.filter(offerable).sort(byOrder);
    if (options.length > 0) out.push({ ...g, options });
  }

  return out.sort(byOrder);
}

/* ------------------------------------------------------------------ */
/* Choosing                                                            */
/* ------------------------------------------------------------------ */

/**
 * What is already ticked when the dish opens.
 *
 * A required pick-one is answered for them, with the first option that is
 * actually in stock. Leaving it blank means the customer taps Add, is told
 * "choose your drink", and has to find the thing they were never shown was
 * compulsory. Answering it puts the commonest choice in front of them and
 * leaves changing it one tap away.
 *
 * Nothing optional is ever pre-ticked. A pre-ticked extra is money the
 * customer did not ask to spend.
 */
export function openingChoice(groups: ModifierGroup[]): ModifierChoice {
  const out: ModifierChoice = {};
  for (const g of groups) {
    if (g.min < 1) continue;
    const first = g.options.find((o) => !optionSoldOut(o)) ?? g.options[0];
    if (first) out[g.id] = [first.id];
  }
  return out;
}

const chosenIn = (choice: ModifierChoice, groupId: string) =>
  choice[groupId] ?? [];

/**
 * The choice, made to fit the groups actually on offer.
 *
 * Needed because the groups change under the customer's feet: tapping "22oz"
 * swaps the dish, and the new dish may carry different add-ons. Without this
 * the picker holds an id belonging to a group that is no longer on screen —
 * which `extrasOf` correctly refuses to charge for, while `choiceProblem`
 * counts it as an answer. The result is a required drink that is neither
 * chosen nor asked for, and a customer who gets a combo with no drink in it.
 *
 * Three things, in this order: forget ids the group no longer offers, trim
 * anything over the limit, and answer a compulsory question that is now
 * unanswered. Idempotent, so it is safe to run on every render.
 */
export function reconcile(
  groups: ModifierGroup[],
  choice: ModifierChoice
): ModifierChoice {
  const out: ModifierChoice = {};
  for (const g of groups) {
    const offered = new Set(g.options.map((o) => o.id));
    let picked = chosenIn(choice, g.id).filter((id) => offered.has(id));
    if (picked.length > g.max) picked = picked.slice(0, g.max);
    if (picked.length < g.min) {
      const fill = g.options.find(
        (o) => !optionSoldOut(o) && !picked.includes(o.id)
      );
      if (fill) picked = [...picked, fill.id].slice(0, g.max);
    }
    out[g.id] = picked;
  }
  return out;
}

/**
 * Tapping an option.
 *
 * Pick-one behaves like a radio: the tap replaces. It only clears when the
 * group is optional — un-ticking the only answer to a compulsory question
 * puts the customer back in the state the Add button refuses, for no reason
 * they can see.
 *
 * A checklist that is full does not silently drop somebody's earlier choice
 * to make room. The chip is disabled and says why.
 */
export function toggleOption(
  group: ModifierGroup,
  choice: ModifierChoice,
  optionId: string
): ModifierChoice {
  const current = chosenIn(choice, group.id);
  const on = current.includes(optionId);

  if (group.max === 1) {
    if (on && group.min < 1) return { ...choice, [group.id]: [] };
    return { ...choice, [group.id]: [optionId] };
  }

  if (on) {
    return { ...choice, [group.id]: current.filter((id) => id !== optionId) };
  }
  if (current.length >= group.max) return choice;
  return { ...choice, [group.id]: [...current, optionId] };
}

/** Would another tick fit? What the checklist's chips are disabled by. */
export function isFull(group: ModifierGroup, choice: ModifierChoice): boolean {
  return group.max > 1 && chosenIn(choice, group.id).length >= group.max;
}

/**
 * Why the Add button can't be pressed yet, in the words the customer needs.
 *
 * Names the group, because a dish can carry three of them and "please make a
 * selection" leaves the customer scrolling to find which one. Sold-out
 * options are ignored on purpose: a required group whose every option has run
 * out must not lock the dish — it means today there is no drink, not that the
 * rice meal is unbuyable.
 */
export function choiceProblem(
  groups: ModifierGroup[],
  choice: ModifierChoice
): string | null {
  for (const g of groups) {
    if (g.min < 1) continue;
    if (g.options.every(optionSoldOut)) continue;
    const n = chosenIn(choice, g.id).length;
    if (n < g.min) {
      return g.min === 1
        ? `Choose your ${g.name.toLowerCase().replace(/^choose (your |a |an )?/, "")} first.`
        : `Pick ${g.min} from "${g.name}".`;
    }
  }
  return null;
}

/**
 * The choice, flattened into what the cart carries.
 *
 * Read from the groups rather than from the choice map, so the order on the
 * receipt is the order on the screen — and so an id left behind by a group
 * that has since been switched off simply doesn't come through.
 */
export function extrasOf(
  groups: ModifierGroup[],
  choice: ModifierChoice
): ChosenExtra[] {
  const out: ChosenExtra[] = [];
  for (const g of groups) {
    const picked = chosenIn(choice, g.id);
    for (const o of g.options) {
      if (!picked.includes(o.id)) continue;
      if (optionSoldOut(o)) continue;
      out.push({
        optionId: o.id,
        groupId: g.id,
        label: o.label,
        price: o.price,
        mealId: o.mealId,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Money, and telling one basket line from another                     */
/* ------------------------------------------------------------------ */

export const extrasTotal = (extras: ChosenExtra[]) =>
  extras.reduce((sum, e) => sum + (Number(e.price) || 0), 0);

/** What one of this line costs, add-ons included. */
export const unitPrice = (base: number, extras: ChosenExtra[]) =>
  (Number(base) || 0) + extrasTotal(extras);

/**
 * What makes two basket lines the same line.
 *
 * The cart merged on `mealId` alone, which was right until today and is
 * exactly wrong now: a rice meal with extra rice and a rice meal without are
 * the same dish and must not become quantity 2 of one of them. Sorted, so
 * ticking Coke then rice and ticking rice then Coke are one line rather than
 * two identical-looking ones the customer has to add up themselves.
 */
export function cartKey(mealId: string, extras: ChosenExtra[]): string {
  const ids = extras.map((e) => e.optionId).sort();
  return ids.length > 0 ? `${mealId}|${ids.join("+")}` : mealId;
}

/** "Extra rice, Coke" — the second line under the dish's name. */
export const describeExtras = (extras: ChosenExtra[]) =>
  extras.map((e) => e.label).join(", ");

/* ------------------------------------------------------------------ */
/* What the server does with what the browser sent                     */
/* ------------------------------------------------------------------ */

export type Resolved = {
  extras: ChosenExtra[];
  /** Why this line can't be sold as asked, in words the customer can act on. */
  problem: string | null;
};

/**
 * The option ids a browser sent, turned into priced extras — or refused.
 *
 * The browser sends ids and nothing else. Every label and every peso comes
 * from the groups read out of the database here, for the same reason
 * `placeOrder` re-reads the price of the dish: a cart lives in localStorage,
 * and anything it carries is a suggestion.
 *
 * It refuses rather than repairs. Quietly dropping a sold-out drink gives the
 * customer a combo with no drink and a total they did not agree to; quietly
 * adding the missing one charges for something nobody picked. Both are worse
 * than being told to open the dish again, which costs one tap.
 *
 * `dish` names the dish in the message, because a cart holds several and
 * "one of your add-ons" sends the customer hunting.
 */
export function resolveChoice(
  groups: ModifierGroup[],
  optionIds: string[],
  dish: string
): Resolved {
  const offered = new Map<string, { group: ModifierGroup; option: ModifierOption }>();
  for (const g of groups) {
    for (const o of g.options) offered.set(o.id, { group: g, option: o });
  }

  const unknown = optionIds.filter((id) => !offered.has(id));
  if (unknown.length > 0) {
    return {
      extras: [],
      problem: `Something you added to ${dish} isn't offered any more. Open it again and re-pick.`,
    };
  }

  const soldOut = optionIds
    .map((id) => offered.get(id)!.option)
    .filter(optionSoldOut);
  if (soldOut.length > 0) {
    return {
      extras: [],
      problem: `${soldOut.map((o) => o.label).join(" and ")} just sold out. Take it off ${dish} and the rest can go through.`,
    };
  }

  const choice: ModifierChoice = {};
  for (const id of optionIds) {
    const gid = offered.get(id)!.group.id;
    choice[gid] = [...(choice[gid] ?? []), id];
  }

  for (const g of groups) {
    const n = chosenIn(choice, g.id).length;
    if (n > g.max) {
      return {
        extras: [],
        problem: `You can only pick ${g.max} from "${g.name}" on ${dish}.`,
      };
    }
    if (n < g.min && !g.options.every(optionSoldOut)) {
      return { extras: [], problem: choiceProblem([g], choice) };
    }
  }

  return { extras: extrasOf(groups, choice), problem: null };
}
