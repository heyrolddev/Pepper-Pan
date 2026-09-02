/**
 * Promos and news — the shapes and the rules, with no database in sight.
 *
 * Pure, and in its own file, so both the homepage and HQ agree on what "live"
 * means. The database enforces it too, in the row policy; this is the same
 * rule stated where a screen can use it to explain itself — "scheduled",
 * "finished", "off" — rather than just silently not rendering something.
 */

export type AnnouncementKind = "promo" | "news" | "dine_in" | "coming_soon";

/**
 * The two that fill a fixed slot on the page rather than a list.
 *
 * The gold band has room for one line each. More than one may be written —
 * next month's arrival can sit there ready — but only the first one that is
 * live is shown, and the editor says so rather than letting somebody wonder
 * why their second dine-in offer never appeared.
 */
export const SLOT_KINDS: AnnouncementKind[] = ["dine_in", "coming_soon"];
export const isSlotKind = (k: AnnouncementKind) => SLOT_KINDS.includes(k);

export type Announcement = {
  id: number;
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
  /** A photo, a video, both or neither. Null when there is none. */
  image_url: string | null;
  video_url: string | null;
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
  dine_in: "Dine-in special",
  coming_soon: "Coming soon",
};

export const KIND_ADD: Record<AnnouncementKind, string> = {
  promo: "+ New promo",
  news: "+ Add news",
  dine_in: "+ New dine-in special",
  coming_soon: "+ New coming soon",
};

export const KIND_NEW_TITLE: Record<AnnouncementKind, string> = {
  promo: "New promo",
  news: "New news post",
  dine_in: "New dine-in special",
  coming_soon: "New coming soon",
};

export const KIND_BLURB: Record<AnnouncementKind, string> = {
  promo:
    "Short and loud. Scrolls across the top of the homepage and shows as a card. Best under about five words.",
  news:
    "Dated and informational — a closure, a new dish, a change of hours. Shows as a list, newest first, and each one opens to its own page.",
  dine_in:
    "The big line in the gold band. What somebody eating at the stall gets that a take-out order doesn't. Only the first one that's on is shown.",
  coming_soon:
    "The line under it — what's arriving but isn't on the menu yet. Give it an end date and it takes itself down the day it lands. Only the first one that's on is shown.",
};

/** Does it carry a picture? Decides whether a card gets a media block. */
export const hasMedia = (row: Announcement) => Boolean(row.image_url || row.video_url);

/**
 * Is there more to this than its title?
 *
 * The strip lines seeded with this table — "Black Pepper Noodles", "Giant Ji
 * Pai" — are promo rows because the scrolling strip is what they are for.
 * They are not offers, and shown as cards they became four yellow boxes
 * containing a heading and the words "read more", which led to a page
 * repeating the heading. A card has to earn its place with a description or
 * a picture.
 */
export const hasDetail = (row: Announcement) => Boolean(row.body || hasMedia(row));

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

/**
 * Where a slot kind sits in the queue.
 *
 * Live but not first means written, in date, and still not on the page —
 * which without a word for it looks exactly like a bug.
 */
export function queuedBehind(row: Announcement, all: Announcement[], now = new Date()) {
  if (!isSlotKind(row.kind)) return false;
  const live = all.filter((a) => a.kind === row.kind && liveStateOf(a, now) === "live");
  return live.length > 1 && live[0]?.id !== row.id;
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
