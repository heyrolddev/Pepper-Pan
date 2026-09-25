/**
 * Colours for the kinds of food this shop sells.
 *
 * A category used to be a string typed into one box on one dish, which meant
 * "Chicken", "chicken" and "Chicken " were three categories, and the filter
 * bar on the customer menu showed all three. Now they are rows in a table, and
 * a row can carry a colour.
 *
 * The colour is a TOKEN, not a hex code, and that is the important decision
 * here. Two reasons, and both of them bite in practice:
 *
 *   Tailwind builds its stylesheet by reading the source, so a class name
 *   assembled at runtime from a hex in the database produces no CSS at all —
 *   the chip renders with no colour and nothing anywhere reports an error.
 *
 *   And a freely-picked colour can land anywhere, including pale yellow text
 *   on cream. A fixed set is not a limitation the owner has to work around;
 *   it is the guarantee that whatever they pick is still readable on the
 *   customer's phone in daylight.
 *
 * Ten, and the count is not the point — the SPACING is. The owner asked for
 * colours where no two categories look alike, and the set this replaced had
 * two pairs that did: Black against Brown, which were `ink-950` and `ink-700`
 * and both read as near-black, and Green against Teal, where "teal" was
 * `jade-800` — a darker green. Measured in Lab they were ΔE 17.8 and 22.6
 * apart; under about 25 the eye stops treating them as different colours.
 *
 * Every pair in this set is at least ΔE 35 apart, and every chip clears
 * 4.5:1 against its own text. Both were computed, not judged by eye, because
 * "these look different enough to me on this monitor" is how the last two got
 * in. If you add a colour, measure it against all ten first.
 */

export type CategoryTone = {
  /** What the owner calls it when choosing. */
  label: string;
  /** Filled chip — the selected filter, and the badge on a card. */
  chip: string;
  /** The same colour, quietly — an unselected filter or a label on a card. */
  soft: string;
  /** Just the colour, for a dot or a rail. */
  dot: string;
};

export const CATEGORY_TONES: Record<string, CategoryTone> = {
  brand: {
    label: "Red",
    chip: "bg-brand-600 text-cream-50",
    soft: "bg-brand-600/10 text-brand-700",
    dot: "bg-brand-600",
  },
  chili: {
    // Ink on a brighter orange, not cream on a darker one. Darkening it far
    // enough for cream text pulled it towards red — ΔE 21.8 from `brand`,
    // close enough to be the same colour on a card. At #f2761d it reads 6.9:1
    // under ink and sits ΔE 35 away from red.
    label: "Orange",
    chip: "bg-chili-500 text-ink-950",
    soft: "bg-chili-500/15 text-chili-700",
    dot: "bg-chili-500",
  },
  gold: {
    // Gold is the one that cannot take cream text — it's a light colour, and
    // the chip needs ink on it or the label vanishes. Ink on gold reads 13:1.
    label: "Yellow",
    chip: "bg-gold-400 text-ink-950",
    soft: "bg-gold-400/25 text-ink-900",
    dot: "bg-gold-400",
  },
  jade: {
    label: "Green",
    chip: "bg-jade-600 text-cream-50",
    soft: "bg-jade-600/12 text-jade-800",
    dot: "bg-jade-600",
  },
  teal: {
    // Was `jade-800` — a darker green, ΔE 22.6 from `jade`. Two categories
    // coloured Green and Teal were one colour on a phone.
    label: "Teal",
    chip: "bg-teal-600 text-cream-50",
    soft: "bg-teal-600/12 text-teal-800",
    dot: "bg-teal-600",
  },
  ocean: {
    label: "Blue",
    chip: "bg-ocean-600 text-cream-50",
    soft: "bg-ocean-600/12 text-ocean-800",
    dot: "bg-ocean-600",
  },
  plum: {
    label: "Plum",
    chip: "bg-plum-600 text-cream-50",
    soft: "bg-plum-600/12 text-plum-800",
    dot: "bg-plum-600",
  },
  brown: {
    // Was `ink-700`, which is charcoal with a hint of red in it — ΔE 17.8
    // from black, the worst pair in the old set.
    label: "Brown",
    chip: "bg-clay-600 text-cream-50",
    soft: "bg-clay-600/12 text-clay-800",
    dot: "bg-clay-600",
  },
  ink: {
    label: "Black",
    chip: "bg-ink-950 text-cream-50",
    soft: "bg-ink-950/8 text-ink-900",
    dot: "bg-ink-950",
  },
  sand: {
    label: "Sand",
    chip: "bg-cream-300 text-ink-950",
    soft: "bg-cream-200 text-ink-800",
    dot: "bg-cream-300",
  },
};

export const CATEGORY_COLOURS = Object.keys(CATEGORY_TONES);

/** The fallback is deliberately quiet: an uncoloured category is not a loud one. */
const DEFAULT_CATEGORY_TONE = "ink";

export function toneFor(colour: string | null | undefined): CategoryTone {
  return CATEGORY_TONES[colour ?? ""] ?? CATEGORY_TONES[DEFAULT_CATEGORY_TONE];
}

export type MenuCategory = { name: string; colour: string; sort_order: number };

/**
 * A colour for every category, with no two the same.
 *
 * This is the function that actually answers the owner's request, and it
 * exists because `fallbackColour` below cannot. That one hashes the name, and
 * a hash into ten buckets collides constantly — with five uncoloured
 * categories the chance that two land on the same colour is about 60%. It is
 * stable, which is what it was written for, but stable is not distinct.
 *
 * Two passes. Stored colours win outright: the owner picked them, and moving
 * one because a later category wanted it would be the screen overruling the
 * person. Then every category still without one takes the first colour
 * nothing else has used, walking the palette in order.
 *
 * Past ten categories there is nothing left to give, so it wraps and starts
 * reusing — the set is exhausted, not the rule abandoned. `clashingColours`
 * is what tells the owner that has happened, by name, rather than leaving
 * them to spot it.
 */
export function paletteFor(
  names: readonly string[],
  known?: Map<string, string>
): Map<string, CategoryTone> {
  const out = new Map<string, CategoryTone>();
  const taken = new Set<string>();

  const stored = new Map<string, string>();
  for (const name of names) {
    const colour = known?.get(name);
    if (colour && CATEGORY_TONES[colour]) {
      stored.set(name, colour);
      taken.add(colour);
    }
  }

  let next = 0;
  for (const name of names) {
    const pick = stored.get(name);
    if (pick) {
      out.set(name, CATEGORY_TONES[pick]);
      continue;
    }
    // The first unused colour. Once every colour is spoken for this keeps
    // walking and hands out repeats, which is the honest outcome of asking
    // for more categories than there are colours.
    let guard = 0;
    while (taken.has(CATEGORY_COLOURS[next % CATEGORY_COLOURS.length]) && guard < CATEGORY_COLOURS.length) {
      next += 1;
      guard += 1;
    }
    const colour = CATEGORY_COLOURS[next % CATEGORY_COLOURS.length];
    taken.add(colour);
    next += 1;
    out.set(name, CATEGORY_TONES[colour]);
  }
  return out;
}

/**
 * Categories that have ended up the same colour, grouped by the colour.
 *
 * Only ever non-empty when the owner has set two categories to the same
 * colour by hand, or when there are more categories than colours. Either way
 * it is worth saying out loud on the screen where colours are chosen — a
 * colour code with a duplicate in it is not a colour code, and the failure is
 * completely silent otherwise.
 */
export function clashingColours(
  names: readonly string[],
  known?: Map<string, string>
): { colour: string; label: string; names: string[] }[] {
  const assigned = paletteFor(names, known);
  const byLabel = new Map<string, string[]>();
  for (const [name, tone] of assigned) {
    const list = byLabel.get(tone.label) ?? [];
    list.push(name);
    byLabel.set(tone.label, list);
  }
  const clashes: { colour: string; label: string; names: string[] }[] = [];
  for (const [label, group] of byLabel) {
    if (group.length < 2) continue;
    const colour =
      CATEGORY_COLOURS.find((c) => CATEGORY_TONES[c].label === label) ?? "ink";
    clashes.push({ colour, label, names: group });
  }
  return clashes;
}

/**
 * A colour for a category nobody has coloured yet.
 *
 * Hashed from the name rather than picked at random, so it is the same colour
 * on every screen and after every reload — a category that changes colour when
 * you refresh reads as a bug, and worse, stops being a thing the eye can
 * learn. Not stored: the moment the owner picks one, that is what's stored.
 */
export function fallbackColour(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLOURS[h % CATEGORY_COLOURS.length];
}

/**
 * The colour to paint a category, given whatever the shop has set.
 *
 * Written once here because the menu, the till, the costing screen and the
 * admin list all need the same answer, and a category that is red on one
 * screen and green on another is worse than no colour at all.
 */
export function colourOf(
  name: string,
  known: Map<string, string> | undefined
): CategoryTone {
  const stored = known?.get(name);
  return toneFor(stored ?? fallbackColour(name));
}

/** What a dish's category is, with the same fallback everywhere. */
export function categoryOf(categories: string[] | null | undefined): string {
  return categories?.[0]?.trim() || "Menu";
}

/**
 * Tidy the list a dish is saved with.
 *
 * Trims, drops blanks, and removes case-insensitive duplicates while keeping
 * the first spelling — so a dish tagged "Chicken" and "chicken" ends up with
 * one category rather than two that look identical on the customer's filter
 * bar and behave as separate things.
 *
 * Order survives, because the first one leads: it is what the dish reads as
 * anywhere there is only room for one.
 */
export function cleanCategories(input: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of input ?? []) {
    const name = raw.trim();
    if (!name) continue;
    if (out.some((v) => v.toLowerCase() === name.toLowerCase())) continue;
    out.push(name);
  }
  return out;
}

/**
 * A dish, as far as its categories are concerned.
 *
 * Every screen that groups dishes reads this shape and nothing more, so the
 * three rules below can be shared without any of them depending on which
 * screen is asking.
 */
export type Categorised = { categories: string[] | null | undefined };

/**
 * Is this dish in that category?
 *
 * ANY of its categories, not just the first. `categoryOf` returns the first
 * one — the "main" that decides the dish's colour — and using that to answer
 * this question is the bug these three functions exist to stop coming back.
 * A dish tagged Mains and Ji Wings is in Ji Wings; a filter that says
 * otherwise is a pill that shows nothing.
 */
export function inCategory(item: Categorised, name: string): boolean {
  return (item.categories ?? []).some((c) => c.trim() === name);
}

/**
 * Every category actually in use, in the shop's own order first.
 *
 * The dishes decide WHICH categories exist; `known` — the `menu_categories`
 * table — only decides what order they come in. That way a menu imported from
 * somewhere with no vocabulary rows still gets its filters, and a category
 * with a row but no dish never becomes a pill that shows nothing.
 */
export function categoriesUsed(
  items: Categorised[],
  known: { name: string }[] = []
): string[] {
  const used = new Set<string>();
  for (const item of items) {
    for (const raw of item.categories ?? []) {
      const name = raw.trim();
      if (name) used.add(name);
    }
  }
  const ordered = known.map((c) => c.name).filter((n) => used.has(n));
  const rest = [...used].filter((n) => !ordered.includes(n)).sort();
  return [...ordered, ...rest];
}

/**
 * Where a dish sits in the menu's running order.
 *
 * The EARLIEST block it belongs to, across all of its categories — not the
 * block its first category names. That distinction is what makes this
 * controllable, so it is worth saying why.
 *
 * A milktea is usually tagged "Drinks" and "Milktea"; a Coke, "Drinks" and
 * "Soft drinks". If the order put "Drinks" near the front, every drink in the
 * shop would collapse into one early block and the careful Coffee → Milktea →
 * Raspberry → Soft drinks sequence would never appear. With "Drinks" placed
 * last, the same rule reads the specific category instead, and a dish tagged
 * only "Drinks" still lands at the end where it belongs.
 *
 * So the owner controls the whole layout by dragging one chip, rather than by
 * re-tagging thirty dishes. Anything in no known category sorts last.
 */
export function menuRank(item: Categorised, order: Map<string, number>): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const raw of item.categories ?? []) {
    const rank = order.get(raw.trim());
    if (rank !== undefined && rank < best) best = rank;
  }
  return best;
}

/**
 * The dishes, in the order the shop put its categories in.
 *
 * "All" used to be alphabetical by name, which is why a menu of Taiwanese
 * food opened on three two-litre bottles of soft drink: the names start with
 * digits, and digits sort before letters. Nobody chose that order — it was
 * the database's `order by name` showing through.
 *
 * Takes the ordered category list rather than the raw `menu_categories` rows,
 * so the grid and the filter pills above it are literally reading the same
 * array. Two lists that are meant to agree and are computed separately are
 * two lists that will eventually disagree.
 *
 * Ties break on name, with numeric collation — "8oz" before "16oz" before
 * "22oz", which is the order a person reads a drinks size in and the opposite
 * of what plain string sorting gives.
 */
export function orderForMenu<T extends Categorised & { name: string }>(
  items: T[],
  categories: string[]
): T[] {
  const order = new Map(categories.map((name, i) => [name, i]));
  return [...items].sort((a, b) => {
    const rankA = menuRank(a, order);
    const rankB = menuRank(b, order);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, "en", { numeric: true });
  });
}

/**
 * How many dishes are in each category.
 *
 * A dish in two categories counts in both, so these deliberately sum to more
 * than the number of dishes. That is the honest answer to what a chip asks —
 * "how many dishes are in here" — and the alternative, counting each dish
 * once under its first category, is what made a category holding a dish
 * display as zero.
 */
export function countByCategory(items: Categorised[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const raw of item.categories ?? []) {
      const name = raw.trim();
      if (!name) continue;
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * The colour a dish card is painted, or null for no colour at all.
 *
 * ONE category means one answer, and the card takes it. Two or more means
 * there is no single right answer, and the card stays cream — which is the
 * owner's own rule, and the correct one: a dish tagged both Chicken and Rice
 * painted in Chicken's red is a card quietly claiming to be only half of what
 * it is, and picking the first category would make the colour depend on
 * which order somebody happened to type the tags in.
 *
 * Cream is not a failure state here. It reads as "this one spans more than
 * one part of the menu", which is true and is worth seeing.
 */
export function cardTone(
  categories: readonly string[] | null | undefined,
  palette: Map<string, CategoryTone>
): CategoryTone | null {
  const named = (categories ?? []).map((c) => c.trim()).filter(Boolean);
  if (named.length !== 1) return null;
  return palette.get(named[0]) ?? null;
}
