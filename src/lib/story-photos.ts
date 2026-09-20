import type { Announcement } from "@/lib/announcements";

/**
 * The photographs in the Our story deck.
 *
 * They are `announcements` rows of kind `story` — see migration 0047 for why
 * they live in that table rather than one of their own. This turns them into
 * what the deck component wants, and it is pure so the one rule worth getting
 * right can be tested without a database.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 * The section must never be empty. A homepage that says "Our story" beside a
 * hole is worse than one showing the same photograph it showed last year, and
 * the ways to end up with a hole are all ordinary: nothing uploaded yet, every
 * photo switched off for a reshoot, a storage outage, a migration not yet run.
 *
 * So `fallback` — the stall photo that has been there since the beginning — is
 * used when, and only when, there is nothing else. Once the owner adds their
 * own, theirs are the deck and the old one steps aside, because otherwise
 * there would be a picture on the homepage that no screen in HQ can remove.
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
