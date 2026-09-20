/**
 * Working out the grouping from the names the shop already uses.
 *
 * The owner has to group forty-odd dishes into menu cards, and every one of
 * them is a form: what is this card called, what is the choice called, what is
 * this dish's value for it. Forty forms is a job nobody finishes, and a
 * feature nobody finishes setting up is a feature that does not exist.
 *
 * But the answers are already written down. "16oz Iced Spanish Latte" and
 * "22oz Iced Spanish Latte" have said, for months, that the card is called
 * Iced Spanish Latte and the choice is 16oz or 22oz. This reads that back.
 *
 * ── A suggestion, never a decision ───────────────────────────────────────
 *
 * Everything here is pre-filled into an editable form, and this is the reason
 * it has to be: name-matching is a guess, and the guesses it gets wrong are
 * not the obvious ones. "Giant Jipai (Original)" against "Giant Jipai
 * w/cheese (Original)" shares a prefix that is not the name of anything. The
 * owner glances at four filled boxes and fixes the one that is wrong, which
 * is a different job from typing four boxes — and is the same show-then-do
 * shape the take-out merge already uses on this screen.
 */

export type Suggestion = {
  /** What the card should be called. */
  productName: string;
  /** What the choice should be called — "Size", "Flavour". */
  axis: string;
  /** One value per dish, in the order the dishes came in. */
  values: string[];
};

/** Words, so a common run stops at a word boundary rather than mid-syllable. */
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/**
 * Trimmed of the punctuation a variant is usually wrapped in.
 *
 * "(SPICY)" and "(Original)" are how this shop writes it, and the brackets
 * are doing the job the option chip is about to do instead.
 */
function tidyValue(raw: string): string {
  const v = raw.replace(/\s+/g, " ").trim();
  // Only when the brackets wrap the WHOLE value. Stripping them by ends
  // instead turned "w/cheese (Original)" into "w/cheese (Original" — an
  // unclosed bracket on a chip, which reads as a bug rather than as a name.
  const wrapped = v.match(/^\((.+)\)$/) ?? v.match(/^\[(.+)\]$/);
  return (wrapped ? wrapped[1] : v).replace(/^[\s,:-]+|[\s,:-]+$/g, "").trim();
}

function tidyName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—,:]\s*$/, "")
    .replace(/^\s*[-–—,:]\s*/, "")
    .trim();
}

/**
 * What this choice is called.
 *
 * Read from the values rather than asked for, because the values say it:
 * anything measured in ounces is a Size. The fallback is deliberately the
 * bland "Option" rather than a cleverer guess — a wrong specific word
 * ("Flavour" over a list of sizes) reads as the software being confused,
 * where a vague right one reads as a box waiting to be filled in.
 */
function axisFor(values: string[]): string {
  const all = (re: RegExp) => values.every((v) => re.test(v));
  if (all(/^\d+\s*(oz|ml|l|g|kg)\b/i)) return "Size";
  if (all(/^(small|medium|large|regular|solo|jumbo|giant)\b/i)) return "Size";
  if (values.some((v) => /spic|hot|chili|chilli|original|mild/i.test(v))) return "Flavour";
  if (values.some((v) => /cheese|extra|with|w\//i.test(v))) return "Add-on";
  return "Option";
}

/**
 * The card, the choice and the values, read off a set of dish names.
 *
 * Returns nothing when the names share no common run, or when what is left
 * after removing it is empty for any dish — both mean these are not variants
 * of one thing, and a suggestion built from them would be worse than an empty
 * form because it looks considered.
 */
export function suggestGrouping(names: string[]): Suggestion | null {
  const rows = names.map(words);
  if (rows.length < 2 || rows.some((r) => r.length === 0)) return null;

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // How many whole words every name starts with, and ends with, in common.
  let head = 0;
  while (
    rows.every((r) => r.length > head) &&
    rows.every((r) => same(r[head], rows[0][head]))
  ) {
    head++;
  }
  let tail = 0;
  while (
    rows.every((r) => r.length > head + tail) &&
    rows.every((r) => same(r[r.length - 1 - tail], rows[0][rows[0].length - 1 - tail]))
  ) {
    tail++;
  }

  const productName = tidyName(
    [...rows[0].slice(0, head), ...rows[0].slice(rows[0].length - tail)].join(" ")
  );
  const values = rows.map((r) => tidyValue(r.slice(head, r.length - tail).join(" ")));

  // No shared run at all, or a dish whose whole name is the shared run — in
  // both cases these are not two ways of having one thing.
  if (!productName || values.some((v) => !v)) return null;
  // Two dishes that differ by nothing distinguishable are duplicates, not
  // variants, and the chips would be two identical buttons.
  if (new Set(values.map((v) => v.toLowerCase())).size !== values.length) return null;

  return { productName, axis: axisFor(values), values };
}
