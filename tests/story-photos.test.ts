import test from "node:test";
import assert from "node:assert/strict";
import { storyPhotosFrom } from "../src/lib/story-photos.ts";
import { homepagePicks, type Announcement } from "../src/lib/announcements.ts";

/**
 * The Our story deck, and the one thing it must never do.
 *
 * Which is render nothing. The section has a heading, three statistics and a
 * paragraph down the left; a hole where the photograph goes does not read as
 * "no photos yet", it reads as a page that failed to load. Every ordinary
 * path to that hole is covered here, because every one of them is a Tuesday:
 * nothing uploaded, everything switched off for a reshoot, a row saved
 * without its picture.
 */

const row = (over: Partial<Announcement> = {}): Announcement => ({
  id: 1,
  kind: "story",
  title: "Lanterns over the tables",
  body: null,
  starts_at: null,
  ends_at: null,
  is_active: true,
  sort_order: 0,
  pinned: false,
  image_url: "https://example.test/a.jpg",
  video_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

const FALLBACK = { src: "/original.jpg", alt: "The stall" };

test("the stall photo leads, and the owner's are dealt behind it", () => {
  const out = storyPhotosFrom(
    [row({ id: 1 }), row({ id: 2, title: "Ate Len at the counter", image_url: "b.jpg" })],
    FALLBACK
  );
  assert.deepEqual(out, [
    FALLBACK,
    { src: "https://example.test/a.jpg", alt: "Lanterns over the tables" },
    { src: "b.jpg", alt: "Ate Len at the counter" },
  ]);
});

test("uploading the lead photograph again does not deal it twice", () => {
  // The likeliest thing for the owner to try: it is the picture already on
  // the site, and adding it is the obvious way to put it first.
  const out = storyPhotosFrom([row({ image_url: FALLBACK.src, title: "The stall" })], FALLBACK);
  assert.deepEqual(out, [FALLBACK]);
});

test("nothing uploaded, or everything switched off, still shows a photograph", () => {
  assert.deepEqual(storyPhotosFrom([], FALLBACK), [FALLBACK]);
  // A row with no picture is not a card. Dropping it must not leave a hole
  // where the section's photograph should be.
  assert.deepEqual(storyPhotosFrom([row({ image_url: null })], FALLBACK), [FALLBACK]);
});

test("a blank caption still says something to a screen reader", () => {
  // `title` is NOT NULL, which stops it being absent and does nothing at all
  // about it being three spaces.
  assert.equal(storyPhotosFrom([row({ title: "   " })], FALLBACK)[0].alt.trim().length > 0, true);
});

test("a story photo needs no star, unlike everything else on that screen", () => {
  // The star picks which of too many promos gets one of the few homepage
  // slots. The deck has a slot per photograph, so requiring one would be a
  // step that changes nothing — and a reason to think the upload failed.
  const rows = [row({ pinned: false })];
  assert.equal(homepagePicks(rows, "story").length, 1);
  assert.equal(homepagePicks([{ ...row(), kind: "promo" }], "promo").length, 0);
});

test("switched off, scheduled and finished photos stay out of the deck", () => {
  const past = "2020-01-01T00:00:00Z";
  const future = "2099-01-01T00:00:00Z";
  assert.equal(homepagePicks([row({ is_active: false })], "story").length, 0);
  assert.equal(homepagePicks([row({ starts_at: future })], "story").length, 0);
  assert.equal(homepagePicks([row({ ends_at: past })], "story").length, 0);
});

test("the deck is dealt in the order the owner arranged", () => {
  const picks = homepagePicks(
    [
      row({ id: 1, sort_order: 2, image_url: "c.jpg" }),
      row({ id: 2, sort_order: 0, image_url: "a.jpg" }),
      row({ id: 3, sort_order: 1, image_url: "b.jpg" }),
    ],
    "story"
  );
  assert.deepEqual(picks.map((r) => r.image_url), ["a.jpg", "b.jpg", "c.jpg"]);
});
