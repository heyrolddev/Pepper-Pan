import test from "node:test";
import assert from "node:assert/strict";

import {
  homepagePicks,
  homeStateOf,
  stripItems,
  STATE_TONE,
  PLACEMENTS,
  PLACEMENT_LABEL,
  PLACEMENT_HELP,
  type Announcement,
  type Placement,
} from "../src/lib/announcements.ts";

/**
 * Where a promo shows.
 *
 * Two places, and until 0054 the shop could only really pick one of them: the
 * strip took every live promo with no way out, and the card was gated on a
 * star whose tooltip claimed it "held this at the front". So the one sentence
 * the owner kept trying to say — "put this on a card but keep it out of the
 * strip" — had no button.
 */

const promo = (over: Partial<Announcement> = {}): Announcement => ({
  id: 1,
  kind: "promo",
  title: "Free coffee dine-in",
  body: "Every weekday before ten.",
  starts_at: null,
  ends_at: null,
  is_active: true,
  sort_order: 0,
  pinned: false,
  placement: "both",
  image_url: null,
  video_url: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

/* ---------------- the strip ---------------- */

test("a promo set to Homepage only stays out of the scrolling strip", () => {
  const rows = [
    promo({ id: 1, title: "In the strip", placement: "both" }),
    promo({ id: 2, title: "Card only", placement: "home" }),
  ];
  assert.deepEqual(stripItems(rows), ["In the strip"]);
});

test("Strip only and Both both scroll", () => {
  const rows = [
    promo({ id: 1, title: "A", placement: "strip" }),
    promo({ id: 2, title: "B", placement: "both" }),
  ];
  assert.deepEqual(stripItems(rows), ["A", "B"]);
});

test("the strip falls back to the shop's own lines rather than going empty", () => {
  // An empty red band across the homepage reads as a page that failed to
  // load. Taking the only promo out of the strip must not produce one.
  const out = stripItems([promo({ placement: "home" })]);
  assert.ok(out.length >= 3, "expected the default lines back");
  assert.ok(out.includes("Black Pepper Noodles"));
});

/* ---------------- the card ---------------- */

test("a promo set to Strip only never takes a homepage card", () => {
  const rows = [promo({ id: 1, placement: "strip" })];
  assert.deepEqual(homepagePicks(rows, "promo"), []);
});

test("Homepage only and Both both take a card", () => {
  const rows = [
    promo({ id: 1, placement: "home" }),
    promo({ id: 2, placement: "both" }),
  ];
  assert.deepEqual(
    homepagePicks(rows, "promo").map((r) => r.id),
    [1, 2]
  );
});

test("the star no longer decides a promo's card", () => {
  // This is the whole point of 0054. Before it, an unstarred promo could not
  // have a card whatever else was true of it.
  const rows = [promo({ id: 1, pinned: false, placement: "home" })];
  assert.deepEqual(
    homepagePicks(rows, "promo").map((r) => r.id),
    [1]
  );
});

test("a promo with only a title still cannot have a card", () => {
  // Nothing to put on one. Asking for a card does not conjure a description.
  const rows = [promo({ id: 1, body: null, image_url: null, placement: "home" })];
  assert.deepEqual(homepagePicks(rows, "promo"), []);
});

test("the homepage still takes only two cards, in the order set", () => {
  const rows = [
    promo({ id: 1, sort_order: 2, placement: "both" }),
    promo({ id: 2, sort_order: 0, placement: "both" }),
    promo({ id: 3, sort_order: 1, placement: "both" }),
  ];
  assert.deepEqual(
    homepagePicks(rows, "promo").map((r) => r.id),
    [2, 3]
  );
});

test("a scheduled promo takes no card", () => {
  const future = promo({ id: 1, starts_at: "2099-01-01T00:00:00Z" });
  assert.deepEqual(homepagePicks([future], "promo"), []);
});

test("stripItems trusts its caller to have filtered to live promos", () => {
  /**
   * Pinning the contract rather than the behaviour. `stripItems` does NOT
   * check the window — it is handed rows that are already live, by
   * `readLive()` on the homepage and by an explicit `liveStateOf` filter in
   * the editor. Both were checked when this was written.
   *
   * It is worth a test because the failure would be silent and public: a
   * promo scheduled for next month scrolling across the homepage today. If
   * this ever starts failing, a third caller has appeared without the filter
   * — give it one, or move the filter in here.
   */
  const future = promo({ id: 1, starts_at: "2099-01-01T00:00:00Z" });
  assert.deepEqual(stripItems([future]), [future.title]);
});

/* ---------------- what the row says ---------------- */

test("Strip only reads as a choice, not as a promo that missed out", () => {
  const row = promo({ placement: "strip" });
  assert.equal(homeStateOf(row, [row]), "strip");
  assert.equal(STATE_TONE.strip.label, "In the scrolling strip");
});

test("asking for a card with nothing to put on it says exactly that", () => {
  // It used to report "In the scrolling strip" — true, and an answer to a
  // question the owner had not asked. They wanted to know why no card.
  const row = promo({ body: null, image_url: null, placement: "home" });
  assert.equal(homeStateOf(row, [row]), "needs-detail");
  assert.match(STATE_TONE["needs-detail"].label, /description or a picture/);
});

test("a promo that is over the limit is told where to find it", () => {
  const rows = [
    promo({ id: 1, sort_order: 0 }),
    promo({ id: 2, sort_order: 1 }),
    promo({ id: 3, sort_order: 2 }),
  ];
  assert.equal(homeStateOf(rows[2], rows), "listed");
  assert.match(STATE_TONE.listed.label, /All news & promos/);
});

test("a promo on a card reports as being on the homepage", () => {
  const row = promo({ placement: "both" });
  assert.equal(homeStateOf(row, [row]), "live");
});

/* ---------------- the control itself ---------------- */

test("every placement has a label and a line of help", () => {
  for (const p of PLACEMENTS) {
    assert.ok(PLACEMENT_LABEL[p], `${p} has no label`);
    assert.ok(PLACEMENT_HELP[p], `${p} has no help text`);
    assert.notEqual(PLACEMENT_LABEL[p], p, `${p}'s label is the raw value`);
  }
});

test("the three placements are the three the database will accept", () => {
  // The check constraint in 0054 lists these exactly. A fourth added here
  // without a migration would be rejected at save time with an error the
  // owner cannot act on.
  assert.deepEqual([...PLACEMENTS].sort(), ["both", "home", "strip"]);
});

test("the help text says which of the two places each one means", () => {
  const help = (p: Placement) => PLACEMENT_HELP[p].toLowerCase();
  assert.match(help("strip"), /no card/);
  assert.match(help("home"), /kept out of the scrolling strip/);
  assert.match(help("both"), /card/);
});
