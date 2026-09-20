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
 * The photograph of the stall itself — lanterns over the tables, somebody at
 * the counter — always leads, and everything the owner adds is dealt behind
 * it. It was the other way round at first: uploads REPLACED it, on the
 * reasoning that otherwise there is a picture on the homepage no screen in HQ
 * can remove. The owner asked for the opposite, and they are right about
 * their own shop — that picture is what the section is about, and it should
 * be the one a customer sees before they touch anything.
 *
 * It also means the section can never be empty, which matters more than it
 * sounds: a homepage that says "Our story" beside a hole reads as a page that
 * failed to load, not as a shop with no photographs yet. The ways to end up
 * there are all ordinary — nothing uploaded, everything switched off for a
 * reshoot, a storage outage, a migration not yet run.
 *
 * The cost is that the lead photograph is not removable from HQ. That is a
 * one-line change here the day the shop wants a different one.
 */

export type StoryPhoto = { src: string; alt: string };

export function storyPhotosFrom(
  rows: Announcement[],
  lead: StoryPhoto
): StoryPhoto[] {
  const added = rows
    // The deck renders an image and nothing else, so a row without one is not
    // a card — it is a black square with a caption nobody can see.
    .filter((r) => Boolean(r.image_url))
    // Uploading the lead photograph again in HQ should not deal it twice. It
    // is the likeliest thing for the owner to try, because it is the picture
    // already on the site and the obvious way to "add" it.
    .filter((r) => r.image_url !== lead.src)
    .map((r) => ({
      src: r.image_url!,
      // `title` is required by the table, but "required" and "filled in with
      // something useful" are different things, and a row saved with spaces
      // in it would announce itself to a screen reader as nothing at all.
      alt: r.title.trim() || "A photo inside Pepper Pan",
    }));

  return [lead, ...added];
}
