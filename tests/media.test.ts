import test from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_EDGE,
  AVATAR_PREFIX,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_PICK_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_BUCKET,
  MEDIA_PREFIX,
  checkAvatarPick,
  checkAvatarUpload,
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

/* ------------------------------------------------------------------ *
 * The limit the app promises has to be the limit it enforces
 *
 * A video between the Server Action body cap and MAX_VIDEO_BYTES used to be
 * refused by the framework before any of this code ran: the owner was told
 * videos may be 25MB, and a 12MB one failed with no explanation. The file no
 * longer travels through a Server Action at all, which is what actually fixed
 * it — this guards the promise itself.
 * ------------------------------------------------------------------ */

test("a phone-sized video is accepted, not silently over a hidden cap", () => {
  // 12MB — bigger than any request-body limit worth setting, and a perfectly
  // ordinary fifteen seconds from a phone.
  const check = checkMedia("video/mp4", 12 * 1024 * 1024);
  assert.equal(check.ok, true);
  if (check.ok) assert.equal(check.kind, "video");
});

test("the stated video limit is the one enforced", () => {
  assert.equal(checkMedia("video/mp4", MAX_VIDEO_BYTES).ok, true, "exactly at the limit");
  assert.equal(checkMedia("video/mp4", MAX_VIDEO_BYTES + 1).ok, false, "one byte over");
});

test("a rejection says how big it was and what to do", () => {
  const check = checkMedia("video/mp4", 40 * 1024 * 1024);
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.match(check.error, /40\.0MB/, "names the actual size");
    assert.match(check.error, /trim/i, "says what to do about it");
  }
});

test("an iPhone .mov is refused with instructions an owner can follow", () => {
  const check = checkMedia("video/quicktime", 5 * 1024 * 1024);
  assert.equal(check.ok, false, "quicktime does not play everywhere");
  if (!check.ok) assert.match(check.error, /iPhone/, "tells them how to fix it on the phone they have");
});

/* ============================================================
 * Profile pictures
 *
 * Two different questions, and conflating them is the bug this guards
 * against. `checkAvatarPick` is asked about the file on the phone, which is
 * about to be shrunk and may therefore be large. `checkAvatarUpload` is asked
 * on the server about the shrunk result, and is the one that decides what
 * ends up in the bucket — so it must not accept a four-megabyte "avatar"
 * just because a browser claimed to have resized it.
 * ============================================================ */

test("a phone photo may be picked even though it is far too big to store", () => {
  const picked = checkAvatarPick("image/jpeg", 6 * 1024 * 1024);
  assert.equal(picked.ok, true);
  // The same bytes would never be accepted for storage.
  assert.equal(checkAvatarUpload("image/jpeg", 6 * 1024 * 1024).ok, false);
});

test("something larger than any camera produces is refused at the pick", () => {
  assert.equal(checkAvatarPick("image/jpeg", MAX_AVATAR_PICK_BYTES + 1).ok, false);
  assert.equal(checkAvatarPick("image/jpeg", MAX_AVATAR_PICK_BYTES).ok, true);
});

test("only photos may be picked as a profile picture", () => {
  assert.equal(checkAvatarPick("video/mp4", 1000).ok, false);
  assert.equal(checkAvatarPick("application/pdf", 1000).ok, false);
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
    assert.equal(checkAvatarPick(type, 1000).ok, true, type);
  }
});

test("the stored avatar limit is the one the server enforces", () => {
  assert.equal(checkAvatarUpload("image/webp", MAX_AVATAR_BYTES).ok, true);
  assert.equal(checkAvatarUpload("image/webp", MAX_AVATAR_BYTES + 1).ok, false);
});

test("a GIF is not stored as a GIF — the shrink flattens it first", () => {
  // Accepting an animated GIF for storage would put a moving image, at GIF's
  // file sizes, into a row of review cards. It is picked, then re-encoded.
  assert.equal(checkAvatarPick("image/gif", 1000).ok, true);
  assert.equal(checkAvatarUpload("image/gif", 1000).ok, false);
});

test("a stored avatar is squared, so its edge is the only size that matters", () => {
  // A guard on the constant rather than the maths: 512 is what the field's
  // copy promises the customer, and the two must not drift.
  assert.equal(AVATAR_EDGE, 512);
});

/* An avatar path is scoped to one account's own folder, which is what stops
 * "remove my photo" reaching anybody else's. */

test("an avatar resolves inside its owner's folder", () => {
  const mine = `${AVATAR_PREFIX}/user-1`;
  assert.equal(storagePathOf(publicUrl(`${mine}/a.webp`), mine), `${mine}/a.webp`);
});

test("one account cannot name another account's avatar", () => {
  const mine = `${AVATAR_PREFIX}/user-1`;
  assert.equal(storagePathOf(publicUrl(`${AVATAR_PREFIX}/user-2/a.webp`), mine), null);
});

test("an avatar URL is not a promo path, and a promo path is not an avatar", () => {
  const mine = `${AVATAR_PREFIX}/user-1`;
  assert.equal(storagePathOf(publicUrl(`${MEDIA_PREFIX}/a.jpg`), mine), null);
  assert.equal(storagePathOf(publicUrl(`${mine}/a.webp`)), null);
});

test("traversal out of an avatar folder is refused", () => {
  const mine = `${AVATAR_PREFIX}/user-1`;
  assert.equal(storagePathOf(publicUrl(`${mine}/../user-2/a.webp`), mine), null);
});

test("a URL somewhere else entirely is not a stored avatar", () => {
  const mine = `${AVATAR_PREFIX}/user-1`;
  assert.equal(storagePathOf(`https://evil.example/${mine}/a.webp`, mine), null);
});
