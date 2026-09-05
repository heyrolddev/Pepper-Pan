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
 * Eight is enough for a street-food menu and few enough that two categories
 * are never nearly the same colour — which is the whole point of colouring
 * them.
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
    label: "Orange",
    chip: "bg-chili-600 text-cream-50",
    soft: "bg-chili-600/12 text-chili-700",
    dot: "bg-chili-600",
  },
  gold: {
    // Gold is the one that cannot take cream text — it's a light colour, and
    // the chip needs ink on it or the label vanishes.
    label: "Yellow",
    chip: "bg-brand-600 text-cream-50",
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
    label: "Teal",
    chip: "bg-jade-800 text-cream-50",
    soft: "bg-jade-800/12 text-jade-900",
    dot: "bg-jade-800",
  },
  ink: {
    label: "Black",
    chip: "bg-ink-950 text-cream-50",
    soft: "bg-ink-950/8 text-ink-900",
    dot: "bg-ink-950",
  },
  brown: {
    label: "Brown",
    chip: "bg-ink-700 text-cream-50",
    soft: "bg-ink-700/12 text-ink-800",
    dot: "bg-ink-700",
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
