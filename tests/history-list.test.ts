import test from "node:test";
import assert from "node:assert/strict";

/**
 * The date filtering behind every history list in HQ.
 *
 * The rule under test is the one that is easy to get wrong and impossible to
 * see: a day is compared by slicing the ISO string, not by making a Date.
 * `new Date("2026-09-04")` is midnight UTC — 8am in Manila — so an evening
 * entry compared that way lands on the following day, and the owner sees a
 * shift they know happened on Friday filed under Saturday.
 */

/** The same expression the component uses, exercised on its own. */
const inRange = (iso: string, from: string, to: string) => {
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
};

test("a whole day is included at both ends of the range", () => {
  // 00:05 and 23:55 Manila on the same day, as they are actually stored.
  const early = "2026-09-04T00:05:00+08:00";
  const late = "2026-09-04T23:55:00+08:00";
  for (const iso of [early, late]) {
    assert.ok(inRange(iso, "2026-09-04", "2026-09-04"), `${iso} fell outside its own day`);
  }
});

test("an evening entry is not pushed into the next day", () => {
  // The bug a Date comparison would introduce: 9pm Manila is 1pm UTC on the
  // same date, but midnight-UTC boundaries make this easy to get backwards.
  assert.ok(inRange("2026-09-04T21:00:00+08:00", "2026-09-04", "2026-09-04"));
  assert.equal(inRange("2026-09-04T21:00:00+08:00", "2026-09-05", ""), false);
});

test("an open-ended range works from either side", () => {
  assert.ok(inRange("2026-09-10T10:00:00+08:00", "2026-09-01", ""));
  assert.equal(inRange("2026-08-30T10:00:00+08:00", "2026-09-01", ""), false);
  assert.ok(inRange("2026-08-30T10:00:00+08:00", "", "2026-09-01"));
  assert.equal(inRange("2026-09-10T10:00:00+08:00", "", "2026-09-01"), false);
});

test("no dates means everything passes", () => {
  assert.ok(inRange("2020-01-01T00:00:00+08:00", "", ""));
  assert.ok(inRange("2099-12-31T23:59:00+08:00", "", ""));
});

test("string comparison orders dates correctly across months and years", () => {
  // The reason slicing works at all: ISO dates sort lexically. Worth pinning,
  // because it is the assumption the whole filter rests on.
  assert.ok("2026-09-04" < "2026-09-10");
  assert.ok("2026-09-30" < "2026-10-01");
  assert.ok("2026-12-31" < "2027-01-01");
});
