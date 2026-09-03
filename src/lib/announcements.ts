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
  /** Held at the front of its kind on the homepage. */
  pinned: boolean;
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
    "What's arriving but isn't on the menu yet. Shows under the gold band as a card with its picture. Give it an end date and it takes itself down the day it lands. The first two that are on are shown.",
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

/** How many of each the homepage has room for. */
export const HOME_LIMIT: Record<AnnouncementKind, number> = {
  promo: 2,
  news: 3,
  dine_in: 1,
  // Two, because what is arriving is usually a pair — wings and pops — and
  // announcing them one at a time makes the second look like an afterthought.
  coming_soon: 2,
};

/**
 * Exactly what the homepage shows, in the order it shows it.
 *
 * One function, used by the homepage to render and by the editor to label —
 * so the badge that says "On the homepage" cannot disagree with the homepage.
 * They disagreed before: the editor called every live row live, while the page
 * silently took three of them.
 *
 * Pinned first. Then the natural order for the kind, which is NOT the same
 * for all of them:
 *
 *   news  — newest first. It is news. Reading it by a sort order somebody set
 *           weeks ago is how the newest post ended up unreachable.
 *   the rest — the order the owner arranged, because the strip and the band
 *           are arrangements rather than feeds.
 *
 * A promo also has to have something to say beyond its title before it can
 * take a card slot; the strip lines are promo rows and would otherwise fill
 * both slots with a heading and nothing else.
 */
export function homepagePicks(
  all: Announcement[],
  kind: AnnouncementKind,
  now = new Date()
): Announcement[] {
  const live = all.filter((r) => r.kind === kind && liveStateOf(r, now) === "live");
  const eligible = kind === "promo" ? live.filter(hasDetail) : live;

  const newest = (a: Announcement, b: Announcement) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

  const natural =
    kind === "news"
      ? [...eligible].sort(newest)
      : [...eligible].sort((a, b) => a.sort_order - b.sort_order || newest(a, b));

  return [
    ...natural.filter((r) => r.pinned),
    ...natural.filter((r) => !r.pinned),
  ].slice(0, HOME_LIMIT[kind]);
}

/**
 * Why a row is, or isn't, on the homepage — in words the shop can act on.
 *
 * "Listed" is the one that did not exist before and needed to: live, correct,
 * and simply further down the queue than the homepage has room for. Calling
 * that "On the homepage" is what hid the bug for a fortnight.
 */
export type HomeState = LiveState | "listed" | "queued" | "strip";

export function homeStateOf(
  row: Announcement,
  all: Announcement[],
  now = new Date()
): HomeState {
  const state = liveStateOf(row, now);
  if (state !== "live") return state;
  if (homepagePicks(all, row.kind, now).some((r) => r.id === row.id)) return "live";

  // A promo with nothing but a title never gets a card and is left off the
  // news page too — it exists for the scrolling strip. Saying "in All news &
  // promos" about it would send the owner looking for it somewhere it is not.
  if (row.kind === "promo" && !hasDetail(row)) return "strip";

  return isSlotKind(row.kind) ? "queued" : "listed";
}

export const STATE_TONE: Record<HomeState, { label: string; chip: string }> = {
  live: { label: "On the homepage", chip: "bg-jade-600 text-cream-50" },
  listed: { label: "In All news & promos", chip: "bg-ink-950/[0.07] text-ink-800/70" },
  strip: { label: "In the scrolling strip", chip: "bg-ink-950/[0.07] text-ink-800/70" },
  queued: { label: "Next up", chip: "bg-ink-950/[0.07] text-ink-800/70" },
  scheduled: { label: "Scheduled", chip: "bg-brand-600 text-cream-50" },
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
