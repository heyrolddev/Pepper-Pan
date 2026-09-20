import type { Announcement } from "@/lib/announcements";

/**
 * The photographs in the Our story deck.
 *
 * They are `announcements` rows of kind `story` — see migration 0047 for why
 * they live in that table rather than one of their own. This turns them into
 * what the deck component wants, and it is pure so the one rule worth getting
 * right can be tested without a database.
 *
 * ── The rule, and why it went round the houses ───────────────────────────
 *
 * `fallback` — the stall photograph the section has shown since the beginning
 * — appears when, and only when, there is nothing in HQ. Once the owner has
 * added photos, the deck is entirely theirs, in the order they arranged it.
 *
 * It briefly always led the deck, because the owner asked for that picture to
 * come first. The right answer to that turned out to be different: they had
 * ALREADY uploaded that same photograph in HQ, so a built-in copy pinned to
 * the front showed the stall twice in a three-card deck. What they actually
 * wanted was to choose the order — which is now the ↑↓ on each row, and which
 * puts their own copy first without a second mechanism that can disagree
 * with it.
 *
 * What the fallback is still for is the empty case, and it is not a rare one:
 * nothing uploaded yet, everything switched off for a reshoot, a storage
 * outage, a migration not yet run. A homepage that says "Our story" beside a
 * hole reads as a page that failed to load, not as a shop with no
 * photographs.
 */

export type StoryPhoto = { src: string; alt: string };

export function storyPhotosFrom(
  rows: Announcement[],
  fallback: StoryPhoto
): StoryPhoto[] {
  const photos = rows
    // The deck renders an image and nothing else, so a row without one is not
    // a card — it is a black square with a caption nobody can see.
    .filter((r) => Boolean(r.image_url))
    .map((r) => ({
      src: r.image_url!,
      // `title` is required by the table, but "required" and "filled in with
      // something useful" are different things, and a row saved with spaces
      // in it would announce itself to a screen reader as nothing at all.
      alt: r.title.trim() || "A photo inside Pepper Pan",
    }));

  return photos.length > 0 ? photos : [fallback];
}
