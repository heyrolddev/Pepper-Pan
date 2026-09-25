/**
 * The short name for a dish.
 *
 * "One Cheesy Giant Ji Pai with extra rice, no spicy" is a sentence, and at a
 * stall beside a market it is a sentence shouted twice. "C1" is a code. Every
 * fast-food counter in the country runs on the second one, and the reason is
 * not brevity — it is that a code survives noise, a phone line, and a
 * customer who has never seen the dish written down.
 *
 * Letter from the category, number within it: Chicken gives C1, C2; Drinks
 * gives D1. So the code carries its group, which is the part a plain running
 * number throws away — "C3" tells the kitchen it is chicken before anyone
 * looks it up.
 */

export const CODE_MAX = 8;

/** A–Z and 0–9 only, upper case. Anything else is not sayable across a stall. */
export function cleanCode(raw: string | null | undefined): string {
  return (raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_MAX);
}

/**
 * The letter a category contributes.
 *
 * Its first letter, which is right nearly always and wrong in a way anybody
 * can see and fix. A category starting with a digit or a symbol — "8oz
 * Drinks" — has no usable letter, so it falls back to the first letter in the
 * name rather than producing a code like "81".
 */
export function letterFor(category: string | null | undefined): string {
  for (const ch of (category ?? "").toUpperCase()) {
    if (ch >= "A" && ch <= "Z") return ch;
  }
  return "X";
}

/**
 * The next free code for a dish.
 *
 * `taken` is every code already in use, in any case — the database holds a
 * case-insensitive unique index, so suggesting "c1" when "C1" exists would
 * produce a save that fails with a constraint error the owner cannot act on.
 *
 * Numbering restarts per letter, so adding a drink never renumbers the
 * chicken. It fills gaps: delete C2 and the next chicken dish becomes C2
 * again, which is what a counter wants — codes on a printed menu stay dense
 * rather than climbing to C47 over a year of edits.
 */
export function suggestCode(
  category: string | null | undefined,
  taken: Iterable<string>
): string {
  const letter = letterFor(category);
  const used = new Set<string>();
  for (const t of taken) {
    const clean = cleanCode(t);
    if (clean) used.add(clean);
  }
  for (let n = 1; n <= 999; n++) {
    const candidate = `${letter}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return "";
}

/**
 * Codes for a whole menu at once, for the "number them all" button.
 *
 * Existing codes are kept exactly as they are — renumbering a menu somebody
 * has already printed is not a favour — and only dishes without one are given
 * anything. Order matters and is the caller's: hand it the dishes in menu
 * order and the codes come out in menu order too.
 */
export function codeTheMenu(
  dishes: readonly { id: string; code: string | null; category: string | null }[]
): Map<string, string> {
  const taken = new Set<string>();
  for (const d of dishes) {
    const clean = cleanCode(d.code);
    if (clean) taken.add(clean);
  }

  const out = new Map<string, string>();
  for (const d of dishes) {
    if (cleanCode(d.code)) continue;
    const next = suggestCode(d.category, taken);
    if (!next) continue;
    taken.add(next);
    out.set(d.id, next);
  }
  return out;
}

/** Why a typed code is not allowed, or null when it is fine. */
export function codeProblem(
  raw: string,
  takenByOthers: Iterable<string>
): string | null {
  const code = cleanCode(raw);
  if (!code) return raw.trim() ? "Letters and numbers only." : null;
  for (const other of takenByOthers) {
    if (cleanCode(other) === code) return `${code} is already another dish.`;
  }
  return null;
}
