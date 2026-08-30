/**
 * Turning what the owner typed into words the matcher can use.
 *
 * Shared between the server actions and the editor so the owner sees exactly
 * the triggers that will be saved, before they save them.
 */

/** Words too common to be a useful trigger — they'd catch every message. */
const STOPWORDS = new Set([
  "ang", "ng", "sa", "na", "ay", "po", "ba", "ko", "mo", "niyo", "ninyo",
  "kayo", "kami", "ako", "yung", "yun", "ito", "iyan", "may", "meron", "wala",
  "the", "and", "for", "you", "your", "our", "are", "is", "was", "can", "do",
  "does", "did", "with", "from", "that", "this", "have", "has", "how", "what",
  "when", "where", "why", "who", "will", "would", "about", "any", "all",
]);

/**
 * Accepts a comma-separated list or a plain sentence, and returns clean
 * trigger words. A sentence is reduced to its meaningful words so the owner
 * can paste a customer's actual question and get sensible triggers.
 */
export function deriveTriggers(input: string): string[] {
  const raw = input.includes(",") ? input.split(",") : input.split(/\s+/);

  const cleaned = raw
    .map((t) =>
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    // A one- or two-letter trigger matches half the language; a stopword
    // matches the other half.
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

  return [...new Set(cleaned)].slice(0, 25);
}
