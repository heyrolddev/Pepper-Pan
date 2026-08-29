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
