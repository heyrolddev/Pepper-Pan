/**
 * The slice of a conversation the assistant is given, and which end it
 * comes from.
 *
 * ── What was found, stated accurately ────────────────────────────────────
 *
 * Both the website and the Messenger webhook loaded history with
 *
 *     .order("id", { ascending: true }).limit(40)
 *
 * which is the OLDEST forty messages, not the most recent. Under forty
 * messages that is the whole thread and looks perfect; past forty it is a
 * frozen opening.
 *
 * It changes no answer TODAY, and that is worth saying plainly rather than
 * claiming a fix that did nothing. `askAssistant` is not a language model —
 * it matches against the shop's own FAQ and data — and it reads exactly one
 * thing out of the history it is handed: the last user turn, which the
 * caller has just appended. The other forty rows are fetched and discarded.
 *
 * So this is a trap rather than a live fault, and traps are worth closing
 * because of how they spring. The day the assistant learns to use context —
 * the obvious next thing to want from it — it would quietly have been given
 * the wrong end of every long conversation, and the symptom would be an
 * assistant that repeats itself while every test still passes.
 *
 * Two call sites, one unwritten rule, wrong in both. So the rule lives here
 * with the reversal attached to it, and both sites call this.
 *
 * Deliberately free of imports so `node --test` can read it directly.
 */

/** `staff` is a reply typed by a person in the shop's inbox. */
export type Turn = { role: "user" | "assistant" | "staff"; content: string };

const ROLES = new Set(["user", "assistant", "staff"]);

/** How much of a conversation is worth replaying. */
export const HISTORY_TURNS = 40;

/** What one person may send in a single message. */
export const MAX_MESSAGE = 1000;

/**
 * Newest-first rows in, oldest-first conversation out, with this turn on
 * the end.
 *
 * The query must ask for `ascending: false` — that is what makes the limit
 * take the RECENT end — and a conversation is read forwards, so it is
 * turned back here rather than at each call site. One of those two steps
 * without the other gives a plausible-looking conversation in the wrong
 * order, which is worse than an obviously broken one.
 */
export function replay(newestFirst: Turn[] | null | undefined, incoming: string): Turn[] {
  const rows = (newestFirst ?? []).filter(
    (t) => t && ROLES.has(t.role) && typeof t.content === "string"
  );
  return [
    ...rows.slice(0, HISTORY_TURNS).reverse(),
    { role: "user", content: incoming.slice(0, MAX_MESSAGE) },
  ];
}
