import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_BUCKET,
  MEDIA_PREFIX,
  checkMedia,
  storagePathOf,
} from "../src/lib/media.ts";

/**
 * What may be uploaded, and — more importantly — what may be deleted.
 *
 * `storagePathOf` is the guard that stops a "remove this photo" turning into
 * a delete of somebody else's file, so it gets adversarial input rather than
 * a happy path.
 */

const publicUrl = (path: string) =>
  `https://x.supabase.co/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;

test("our own upload resolves to its path", () => {
  assert.equal(storagePathOf(publicUrl(`${MEDIA_PREFIX}/abc.jpg`)), `${MEDIA_PREFIX}/abc.jpg`);
});

test("a query string is not part of the path", () => {
  assert.equal(storagePathOf(publicUrl(`${MEDIA_PREFIX}/a.jpg?v=2`)), `${MEDIA_PREFIX}/a.jpg`);
});

test("anything outside our own prefix is refused", () => {
  // A menu photo, someone else's bucket, a hand-typed URL, an empty string.
  assert.equal(storagePathOf(publicUrl("menu/burger.jpg")), null);
  assert.equal(storagePathOf("https://example.com/evil.jpg"), null);
  assert.equal(storagePathOf(""), null);
});

test("traversal out of the prefix is refused", () => {
  assert.equal(storagePathOf(publicUrl(`${MEDIA_PREFIX}/../menu/burger.jpg`)), null);
  assert.equal(storagePathOf(publicUrl(`${MEDIA_PREFIX}/a/../../secret.jpg`)), null);
});

test("a photo is accepted up to the limit and refused past it", () => {
  assert.deepEqual(checkMedia("image/jpeg", 1000), { ok: true, kind: "image", ext: "jpg" });
  assert.equal(checkMedia("image/jpeg", MAX_IMAGE_BYTES).ok, true);
  assert.equal(checkMedia("image/jpeg", MAX_IMAGE_BYTES + 1).ok, false);
});

test("a video is accepted up to its own, larger limit", () => {
  assert.deepEqual(checkMedia("video/mp4", 1000), { ok: true, kind: "video", ext: "mp4" });
  assert.equal(checkMedia("video/mp4", MAX_VIDEO_BYTES + 1).ok, false);
});

test("a .mov is refused with advice, not a shrug", () => {
  const r = checkMedia("video/quicktime", 1000);
  assert.equal(r.ok, false);
  // The person has to know what to do next, or the message is just a wall.
  assert.match(r.ok === false ? r.error : "", /MP4/);
});

test("a PDF is not a photo", () => {
  assert.equal(checkMedia("application/pdf", 1000).ok, false);
});
