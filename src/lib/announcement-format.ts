/**
 * Dates on a promo or a news post, in the shop's own timezone.
 *
 * Its own file rather than the page's, because the homepage, the news list
 * and the detail page all print the same window and three copies of a date
 * formatter is three chances to show a customer the wrong day.
 */

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", ...opts });

/** "2 Sep" — for a card, where the year is almost always this one. */
export const shortDate = (iso: string) =>
  fmt({ day: "numeric", month: "short" }).format(new Date(iso));

/** "2 September 2026" — for a page, where it may be read much later. */
export const longDate = (iso: string) =>
  fmt({ day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/** How long it runs, or nothing at all when it has no bounds. */
export function windowText(
  starts: string | null,
  ends: string | null
): string | null {
  if (starts && ends) return `${longDate(starts)} → ${longDate(ends)}`;
  if (ends) return `Until ${longDate(ends)}`;
  if (starts) return `From ${longDate(starts)}`;
  return null;
}
