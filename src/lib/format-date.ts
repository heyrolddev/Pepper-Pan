/**
 * Dates formatted in the shop's own timezone, with a fixed locale.
 *
 * Two reasons this isn't a bare `toLocaleString()`:
 *
 * 1. Correctness for the shop. Pepper Pan trades in Apalit; an order placed at
 *    7pm should read "7:00 PM" to staff and customers alike, not shift because
 *    someone opened the page on a phone set to another timezone.
 *
 * 2. Hydration. A client component rendering `toLocaleString()` formats with
 *    the server's timezone during SSR and the browser's on hydration. When
 *    those differ — a UTC host and a UTC+8 customer, which is exactly this
 *    deployment — the text mismatches and React throws (#418). Pinning both
 *    locale and timezone makes the two renders identical by construction.
 */
const TIME_ZONE = "Asia/Manila";
const LOCALE = "en-PH";

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateOnly = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFull = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(value: string | Date): string {
  return dateTime.format(new Date(value));
}

export function formatDate(value: string | Date): string {
  return dateOnly.format(new Date(value));
}

export function formatDateTimeFull(value: string | Date): string {
  return dateTimeFull.format(new Date(value));
}

/**
 * The shop's own day — the one the calendar on the wall in Apalit says.
 *
 * ── What this used to be, and the eight hours it got wrong ───────────────
 *
 * It used to be `at.toISOString().slice(0, 10)` — the UTC date — to agree
 * with `orders.date`, which takes Postgres `current_date` on a Supabase
 * project that runs in UTC. Agreeing with the column was the right
 * instinct and the wrong fix, because Manila is UTC+8: from midnight to 8am
 * every single morning, "today" meant YESTERDAY.
 *
 * It is not a rounding error. On a Sunday morning the owner opened HQ and
 * read "Sunday, 27 September — ₱2,061, 8 orders today" over Saturday's
 * takings, with Sunday itself not yet open. The heading was formatted in
 * Manila and the figure was filtered in UTC, so the two halves of one
 * sentence were eight hours apart and neither said so. Every screen with a
 * "today" on it had the same eight-hour hole: the counter's own sales list,
 * the forecast, the buy list, what waste was logged today.
 *
 * So the shop's day is Manila's day, here and in the database — migration
 * 0059 moves every `default current_date` onto the same footing, so the
 * column and this function cannot drift apart again.
 *
 * ── Why `formatToParts` rather than an offset ────────────────────────────
 *
 * The Philippines has been a fixed UTC+8 since 1978, so `at.getTime() +
 * 8h` would be exact today. It would also be a rule written into the code
 * rather than looked up, and the one thing worse than a timezone bug is a
 * timezone bug that nobody can find because the offset is a number. The
 * parts are assembled by hand rather than trusting a locale to print
 * YYYY-MM-DD, which is a second assumption doing the same job.
 */
const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function shopToday(at: Date = new Date()): string {
  const parts = isoDay.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The shop's day, a number of days either side of it.
 *
 * `new Date(now - 864e5)` was the going rate for "yesterday" on four
 * screens, and it is the same UTC bug in a shorter sentence. Shifting the
 * CALENDAR DATE rather than the instant is what makes this right across a
 * month end and immune to the hour it is run at.
 */
export function shopDay(offsetDays: number, at: Date = new Date()): string {
  const today = shopToday(at);
  const t = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  return new Date(t + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** The first of the shop's current month. */
export function shopMonthStart(at: Date = new Date()): string {
  return `${shopToday(at).slice(0, 7)}-01`;
}

/**
 * An instant safely inside a given shop day, for handing to a formatter.
 *
 * A date-only string parsed by `new Date()` is midnight UTC, which is 8am
 * Manila — fine — but the same trick one timezone west lands on the day
 * before, and a label formatted from it then disagrees with the key it was
 * derived from. Noon UTC is 8pm Manila and midnight-ish nowhere, so a label
 * and its data cannot come apart.
 */
export function middayOf(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`);
}
