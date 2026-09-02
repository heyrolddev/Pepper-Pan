/**
 * Promos and news — the shapes and the rules, with no database in sight.
 *
 * Pure, and in its own file, so both the homepage and HQ agree on what "live"
 * means. The database enforces it too, in the row policy; this is the same
 * rule stated where a screen can use it to explain itself — "scheduled",
 * "finished", "off" — rather than just silently not rendering something.
 */

export type AnnouncementKind = "promo" | "news";

export type Announcement = {
  id: number;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * Section headings and buttons, spelled out per kind rather than assembled.
 *
 * "News" is already plural and has no singular, so anything that appends an
 * "s" or prefixes "a" produces "Newss" and "a news". Two short tables cost
 * less than the rule that would be needed to avoid that.
 */
export const KIND_PLURAL: Record<AnnouncementKind, string> = {
  promo: "Promos",
  news: "News",
};

export const KIND_ADD: Record<AnnouncementKind, string> = {
  promo: "+ New promo",
  news: "+ Add news",
};

export const KIND_NEW_TITLE: Record<AnnouncementKind, string> = {
  promo: "New promo",
  news: "New news post",
};

export const KIND_BLURB: Record<AnnouncementKind, string> = {
  promo:
    "Short and loud. Scrolls across the top of the homepage and shows as a card. Best under about five words.",
  news:
    "Dated and informational — a closure, a new dish, a change of hours. Shows as a list, newest first.",
};

/** Why something isn't on the homepage, in the shop's words. */
export type LiveState = "live" | "scheduled" | "finished" | "off";

export function liveStateOf(a: Announcement, now = new Date()): LiveState {
  if (!a.is_active) return "off";
  if (a.starts_at && new Date(a.starts_at) > now) return "scheduled";
  // Exclusive at the end, matching the row policy: an announcement whose
  // window closes at midnight is gone AT midnight, not during it.
  if (a.ends_at && new Date(a.ends_at) <= now) return "finished";
  return "live";
}

export const STATE_TONE: Record<LiveState, { label: string; chip: string }> = {
  live: { label: "On the homepage", chip: "bg-jade-600 text-cream-50" },
  scheduled: { label: "Scheduled", chip: "bg-gold-400 text-ink-950" },
  finished: { label: "Finished", chip: "bg-ink-950/10 text-ink-800/60" },
  off: { label: "Off", chip: "bg-ink-950/10 text-ink-800/60" },
};

/**
 * The strip that scrolls across the homepage.
 *
 * Falls back to the shop's original five lines when nothing is live. A stall
 * with no promo running still wants the strip saying what it sells — an empty
 * band of red across the homepage looks like the page failed to load, which
 * is a worse outcome than a promo nobody is running.
 */
export const DEFAULT_STRIP = [
  "Black Pepper Noodles",
  "Made Fresh Daily",
  "Free Coffee Dine-In",
  "Giant Ji Pai",
  "Taiwan Milktea",
];

export function stripItems(promos: Announcement[]): string[] {
  const live = promos.map((p) => p.title.trim()).filter(Boolean);
  return live.length > 0 ? live : DEFAULT_STRIP;
}
