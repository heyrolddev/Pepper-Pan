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

/**
 * One size of an add-on that comes in sizes.
 *
 * A variant IS a dish — its own recipe, its own cost, its own stock, its own
 * price — which is the whole reason this feature costs almost no new code.
 * The customer picks a variant and the order records that dish, exactly as it
 * records a plain add-on, so costing and stock movement are untouched.
 *
 * Read from the product's variants rather than re-entered on the option: a
 * drink sold both on the menu and as a combo add-on has its sizes written
 * down in one place, so the day a third size is added the two cannot
 * disagree.
 */
export type OptionVariant = {
  /** The dish this size is. */
  mealId: string;
  /** "Large", "22oz" — what the size chip says. */
  label: string;
  /** Already resolved through the three-step rule. See `variantPrice`. */
  price: number;
  /** Servings the shelf can still make. Null when there is no recipe. */
  makeable?: number | null;
  available: boolean;
  sort: number;
};

export type ModifierOption = {
  id: string;
  label: string;
  /**
   * The dish it adds. Null once that dish has been deleted — and null for a
   * sized option, which adds whichever variant was picked instead.
   */
  mealId: string | null;
  /**
   * The sizes, when this option comes in sizes. Empty for a plain add-on.
   *
   * An option has either a dish or variants, never both: the database
   * constraint in 0061 says so, and `offerable` below refuses anything with
   * neither rather than offering a sale the shop cannot cost.
   */
  variants?: OptionVariant[];
  /** Resolved already: the override if there is one, else the dish's price. */
  price: number;
  /** Servings the shelf can still make. Null when there is no recipe to go on. */
  makeable?: number | null;
  /** The owner's own "we've run out of this today" switch, on the dish. */
  available: boolean;
  /**
   * How many of this one may be taken. 1 is a tick; more is a stepper.
   *
   * Not the same question as the group's `max`, and keeping them apart is the
   * point: `max` counts DIFFERENT answers ("up to 2 sauces"), this counts
   * copies of ONE ("up to 3 extra rice"). A pick-one group can still let the
   * customer take three of what they picked.
   */
  maxQty: number;
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
  /** Per one of it. The line multiplies. */
  price: number;
  qty: number;
  mealId: string | null;
  /**
   * The size that was chosen, for an add-on that comes in sizes.
   *
   * The same value as `mealId` for a sized extra, and absent for a plain one.
   * Carried separately rather than inferred, because the cart is what the
   * browser sends back and the server has to be told WHICH QUESTION this
   * answers — "the dish this adds" and "the size you picked" are the same
   * string here only by luck of the model, and code that relies on that is
   * code that breaks the day the model gains a second axis.
   */
  variantMealId?: string;
};

/**
 * One answer, how many of it, and — for a sized option — which size.
 *
 * `variantMealId` is the DISH the customer picked, not an index or a label.
 * A dish id is the thing the order records, the thing stock moves against and
 * the thing the server can re-verify; a label would have to be matched back
 * to a dish at write time, which is a lookup that can fail silently the day
 * somebody renames "Large" to "22oz".
 */
export type Picked = { id: string; qty: number; variantMealId?: string };

/**
 * groupId → what was picked in it, in the order it was picked.
 *
 * A list of `{id, qty}` rather than a list of ids plus a lookup of counts
 * beside it. Two structures would be two things to keep in step, and the one
 * that drifts is always the quantity — an id removed from the first list
 * leaves its count behind in the second, and the next thing ticked inherits
 * somebody else's "×3".
 */
export type ModifierChoice = Record<string, Picked[]>;

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

/**
 * What one size costs the customer. Three steps, in this order.
 *
 *   1. A per-variant override. "Large is ₱15 on this combo."
 *   2. The option's own override, which covers every size. "All drinks free."
 *   3. The variant dish's own price, which stays right when prices move.
 *
 * The order matters and the middle step is the reason this function exists.
 * One override for a whole sized option cannot say what a combo actually
 * offers — "regular free, large ₱15" — because setting it to 0 makes the
 * large free too, and leaving it unset charges full price for the regular.
 *
 * Zero is a real answer at every step, which is why "not set" has to be null
 * rather than 0 in both columns. A `??` chain, never `||`.
 */
export function variantPrice(
  perVariant: number | null | undefined,
  optionOverride: number | null | undefined,
  mealPrice: number | null | undefined
): number {
  const chosen = perVariant ?? optionOverride ?? mealPrice ?? 0;
  const n = Number(chosen);
  return Number.isFinite(n) ? n : 0;
}

/** The sizes worth offering: the ones that are not sold out. */
export const liveVariants = (o: ModifierOption): OptionVariant[] =>
  (o.variants ?? []).filter((v) => !variantSoldOut(v));

/** Run out, by either of the two routes a dish can. */
export function variantSoldOut(v: OptionVariant): boolean {
  if (!v.available) return true;
  return v.makeable !== null && v.makeable !== undefined && v.makeable <= 0;
}

/** Does this option ask a second question — which size? */
export const isSized = (o: ModifierOption): boolean => (o.variants ?? []).length > 0;

/**
 * The size that should be selected when a sized option is first picked.
 *
 * The cheapest one that is actually in stock, not the first in the list. A
 * combo's drink is normally included at the regular size and charged for at
 * the large, so defaulting to the cheapest is the one that never adds money
 * the customer did not ask to spend — the same rule `openingChoice` follows
 * for optional extras.
 */
export function defaultVariant(o: ModifierOption): OptionVariant | null {
  const live = liveVariants(o);
  const pool = live.length > 0 ? live : (o.variants ?? []);
  if (pool.length === 0) return null;
  return pool.reduce((best, v) => (v.price < best.price ? v : best), pool[0]);
}

/** Whole, at least one, and no more than this option allows. */
export const clampQty = (qty: number, max: number) =>
  Math.max(1, Math.min(Math.max(1, Math.floor(max || 1)), Math.floor(qty) || 1));

/**
 * Run out, by either of the two routes it can.
 *
 * A sized option is sold out only when EVERY size is. One size running out
 * must not take the drink off the menu — the shop still has the large, and
 * greying the whole chip would lose a sale it can make.
 */
export function optionSoldOut(o: ModifierOption): boolean {
  if (isSized(o)) return (o.variants ?? []).every(variantSoldOut);
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
export const offerable = (o: ModifierOption) =>
  o.mealId !== null || (o.variants ?? []).length > 0;

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

  // The same comparison the admin's arrows make. One rule, in one place, so
  // moving a group in HQ moves it here too — see `inGroupOrder`.
  return inGroupOrder(out);
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
    if (!first) continue;
    // A sized option needs its size answered too, or a required group opens
    // already invalid and the customer is told to "pick a size" for something
    // they have not touched.
    const size = defaultVariant(first)?.mealId;
    out[g.id] = [size ? { id: first.id, qty: 1, variantMealId: size } : { id: first.id, qty: 1 }];
  }
  return out;
}

const chosenIn = (choice: ModifierChoice, groupId: string): Picked[] =>
  choice[groupId] ?? [];

/** How many of this option are on the order. 0 when it isn't picked at all. */
export function qtyOf(
  choice: ModifierChoice,
  groupId: string,
  optionId: string
): number {
  return chosenIn(choice, groupId).find((p) => p.id === optionId)?.qty ?? 0;
}

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
    const offered = new Map(g.options.map((o) => [o.id, o]));
    let picked = chosenIn(choice, g.id)
      .filter((p) => offered.has(p.id))
      // A quantity above what the option now allows is trimmed rather than
      // dropped: the owner lowered the limit, the customer still wants some.
      .map((p) => ({ id: p.id, qty: clampQty(p.qty, offered.get(p.id)!.maxQty) }));
    if (picked.length > g.max) picked = picked.slice(0, g.max);
    if (picked.length < g.min) {
      const fill = g.options.find(
        (o) => !optionSoldOut(o) && !picked.some((p) => p.id === o.id)
      );
      if (fill) picked = [...picked, { id: fill.id, qty: 1 }].slice(0, g.max);
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
  const on = current.some((p) => p.id === optionId);

  /* Ticking a sized option answers its size as well.

     Without this a freshly ticked drink has no size, so the Add button is
     blocked on a question the customer was never asked — and on the server
     it reads as a missing size rather than as a missing tick. The cheapest
     one in stock, for the reason `defaultVariant` gives: it never adds money
     nobody asked to spend. */
  const option = group.options.find((o) => o.id === optionId);
  /* The key is absent, not undefined, for a plain add-on.

     A pick lives in localStorage and is compared by shape. An explicit
     `variantMealId: undefined` on every ordinary extra would be a key that
     serialises away, comes back missing, and makes a restored cart unequal to
     the one that was saved. */
  const fresh = (qty: number): Picked => {
    const size = option ? defaultVariant(option)?.mealId : undefined;
    return size ? { id: optionId, qty, variantMealId: size } : { id: optionId, qty };
  };

  if (group.max === 1) {
    if (on && group.min < 1) return { ...choice, [group.id]: [] };
    // Re-tapping the one already chosen keeps whatever quantity it had —
    // resetting a customer's "×3" for a tap that changed nothing is the kind
    // of small theft nobody reports and everybody notices. Its size is kept
    // for exactly the same reason.
    if (on) return choice;
    return { ...choice, [group.id]: [fresh(1)] };
  }

  if (on) {
    return { ...choice, [group.id]: current.filter((p) => p.id !== optionId) };
  }
  if (current.length >= group.max) return choice;
  return { ...choice, [group.id]: [...current, fresh(1)] };
}

/**
 * "Make it two."
 *
 * Going below one takes the option off rather than sitting at zero — except
 * where the group demands an answer and this is the only one, which is the
 * same rule `toggleOption` follows: a compulsory question must not be left
 * unanswered by a control the customer thinks is just a minus.
 */
/**
 * Change which size a picked option is.
 *
 * Only touches an option that is already chosen. Picking a size for something
 * unticked would be a tick the customer did not make — and on a pick-one
 * group it would silently replace their drink with a different one.
 */
export function setVariant(
  group: ModifierGroup,
  choice: ModifierChoice,
  optionId: string,
  variantMealId: string
): ModifierChoice {
  const option = group.options.find((o) => o.id === optionId);
  if (!option || !isSized(option)) return choice;
  const exists = (option.variants ?? []).some((v) => v.mealId === variantMealId);
  if (!exists) return choice;

  const current = chosenIn(choice, group.id);
  if (!current.some((p) => p.id === optionId)) return choice;

  return {
    ...choice,
    [group.id]: current.map((p) =>
      p.id === optionId ? { ...p, variantMealId } : p
    ),
  };
}

export function setOptionQty(
  group: ModifierGroup,
  choice: ModifierChoice,
  optionId: string,
  qty: number
): ModifierChoice {
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return choice;
  const current = chosenIn(choice, group.id);

  if (qty < 1) {
    const last = current.length <= 1 && current.some((p) => p.id === optionId);
    if (group.min >= 1 && last) return choice;
    return { ...choice, [group.id]: current.filter((p) => p.id !== optionId) };
  }

  const wanted = clampQty(qty, option.maxQty);
  if (!current.some((p) => p.id === optionId)) {
    if (current.length >= group.max) return choice;
    // Same as `toggleOption`: a stepper that adds a sized option has to
    // answer its size, or the pick is invalid the moment it is made.
    const size = defaultVariant(option)?.mealId;
    return {
      ...choice,
      [group.id]: [
        ...current,
        size
          ? { id: optionId, qty: wanted, variantMealId: size }
          : { id: optionId, qty: wanted },
      ],
    };
  }
  return {
    ...choice,
    [group.id]: current.map((p) => (p.id === optionId ? { ...p, qty: wanted } : p)),
  };
}

/**
 * The badge beside a group's name — what the customer is being asked to do.
 *
 * Written once because three screens ask it: the dish dialog, the till, and
 * the owner's editor. Written at ALL because the first version had two cases
 * and needed five, and the gap showed up in the shop's own data: a "Choose
 * your drinks" set to at-least-one-and-up-to-two was labelled "Pick 1", which
 * reads as "pick exactly one" — so a customer entitled to two drinks is told
 * they get one, and never taps the second.
 *
 * Every case says the number it means:
 *   0,1  Optional     1,1  Required
 *   2,2  Pick 2       0,3  Up to 3       1,2  Pick 1–2
 */
export function ruleLabel(group: Pick<ModifierGroup, "min" | "max">): string {
  const { min, max } = group;
  if (min < 1) return max === 1 ? "Optional" : `Up to ${max}`;
  if (min === max) return max === 1 ? "Required" : `Pick ${max}`;
  return `Pick ${min}–${max}`;
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
      const at = picked.find((p) => p.id === o.id);
      if (!at) continue;
      if (optionSoldOut(o)) continue;
      /**
       * A sized option resolves to the size that was picked.
       *
       * The label carries the size too — "Iced Tea · Large" — because the
       * receipt, the kitchen ticket and the cart line all read this string,
       * and "Iced Tea" alone tells the person making it nothing. The price
       * and the dish come from the variant, so what is charged and what comes
       * off the shelf are the large's, not the option's.
       *
       * A pick whose size is gone falls back to the default rather than being
       * dropped: the drink is still available, and silently removing a combo's
       * drink gives the customer a combo with no drink. `resolveChoice`
       * refuses it outright on the server, which is where refusing belongs.
       */
      const size = isSized(o)
        ? ((o.variants ?? []).find((v) => v.mealId === at.variantMealId) ??
           defaultVariant(o))
        : null;
      if (isSized(o) && !size) continue;

      out.push({
        optionId: o.id,
        groupId: g.id,
        label: size ? `${o.label} · ${size.label}` : o.label,
        price: size ? size.price : o.price,
        qty: clampQty(at.qty, o.maxQty),
        mealId: size ? size.mealId : o.mealId,
        ...(size ? { variantMealId: size.mealId } : {}),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Money, and telling one basket line from another                     */
/* ------------------------------------------------------------------ */

export const extrasTotal = (extras: ChosenExtra[]) =>
  extras.reduce((sum, e) => sum + (Number(e.price) || 0) * (Number(e.qty) || 0), 0);

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
  // The quantity is part of the identity, not a property of a shared line.
  // Without it a rice meal with one extra rice and one with three collapse
  // into two of whichever was added first — the same silent merge the meal id
  // alone used to cause, one level down.
  // The DISH is part of the identity too, not just the option.
  //
  // A sized add-on keeps one option id across all its sizes, so keying on the
  // option alone collapses "Iced Tea · Regular" and "Iced Tea · Large" into
  // one line — two different drinks, two different prices, two different
  // things off the shelf, shown as two of whichever was added first. Exactly
  // the silent merge the quantity note above describes, one level further
  // down. Harmless for a plain add-on, where the dish never varies.
  const ids = extras
    .map(
      (e) =>
        `${e.optionId}:${e.mealId ?? ""}:${Math.max(1, Math.floor(e.qty) || 1)}`
    )
    .sort();
  return ids.length > 0 ? `${mealId}|${ids.join("+")}` : mealId;
}

/** "Extra rice ×2, Coke" — the second line under the dish's name. */
export const describeExtras = (extras: ChosenExtra[]) =>
  extras.map((e) => (e.qty > 1 ? `${e.label} \u00d7${e.qty}` : e.label)).join(", ");

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
  picks: Picked[],
  dish: string
): Resolved {
  const offered = new Map<string, { group: ModifierGroup; option: ModifierOption }>();
  for (const g of groups) {
    for (const o of g.options) offered.set(o.id, { group: g, option: o });
  }

  const unknown = picks.filter((p) => !offered.has(p.id));
  if (unknown.length > 0) {
    return {
      extras: [],
      problem: `Something you added to ${dish} isn't offered any more. Open it again and re-pick.`,
    };
  }

  const soldOut = picks
    .map((p) => offered.get(p.id)!.option)
    .filter(optionSoldOut);
  if (soldOut.length > 0) {
    return {
      extras: [],
      problem: `${soldOut.map((o) => o.label).join(" and ")} just sold out. Take it off ${dish} and the rest can go through.`,
    };
  }

  // A quantity above what the option allows is refused, not clamped. Clamping
  // would serve one extra rice and charge for one while the customer agreed
  // to three — a total they can check against a screen that said something
  // else. The same argument as refusing an unknown option rather than
  // dropping it.
  const overQty = picks.find((p) => {
    const { option } = offered.get(p.id)!;
    const n = Number(p.qty);
    return !Number.isInteger(n) || n < 1 || n > option.maxQty;
  });
  if (overQty) {
    const { option } = offered.get(overQty.id)!;
    return {
      extras: [],
      problem:
        option.maxQty > 1
          ? `You can take up to ${option.maxQty} \u00d7 ${option.label} on ${dish}.`
          : `${option.label} can only be added once to ${dish}.`,
    };
  }

  /**
   * The size, checked against the option that offers it.
   *
   * The browser sends a dish id. Left unchecked, a cart edited by hand could
   * name ANY dish in the shop as the "size" of a drink — a ₱15 iced tea
   * charged at ₱15 while the kitchen is told to make a ₱180 ji pai, and the
   * stock to match. This is the same reason every label and every peso here
   * is read from the database rather than trusted from the cart.
   *
   * A sold-out size is refused rather than swapped for one that is in stock.
   * Quietly serving a large where a regular was chosen is a bigger drink and
   * a bigger bill than the customer agreed to.
   */
  const badSize = picks.find((p) => {
    const { option } = offered.get(p.id)!;
    if (!isSized(option)) return false;
    const v = (option.variants ?? []).find((x) => x.mealId === p.variantMealId);
    return !v || variantSoldOut(v);
  });
  if (badSize) {
    const { option } = offered.get(badSize.id)!;
    const known = (option.variants ?? []).some((v) => v.mealId === badSize.variantMealId);
    return {
      extras: [],
      problem: known
        ? `That size of ${option.label} just sold out. Open ${dish} again and pick another.`
        : `Pick a size for ${option.label} on ${dish}.`,
    };
  }

  const choice: ModifierChoice = {};
  for (const p of picks) {
    const gid = offered.get(p.id)!.group.id;
    const pick: Picked = p.variantMealId
      ? { id: p.id, qty: Math.floor(p.qty), variantMealId: p.variantMealId }
      : { id: p.id, qty: Math.floor(p.qty) };
    choice[gid] = [...(choice[gid] ?? []), pick];
  }

  for (const g of groups) {
    // Distinct answers, not copies of one: three extra rice is one answer.
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

/* ------------------------------------------------------------------ */
/* The order the customer meets the groups in                          */
/* ------------------------------------------------------------------ */

/** Enough of a group to put it in order. */
export type Orderable = { id: string; sort: number; name: string };

/**
 * The groups in the order a dish asks them, by the same rule `byOrder` uses.
 *
 * Exported so the admin's arrows and the customer's dialog cannot drift
 * apart. They were two separate comparisons for about an hour, and a control
 * that moves a group somewhere the customer does not see it move is worse
 * than having no control.
 */
export function inGroupOrder<T extends Orderable>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || a.name.localeCompare(b.name)
  );
}

/**
 * Where every group's `sort` should be after moving one of them a place.
 *
 * Returns ONLY the rows whose number actually changes, so a move writes two
 * rows rather than all of them — and returns nothing at all when the group is
 * already at the end, which is a button with nothing to do rather than an
 * error.
 *
 * The renumbering is the point, not the swap. Every group in this shop is
 * still on the column default of 0, so "find the row with the next highest
 * number and trade" finds nothing and does nothing — silently. Ordering the
 * list first and then numbering it 10, 20, 30 means the first click fixes a
 * table full of zeroes on its own, with no migration guessing at an order
 * nobody ever set.
 *
 * Tens, so a later insert has somewhere to land without touching its
 * neighbours.
 */
export function renumberAfterMove<T extends Orderable>(
  rows: readonly T[],
  id: string,
  direction: -1 | 1
): { id: string; sort: number }[] {
  const ordered = inGroupOrder(rows);
  const at = ordered.findIndex((r) => r.id === id);
  if (at < 0) return [];

  const to = at + direction;
  if (to < 0 || to >= ordered.length) return [];

  [ordered[at], ordered[to]] = [ordered[to], ordered[at]];

  return ordered
    .map((row, i) => ({ id: row.id, sort: (i + 1) * 10, was: Number(row.sort) || 0 }))
    .filter((r) => r.was !== r.sort)
    .map(({ id: rowId, sort }) => ({ id: rowId, sort }));
}
