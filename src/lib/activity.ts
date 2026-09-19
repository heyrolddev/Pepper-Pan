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

/** The categories the log actually carries, in the order a person would scan them. */
export const ACTIVITY_CATEGORIES = [
  "orders",
  "inventory",
  "movement",
  "menu",
  "money",
  "staff",
  "settings",
] as const;

export const CATEGORY_LABEL: Record<string, string> = {
  orders: "Orders",
  inventory: "Inventory",
  movement: "Stock moved",
  menu: "Menu",
  money: "Money",
  staff: "Staff",
  settings: "Settings",
};
