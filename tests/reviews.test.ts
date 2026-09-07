import test from "node:test";
import assert from "node:assert/strict";
import { displayName, manilaMidday, prepareRelayedReview } from "../src/lib/reviews.ts";

/**
 * The relay form's rules, and the date conversion behind them.
 *
 * The date is the part worth testing hardest. The owner types a calendar day
 * in Apalit; it is stored as an instant in UTC and read back by a formatter
 * pinned to Manila. Get that wrong by eight hours and every relayed review
 * is filed on the wrong day — quietly, and only visibly weeks later when the
 * timeline reads oddly.
 */

const ok = (day: string) => {
  const at = manilaMidday(day);
  assert.ok(at, `${day} should be a real date`);
  return at;
};

test("a typed day is stored as the middle of that day in Manila", () => {
  // 12:00 in UTC+8 is 04:00 UTC on the same date.
  assert.equal(ok("2026-03-04"), "2026-03-04T04:00:00.000Z");
});

test("the stored instant reads back as the day that was typed", () => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" });
  for (const day of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    assert.equal(fmt.format(new Date(ok(day))), day);
  }
});

test("midnight would have been the previous day in UTC — midday is not", () => {
  // The bug this choice avoids, stated as a test so nobody "simplifies" it.
  assert.equal(new Date("2026-03-04T00:00:00+08:00").toISOString().slice(0, 10), "2026-03-03");
  assert.equal(ok("2026-03-04").slice(0, 10), "2026-03-04");
});

test("a day that does not exist is refused, not rolled forward", () => {
  assert.equal(manilaMidday("2026-02-31"), null);
  assert.equal(manilaMidday("2026-13-01"), null);
});

test("anything that is not a plain date is refused", () => {
  for (const bad of ["", "today", "4/3/2026", "2026-3-4", "2026-03-04T10:00:00Z"]) {
    assert.equal(manilaMidday(bad), null);
  }
});

test("a name and a rating are the two things it cannot do without", () => {
  const base = { authorName: "Maria", rating: 5, comment: "", receivedOn: "" };
  assert.ok("error" in prepareRelayedReview({ ...base, authorName: " " }));
  assert.ok("error" in prepareRelayedReview({ ...base, authorName: "M" }));
  assert.ok("error" in prepareRelayedReview({ ...base, rating: 0 }));
  assert.ok("error" in prepareRelayedReview({ ...base, rating: 6 }));
  assert.ok("error" in prepareRelayedReview({ ...base, rating: 4.5 }));
  assert.ok("review" in prepareRelayedReview(base));
});

test("the name is tidied rather than rejected for spacing", () => {
  const res = prepareRelayedReview({
    authorName: "  Maria   Clara  ",
    rating: 4,
    comment: "",
    receivedOn: "",
  });
  assert.ok("review" in res);
  assert.equal(res.review.authorName, "Maria Clara");
});

test("an empty comment is stored as nothing, not as an empty string", () => {
  const res = prepareRelayedReview({
    authorName: "Ana",
    rating: 5,
    comment: "   ",
    receivedOn: "",
  });
  assert.ok("review" in res);
  assert.equal(res.review.comment, null);
});

test("a blank date means today, which the database decides", () => {
  const res = prepareRelayedReview({
    authorName: "Ana",
    rating: 5,
    comment: "Ang sarap!",
    receivedOn: "",
  });
  assert.ok("review" in res);
  assert.equal(res.review.createdAt, null);
});

test("a review dated in the future is a typo and is refused", () => {
  const now = Date.parse("2026-03-04T12:00:00+08:00");
  assert.ok("error" in prepareRelayedReview(
    { authorName: "Ana", rating: 5, comment: "", receivedOn: "2026-03-06" },
    now
  ));
  // Today itself still passes — midday today is never "the future".
  assert.ok("review" in prepareRelayedReview(
    { authorName: "Ana", rating: 5, comment: "", receivedOn: "2026-03-04" },
    now
  ));
});

test("a review from months ago is fine — that is the whole point", () => {
  const now = Date.parse("2026-03-04T12:00:00+08:00");
  assert.ok("review" in prepareRelayedReview(
    { authorName: "Ana", rating: 5, comment: "", receivedOn: "2025-11-20" },
    now
  ));
});

test("a comment over a thousand characters is refused", () => {
  const res = prepareRelayedReview({
    authorName: "Ana",
    rating: 5,
    comment: "x".repeat(1001),
    receivedOn: "",
  });
  assert.ok("error" in res);
});

test("a relayed name shows as a first name, like every other author", () => {
  assert.equal(displayName("Maria Clara de los Santos"), "Maria");
  assert.equal(displayName(null), "A customer");
  assert.equal(displayName("   "), "A customer");
});
