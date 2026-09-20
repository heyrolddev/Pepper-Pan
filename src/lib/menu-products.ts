/**
 * One menu card, several ways of having it.
 *
 * The menu shows "16oz Iced Spanish Latte" and "22oz Iced Spanish Latte" as
 * two cards with the same photograph, and four Giant Ji Pai as four. To a
 * customer that reads as a menu with duplicates in it. To the shop they are
 * genuinely four different dishes — different recipes, different costs,
 * different stock, sold out one at a time — and migration 0048 explains at
 * length why that stays true in the database.
 *
 * This file is the join between the two views. It takes the dishes as they
 * are and works out what a customer should be offered.
 *
 * ── The one rule everything here follows ─────────────────────────────────
 *
 * THE VARIANTS ARE THE SOURCE OF THE OPTIONS. Nothing anywhere declares that
 * the latte comes in two sizes; it comes in two sizes because two dishes say
 * `{"Size": "16oz"}` and `{"Size": "22oz"}`. So a size exists exactly when a
 * dish exists that has it.
 *
 * That is what makes the impossible state impossible. The usual shape for
 * this — option groups in their own table, values in another, a join table
 * mapping combinations to variants — can list a size no dish has, and then
 * the customer picks it and there is nothing to put in the basket. Here there
 * is nothing to keep in step, because there is only one of it.
 *
 * ── Picking is a query, not a form ───────────────────────────────────────
 *
 * The consequence is that a selection is never assembled from parts and then
 * looked up. Every pick RESOLVES to a real dish before it is shown: `pick`
 * below returns the full option set of an actual variant, never a partial
 * combination that might not exist. So "22oz" and "with cheese" cannot be
 * held at the same time unless a 22oz-with-cheese is on the menu.
 */

export type VariantOptions = Record<string, string>;

export type Variant = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image_url: string | null;
  options: VariantOptions;
  /** Servings the shelf can still make. Null when there is no recipe to go on. */
  makeable?: number | null;
  /** The owner's own "we've 86'd it today" switch. */
  available: boolean;
  /** Order within its group — the order the chips are offered in. */
  sort: number;
  categories: string[];
  avg_rating?: number | null;
  review_count?: number;
};

/** One thing to choose: "Size", with "16oz" and "22oz" to choose between. */
export type Axis = { name: string; values: string[] };

export type Product = {
  /** A group's id, or `solo:<mealId>` for a dish that is its own card. */
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  categories: string[];
  /** Always at least one. Sorted the way the chips are offered. */
  variants: Variant[];
  /** Empty for a dish that is its own card — there is nothing to choose. */
  axes: Axis[];
  priceFrom: number;
  priceTo: number;
  /** Every way of having it has run out. */
  soldOut: boolean;
  avgRating: number | null;
  reviewCount: number;
  sortOrder: number;
};

export type ProductGroup = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
};

/* ------------------------------------------------------------------ */
/* Reading what the database gave us                                   */
/* ------------------------------------------------------------------ */

/**
 * `options` is jsonb, which means it is whatever anybody ever wrote into it.
 *
 * Checked rather than trusted, because the failure is silent and late: a
 * number where a label should be renders as a chip saying "22" that never
 * matches the string "22" the selection holds, and the dish becomes
 * unreachable with nothing on screen to say why.
 */
export function normalizeOptions(raw: unknown): VariantOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: VariantOptions = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const key = k.trim();
    const value = v.trim();
    // A blank value is not "no choice", it is a chip with nothing written on
    // it. Dropped, which turns the dish into one that simply lacks that axis.
    if (key && value) out[key] = value;
  }
  return out;
}

/** Has this dish run out, by either of the two routes it can? */
export function isSoldOut(v: Variant): boolean {
  if (!v.available) return true;
  return v.makeable !== null && v.makeable !== undefined && v.makeable <= 0;
}

/* ------------------------------------------------------------------ */
/* What there is to choose                                             */
/* ------------------------------------------------------------------ */

const inOrder = (a: Variant, b: Variant) =>
  a.sort - b.sort || a.name.localeCompare(b.name);

/**
 * The axes of a group, and the values on each, in the order they are offered.
 *
 * Both orders come from the variants themselves — first appearance, reading
 * the dishes in the order the owner arranged them. So "16oz before 22oz" is
 * expressed by putting the 16oz dish first, which is the same control that
 * orders everything else, rather than a second ordering to maintain in a
 * place that would eventually disagree with it.
 */
export function axesOf(variants: Variant[]): Axis[] {
  const axes: Axis[] = [];
  const byName = new Map<string, Axis>();

  for (const v of [...variants].sort(inOrder)) {
    for (const [name, value] of Object.entries(v.options)) {
      let axis = byName.get(name);
      if (!axis) {
        axis = { name, values: [] };
        byName.set(name, axis);
        axes.push(axis);
      }
      if (!axis.values.includes(value)) axis.values.push(value);
    }
  }

  // An axis with one value is not a choice. It would render as a single chip
  // that is already on and does nothing when tapped, which reads as a broken
  // control rather than as information.
  return axes.filter((a) => a.values.length > 1);
}

const matches = (v: Variant, selection: VariantOptions) =>
  Object.entries(selection).every(([axis, value]) => v.options[axis] === value);

/**
 * The dish a selection names, or nothing if the combination is not on the menu.
 *
 * Two dishes in one group can carry the same options — it is a mistake in the
 * grouping rather than a shape worth supporting, but it is one tap away in
 * the editor and the customer must not pay for it. So among equals the one
 * that can actually be sold wins, which turns an indistinguishable pair into
 * a working chip instead of a chip that is sold out for no visible reason.
 */
export function variantFor(
  variants: Variant[],
  selection: VariantOptions
): Variant | null {
  const hits = [...variants].sort(inOrder).filter((v) => matches(v, selection));
  return hits.find((v) => !isSoldOut(v)) ?? hits[0] ?? null;
}

/**
 * What the customer is looking at when the card opens.
 *
 * The cheapest one that is actually available, falling back to the cheapest
 * of all if the whole group has run out. Cheapest rather than first because
 * the card said "from ₱75" and opening it to the ₱129 one reads as a
 * bait-and-switch; available rather than cheapest-outright because opening
 * straight onto a sold-out variant makes a group that has stock look shut.
 */
export function openingSelection(variants: Variant[]): VariantOptions {
  if (variants.length === 0) return {};
  const cheapest = (list: Variant[]) =>
    [...list].sort((a, b) => a.price - b.price || inOrder(a, b))[0];
  const inStock = variants.filter((v) => !isSoldOut(v));
  return { ...cheapest(inStock.length > 0 ? inStock : variants).options };
}

export type ChipState =
  /** Pick it and you get a dish that exists and is in stock. */
  | "ok"
  /** The combination is on the menu, but it has run out. */
  | "sold_out"
  /** With what else is selected, this combination is not offered at all. */
  | "unavailable";

/**
 * Whether a chip can be tapped, and if not, which of the two reasons it is.
 *
 * Told apart because the shop can act on one and not the other. "Sold out"
 * means come back tomorrow; "not available" means with-cheese was never
 * offered in 22oz, and a customer who reads the second as the first waits for
 * something that is never coming.
 *
 * Judged against the OTHER axes only. Holding the tapped axis fixed would
 * make every chip grey the moment one combination ran out, including the one
 * already selected.
 */
export function chipState(
  variants: Variant[],
  selection: VariantOptions,
  axis: string,
  value: string
): ChipState {
  const others = { ...selection };
  delete others[axis];

  const candidates = variants.filter(
    (v) => v.options[axis] === value && matches(v, others)
  );
  if (candidates.length === 0) return "unavailable";
  return candidates.some((v) => !isSoldOut(v)) ? "ok" : "sold_out";
}

/**
 * Tapping a chip.
 *
 * Returns the full option set of a real dish, never a combination assembled
 * from the old selection plus the new value — because that combination may
 * not be on the menu, and a picker that can hold an impossible state has to
 * grow an error message for it.
 *
 * Which dish: the one carrying the tapped value that keeps most of what was
 * already chosen. So changing the size of a with-cheese ji pai keeps the
 * cheese when a with-cheese exists in that size, and gives it up when it does
 * not — the answer a person would give if you asked them at the counter.
 *
 * Keeping the choice comes BEFORE finding stock, and that ordering was wrong
 * the first time. Preferring stock meant tapping "with cheese" on an Original
 * whose cheese version had run out silently served up the SPICY one instead:
 * one tap changed two things, and the second change was one nobody asked for.
 * Landing on the sold-out original and saying so is the honest answer — the
 * customer can pick the spicy themselves, and now it is their decision.
 *
 * Stock only breaks a tie, where two dishes keep exactly as much of the
 * selection and there is no reason to prefer the one you cannot buy.
 */
export function pick(
  variants: Variant[],
  selection: VariantOptions,
  axis: string,
  value: string
): VariantOptions {
  const candidates = variants.filter((v) => v.options[axis] === value);
  // Nothing on the menu has it. The chip that led here should not have been
  // tappable, so the honest response is to change nothing.
  if (candidates.length === 0) return selection;

  const others = Object.entries(selection).filter(([k]) => k !== axis);
  const kept = (v: Variant) =>
    others.filter(([k, val]) => v.options[k] === val).length;

  const best = [...candidates].sort((a, b) => {
    const overlap = kept(b) - kept(a);
    if (overlap !== 0) return overlap;
    const stock = Number(isSoldOut(a)) - Number(isSoldOut(b));
    if (stock !== 0) return stock;
    return inOrder(a, b);
  })[0];

  return { ...best.options };
}

/* ------------------------------------------------------------------ */
/* Building the menu                                                   */
/* ------------------------------------------------------------------ */

/** Deduped, in the order they were first met. */
function union(lists: string[][]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const t = item.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

function ratingOf(variants: Variant[]): { avg: number | null; count: number } {
  // Weighted by how many people actually left each one, so a variant with a
  // single five-star review does not outvote one with forty at 4.2.
  let weighted = 0;
  let count = 0;
  for (const v of variants) {
    const n = v.review_count ?? 0;
    if (n > 0 && v.avg_rating != null) {
      weighted += v.avg_rating * n;
      count += n;
    }
  }
  return count > 0 ? { avg: weighted / count, count } : { avg: null, count: 0 };
}

function productOf(
  id: string,
  group: ProductGroup | null,
  variants: Variant[]
): Product {
  const sorted = [...variants].sort(inOrder);
  const lead = sorted[0];
  const prices = sorted.map((v) => v.price);
  const { avg, count } = ratingOf(sorted);

  return {
    id,
    name: group?.name ?? lead.name,
    // Falling back rather than copying. A group whose description is left
    // empty shows its lead dish's, so grouping four dishes that already have
    // good descriptions costs no retyping — and editing the dish still
    // changes what the customer reads, which a copy would have frozen.
    description: group?.description?.trim() || lead.description,
    image_url: group?.image_url || lead.image_url,
    // Derived, never stored on the group: a category on the group would be a
    // second answer to "what is this", free to disagree with the dishes the
    // day one of them is re-tagged.
    categories: union(sorted.map((v) => v.categories ?? [])),
    variants: sorted,
    axes: axesOf(sorted),
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
    soldOut: sorted.every(isSoldOut),
    avgRating: avg,
    reviewCount: count,
    sortOrder: group?.sort_order ?? 0,
  };
}

/**
 * The customer's menu: one entry per card.
 *
 * A dish with no group is a product of one, rather than a separate kind of
 * thing the menu has to know about. That is what lets every card on the menu
 * be tappable from the day this ships — a menu where some cards open and
 * others do not is worse than one where none of them do, because the ones
 * that do nothing read as broken.
 *
 * An inactive group is not an inactive menu: its dishes come back as their
 * own cards, which is exactly what they were before anybody grouped them.
 * Nothing is taken off sale by a presentation switch.
 */
export function buildProducts(
  variants: Variant[],
  groups: ProductGroup[],
  groupIdOf: (v: Variant) => string | null
): Product[] {
  const live = new Map(groups.filter((g) => g.is_active).map((g) => [g.id, g]));
  const grouped = new Map<string, Variant[]>();
  const products: Product[] = [];

  for (const v of variants) {
    const gid = groupIdOf(v);
    if (gid && live.has(gid)) {
      grouped.set(gid, [...(grouped.get(gid) ?? []), v]);
    } else {
      products.push(productOf(`solo:${v.id}`, null, [v]));
    }
  }

  for (const [gid, members] of grouped) {
    products.push(productOf(gid, live.get(gid)!, members));
  }

  // Alphabetical, which is what the menu has always been, with sort_order in
  // front of it for a group the owner has deliberately placed.
  return products.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}
