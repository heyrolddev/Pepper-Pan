import { shiftDay } from "./pot-history.ts";

/**
 * A stretch of days the shop picks, and the four it picks most.
 *
 * Its own module because two screens now ask the same question of different
 * ledgers — what went in the bin, and what the counts say is missing — and a
 * second copy of this arithmetic is a second place for a month boundary to be
 * wrong in. One vocabulary, so "Last month" means the same thing on every
 * screen that offers it.
 *
 * Everything here is string arithmetic. Manila is UTC+8, and a range built
 * from a Date's local getters puts the 1st of the month in the previous month
 * for anybody west of Greenwich while being perfectly right when tested from
 * here — the bug that never shows up in the place it was written.
 */

/** Inclusive at both ends. */
export type Range = { from: string; to: string };

export type PresetId = "today" | "week" | "month" | "last-month" | "custom";

export const PRESET_LABEL: Record<Exclude<PresetId, "custom">, string> = {
  today: "Today",
  week: "Last 7 days",
  month: "This month",
  "last-month": "Last month",
};

export function preset(id: Exclude<PresetId, "custom">, today: string): Range {
  switch (id) {
    case "today":
      return { from: today, to: today };
    case "week":
      // The last seven days INCLUDING today, which is what somebody means by
      // "this week" at a stall — not the days since Monday.
      return { from: shiftDay(today, -6), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-month": {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = shiftDay(firstOfThis, -1);
      return { from: `${lastOfPrev.slice(0, 7)}-01`, to: lastOfPrev };
    }
  }
}

/**
 * A range the database can be handed.
 *
 * Reversed dates are swapped rather than refused. Somebody filling in two
 * date fields puts them in the wrong order often enough that refusing is just
 * a worse way of doing the obvious thing — and an empty result on a range the
 * shop believes it typed correctly reads as "nothing happened", which is the
 * one wrong answer either of these screens must never give.
 */
export function normaliseRange(from: string, to: string): Range {
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** Whole days covered, counting both ends. */
export function rangeDays(r: Range): number {
  let n = 1;
  let day = r.from;
  while (day < r.to && n < 4000) {
    day = shiftDay(day, 1);
    n += 1;
  }
  return n;
}
