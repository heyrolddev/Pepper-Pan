/**
 * What the shop has been doing — the shape of it, and the words for it.
 *
 * Split from `activity-server.ts` because that file is `server-only` and the
 * History screen is a client component: it needs the type and the labels, and
 * importing them from the server module would drag the Supabase admin client
 * into the browser bundle. Which is not a style point — that client carries
 * the service-role key, and Next refuses the build rather than ship it.
 */

export type Activity = {
  id: string;
  at: string;
  date: string;
  category: string | null;
  description: string;
  who: string | null;
};

/**
 * The categories the log actually carries, in the order a person would scan
 * them.
 *
 * "Actually" is the whole point of this list. It is what the filter chips are
 * built from, so a name in here that nothing ever writes is a chip that always
 * returns an empty screen, and a category written by the code but missing from
 * here has no chip at all — its rows are reachable only under "All", badged
 * with the raw lowercase word.
 *
 * Both had happened. `settings` was a chip nothing ever filed under; `shift`,
 * `backup` and `waste` were written from three different files with nowhere to
 * see them. `movement` was the odd one out — declared, labelled, and written
 * by the inventory screen, which is why it survived the cull; the database now
 * writes to it too when a shelf goes below zero.
 *
 * That last sentence was the bug, written down and shipped anyway. Two
 * unrelated things shared one category: the database's below-zero warnings,
 * and every batch made or shelf counted on the inventory screen. The shelf
 * alert filters by category and nothing else, so a day's ordinary work came
 * back as a day of failures — eight batches and counts reported as "8 shelves
 * stopped adding up" — and following the alert's own advice to recount wrote
 * another row into the same category and made the number worse.
 *
 * `movement` is the database's alone now, and its label says so. Ordinary
 * shelf work is filed under `inventory`, beside "Edited ingredient".
 *
 * If you add a category, add it here. The check in `tests/activity-categories`
 * reads the source of every `activity_log` insert and fails if the two lists
 * have drifted apart again.
 */
export const ACTIVITY_CATEGORIES = [
  "orders",
  "inventory",
  "movement",
  "waste",
  "menu",
  "money",
  "staff",
  "shift",
  "backup",
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  orders: "Orders",
  inventory: "Inventory",
  movement: "Shelf short",
  waste: "Waste",
  menu: "Menu",
  money: "Money",
  staff: "Staff",
  shift: "Shifts",
  backup: "Backup",
};
