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
  // Courtesy and filler. A trigger of "salamat" or "sige" would fire on
  // half the messages a polite Filipino customer ever sends.
  "salamat", "sige", "opo", "oo", "hindi", "please", "thanks", "thank",
  "hello", "hi", "kumusta", "kamusta", "good", "morning", "afternoon",
  "evening", "ok", "okay", "lang", "naman", "talaga", "din", "rin", "pala",
  // Filipino question scaffolding. These are how a question is *built*, not
  // what it's about — grouping on "pwede" would file "pwede bang walang
  // sibuyas" and "pwede bang mag-cancel" under one heading.
  "pwede", "puwede", "bang", "walang", "mag", "nga", "kasi", "eh", "yan",
  "kaya", "sana", "baka", "para", "nyo", "ninyo",
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

/**
 * The meaningful single words in a sentence.
 *
 * Deliberately not `deriveTriggers`: that honours the owner's commas, because
 * "credit card" is one trigger they meant as a phrase. A customer's comma is
 * just punctuation — "may allergy ako sa sibuyas, pwede ba tanggalin?" has to
 * yield "sibuyas", or two people asking the same thing never group.
 */
export function keywordsOf(text: string): string[] {
  return deriveTriggers(text.replace(/,/g, " "));
}

/**
 * How the assistant says it doesn't know.
 *
 * Only the genuine knowledge gap counts. A complaint or a cancellation also
 * reaches a human, but that's the system working — those aren't questions an
 * answer would have solved, and folding them in would bury the ones that are.
 */
export const GAVE_UP = [
  "not sure about that",
  "hindi ko po sigurado",
];

export type Unanswered = {
  /** The word these questions have in common — what they're all about. */
  topic: string;
  count: number;
  /** The actual questions, so the owner answers a real one, not a summary. */
  examples: string[];
};

/**
 * Questions the assistant gave up on, grouped by what they're about.
 *
 * The owner shouldn't have to notice a pattern by scrolling the inbox. Three
 * people asking about parking in a week is a missing answer, and it should
 * say so.
 *
 * Grouping is by shared keyword rather than anything cleverer: at a stall's
 * volume the questions that repeat share an obvious word, and a topic the
 * owner can read beats a cluster id they can't.
 */
export function groupUnanswered(questions: string[], minCount = 2): Unanswered[] {
  const byTopic = new Map<string, string[]>();

  for (const q of questions) {
    for (const word of keywordsOf(q)) {
      const bucket = byTopic.get(word);
      if (bucket) bucket.push(q);
      else byTopic.set(word, [q]);
    }
  }

  const groups: Unanswered[] = [];
  const claimed = new Set<string>();

  // Biggest topics first, and each question is only counted once — otherwise
  // one question about "delivery sa Apalit" inflates three separate topics.
  for (const [topic, asked] of [...byTopic.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )) {
    const unclaimed = asked.filter((q) => !claimed.has(q));
    if (unclaimed.length < minCount) continue;
    unclaimed.forEach((q) => claimed.add(q));
    groups.push({
      topic,
      count: unclaimed.length,
      examples: [...new Set(unclaimed)].slice(0, 4),
    });
  }

  return groups.slice(0, 8);
}
