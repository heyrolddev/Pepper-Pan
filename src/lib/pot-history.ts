/**
 * Reading one pot's history a day at a time.
 *
 * The drawer's history is the longest list in HQ — every cash sale since
 * counting started — and it was shown as one flat run of rows newest first.
 * That is the right shape for "what happened recently" and the wrong shape
 * for the question people actually open it with, which is "what happened on
 * the day the count came up short". Scrolling to a Tuesday three weeks ago
 * through four hundred sales is not a filter; it is a search performed by
 * hand.
 *
 * So the pot histories open on a single day, and stepping to another day is
 * one tap. The rules that make that usable — which day to open on, where the
 * arrows go, what a day adds up to — live here rather than in the component,
 * because every one of them is a statement about the data and can be wrong
 * in a way no amount of looking at the screen would reveal.
 */

export type Movement = {
  id: string;
  /** An ISO date. Only the first ten characters are ever compared. */
  date: string;
  type: "in" | "out";
  amount: number;
};

/** How many movements a day shows before asking. */
export const DAY_PREVIEW = 3;

/** ISO day, whatever precision the timestamp arrived at. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Everything that moved on one day, in the order it was given. */
export function movementsOn<T extends Movement>(items: T[], day: string): T[] {
  return items.filter((i) => dayOf(i.date) === day);
}

export type Tally = { in: number; out: number; net: number; count: number };

export function tally(items: Movement[]): Tally {
  let into = 0;
  let out = 0;
  for (const m of items) {
    const amount = Number.isFinite(m.amount) ? Math.abs(m.amount) : 0;
    if (m.type === "in") into += amount;
    else out += amount;
  }
  return { in: into, out, net: into - out, count: items.length };
}

/**
 * The most recent day at or before `from` that anything moved on.
 *
 * Opening on today is what the owner asked for and it is right — but a stall
 * that did not open today, or an owner checking at 7am, would get an empty
 * dialog, and an empty dialog on a feature you just clicked reads as broken
 * rather than as quiet. So the screen can offer the real answer instead of
 * only the true one.
 */
export function lastDayWith(items: Movement[], from: string): string | null {
  let best: string | null = null;
  for (const m of items) {
    const day = dayOf(m.date);
    if (day > from) continue;
    if (best === null || day > best) best = day;
  }
  return best;
}

/** The nearest day after `from` that anything moved on. */
export function nextDayWith(items: Movement[], from: string): string | null {
  let best: string | null = null;
  for (const m of items) {
    const day = dayOf(m.date);
    if (day <= from) continue;
    if (best === null || day < best) best = day;
  }
  return best;
}

/**
 * Every day that has movement, newest first.
 *
 * Used for the "jump to" list, and deliberately deduplicated here rather than
 * by rendering a Set — the order of a Set is insertion order, which is the
 * order the rows happened to arrive in.
 */
export function daysWithMovement(items: Movement[]): string[] {
  return [...new Set(items.map((m) => dayOf(m.date)))].sort((a, z) =>
    a < z ? 1 : a > z ? -1 : 0
  );
}

/** The day before, as a string. No Date, for the timezone reason. */
export function shiftDay(day: string, by: number): string {
  // Date arithmetic is unavoidable for days (months have different lengths),
  // but it is done wholly in UTC and sliced back out, so it never touches a
  // local calendar. `Date.UTC` in, `toISOString` out, no local getters.
  const t = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10))
  );
  return new Date(t + by * 86_400_000).toISOString().slice(0, 10);
}
