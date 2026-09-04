import test from "node:test";
import assert from "node:assert/strict";
import { homepagePicks, HOME_LIMIT, type Announcement } from "../src/lib/announcements.ts";

/**
 * What reaches the homepage.
 *
 * The star is the switch now, not a tie-breaker. That is a behaviour change
 * with a quiet failure mode: if an unstarred row can still slip through when
 * there is room, the owner clears the star, reloads, and the post is still
 * there — which reads as the site ignoring them.
 */

let n = 0;
const row = (over: Partial<Announcement> = {}): Announcement =>
  ({
    id: ++n,
    kind: "news",
    title: `Post ${n}`,
    body: "Something worth saying.",
    starts_at: null,
    ends_at: null,
    is_active: true,
    sort_order: n,
    pinned: false,
    image_url: null,
    video_url: null,
    created_at: new Date(2026, 0, n).toISOString(),
    updated_at: new Date(2026, 0, n).toISOString(),
    ...over,
  }) as Announcement;

test("nothing starred means nothing on the homepage", () => {
  const all = [row(), row(), row()];
  assert.deepEqual(homepagePicks(all, "news"), []);
});

test("only the starred rows appear, however much room there is", () => {
  const starred = row({ pinned: true, title: "Starred" });
  const all = [row(), starred, row()];
  const picks = homepagePicks(all, "news");
  assert.equal(picks.length, 1);
  assert.equal(picks[0].title, "Starred");
});

test("an inactive row cannot reach the homepage even when starred", () => {
  // The star says "put this on the homepage"; being live is still the
  // precondition. A finished promo with a star left on it must not come back.
  const all = [row({ pinned: true, is_active: false })];
  assert.deepEqual(homepagePicks(all, "news"), []);
});

test("the per-kind limit still caps a pile of starred rows", () => {
  const many = Array.from({ length: 10 }, () => row({ pinned: true }));
  assert.equal(homepagePicks(many, "news").length, HOME_LIMIT.news);
});

test("news is newest first, so the newest starred post is reachable", () => {
  const older = row({ pinned: true, created_at: new Date(2026, 0, 1).toISOString() });
  const newer = row({ pinned: true, created_at: new Date(2026, 5, 1).toISOString() });
  const picks = homepagePicks([older, newer], "news");
  assert.equal(picks[0].id, newer.id);
});

test("a promo with only a title never takes a card slot", () => {
  // Those rows exist for the scrolling strip. Starring one should not turn
  // it into a card with a heading and nothing under it.
  const bare = row({ kind: "promo", pinned: true, body: null });
  assert.deepEqual(homepagePicks([bare], "promo"), []);
});

test("each kind is judged on its own stars", () => {
  const all = [
    row({ kind: "promo", pinned: true }),
    row({ kind: "news", pinned: false }),
  ];
  assert.equal(homepagePicks(all, "promo").length, 1);
  assert.equal(homepagePicks(all, "news").length, 0);
});
