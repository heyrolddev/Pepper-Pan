/**
 * What is allowed to be printed on a receipt as a person's name.
 *
 * Pure and import-free so the rules can be tested, because they are rules
 * about something that ends up on paper in a customer's hand and in the
 * shift report the shop is paid against. "It looked fine when I typed it" is
 * not a check.
 *
 * Deliberately permissive about SHAPE. Filipino names carry Ñ, hyphens,
 * apostrophes, Jr., three surnames and single mononyms, and a validator that
 * insists on "First Last" rejects real people — which is a worse failure than
 * letting an odd one through, because the person it rejects cannot work
 * around it. What it does insist on is that the thing is a name at all: long
 * enough to read, short enough to print, and containing at least one letter.
 */

/** Longer than this and it stops fitting a 32-character roll with room to spare. */
export const NAME_MAX = 60;
const NAME_MIN = 2;

export type CleanName = { name: string; error: null } | { name: null; error: string };

export function cleanName(raw: string): CleanName {
  // Runs of whitespace collapse: a name pasted out of a spreadsheet arrives
  // with two spaces in the middle often enough to be worth handling quietly
  // rather than refusing.
  const name = raw.trim().replace(/\s+/g, " ");

  if (name.length < NAME_MIN) {
    return { name: null, error: "Put in the name you want on the till." };
  }
  if (name.length > NAME_MAX) {
    return {
      name: null,
      error: `That's too long for a receipt — keep it under ${NAME_MAX} characters.`,
    };
  }
  // At least one letter, in any script. Digits and punctuation on their own
  // are either a mistake or somebody being funny, and both get printed.
  if (!/\p{L}/u.test(name)) {
    return { name: null, error: "That doesn't look like a name." };
  }
  return { name, error: null };
}
