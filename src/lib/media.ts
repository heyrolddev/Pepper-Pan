/**
 * What may be uploaded, and where it lands.
 *
 * Pure and in its own file so the same rules are used by the browser (to
 * refuse a file before spending a minute uploading it) and by the server (to
 * refuse it for real). A limit enforced in only one of those two places is
 * either a bad experience or not a limit.
 */

/** The shop's existing public bucket — the one the menu photos already use. */
export const MEDIA_BUCKET = "PepperPan";

/** Kept apart from the menu photos so a tidy-up of one never catches the other. */
export const MEDIA_PREFIX = "announcements";

/** Profile pictures. Their own folder for the same reason. */
export const AVATAR_PREFIX = "avatars";

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Only what a browser will actually play.
 *
 * `.mov` is deliberately absent even though phones record it: a video the
 * shop can see in its own gallery but a customer's browser silently refuses
 * to play is worse than being told, at upload time, to save it as MP4.
 */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export const ACCEPT_ATTR = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(",");

export function humanBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`;
}

export type MediaKind = "image" | "video";

/**
 * Either what it is, or why it can't be used — in words, not a code.
 *
 * A discriminated union on `ok` rather than a maybe-absent `error`, so the
 * caller cannot read `.ext` off a rejection and have it typecheck.
 */
export type MediaCheck =
  | { ok: true; kind: MediaKind; ext: string }
  | { ok: false; error: string };

export function checkMedia(type: string, size: number): MediaCheck {
  const imageExt = IMAGE_TYPES[type];
  if (imageExt) {
    return size > MAX_IMAGE_BYTES
      ? {
          ok: false,
          error: `That photo is ${humanBytes(size)}. Keep photos under ${humanBytes(
            MAX_IMAGE_BYTES
          )} — a bigger one only makes the page slower to load, it doesn't look better.`,
        }
      : { ok: true, kind: "image", ext: imageExt };
  }

  const videoExt = VIDEO_TYPES[type];
  if (videoExt) {
    return size > MAX_VIDEO_BYTES
      ? {
          ok: false,
          error: `That video is ${humanBytes(size)}. Keep videos under ${humanBytes(
            MAX_VIDEO_BYTES
          )} — trim it to a few seconds, which is all anybody watches on a homepage anyway.`,
        }
      : { ok: true, kind: "video", ext: videoExt };
  }

  if (type.startsWith("video/")) {
    return {
      ok: false,
      error:
        "That video needs to be MP4 — the one every phone and browser can play. " +
        "On an iPhone: open the clip in Photos, tap Edit then Done to save a copy, " +
        "and pick that. On Android it is already MP4.",
    };
  }
  return {
    ok: false,
    error: "That has to be a photo (JPG, PNG, WEBP, GIF) or a video (MP4, WEBM).",
  };
}

/**
 * The object's path inside the bucket, recovered from its public URL.
 *
 * Needed to delete a file that has been replaced. Storing only the URL and
 * working backwards keeps one source of truth on the row; storing both the
 * URL and the path invites them to disagree.
 *
 * Returns null for anything that isn't one of our own uploads, which is what
 * stops a hand-typed URL turning a "remove photo" into a delete of somebody
 * else's file.
 */
export function storagePathOf(
  publicUrl: string,
  prefix: string = MEDIA_PREFIX
): string | null {
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return null;
  const path = publicUrl.slice(at + marker.length).split("?")[0];
  return path.startsWith(`${prefix}/`) && !path.includes("..") ? path : null;
}

/* ============================================================
 * Profile pictures
 *
 * A separate set of rules from the promo photos, because the shape of the
 * problem is different. A promo photo is looked at; an avatar is a 40-pixel
 * circle next to a name. Uploading two megabytes to fill forty pixels is
 * exactly how a site gets slow, and the shop asked for it not to.
 *
 * So the answer here is not a smaller limit — a limit only moves the problem
 * onto the customer, who now has to go and resize a photo they took on their
 * phone. The photo is squared and shrunk in the browser before a single byte
 * leaves it: a 6MB phone picture becomes about 40KB, always, whatever it
 * started as. The size limits below are then backstops rather than walls.
 * ============================================================ */

/** What the stored square is. 512 covers a retina screen at any size we show. */
export const AVATAR_EDGE = 512;

/**
 * What may be chosen. Generous on purpose — it is the file on the phone, and
 * it is about to be shrunk. Big enough to accept any photo a phone takes,
 * small enough that we never ask a browser to decode something absurd.
 */
export const MAX_AVATAR_PICK_BYTES = 12 * 1024 * 1024;

/**
 * What may be stored. The shrink lands two orders of magnitude below this,
 * so reaching it means something went wrong rather than something was big.
 */
export const MAX_AVATAR_BYTES = 1024 * 1024;

/** Encoded to WEBP where the browser can, JPEG where it cannot. */
export const AVATAR_STORED_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** A GIF is accepted and flattened to its first frame — an avatar holds still. */
export const AVATAR_ACCEPT = Object.keys(IMAGE_TYPES).join(",");

/** Can this file be picked as a profile picture? */
export function checkAvatarPick(type: string, size: number): MediaCheck {
  const ext = IMAGE_TYPES[type];
  if (!ext) {
    return {
      ok: false,
      error: "A profile picture has to be a photo — JPG, PNG, WEBP or GIF.",
    };
  }
  if (size > MAX_AVATAR_PICK_BYTES) {
    return {
      ok: false,
      error: `That photo is ${humanBytes(size)}, which is larger than any phone camera produces. Keep it under ${humanBytes(
        MAX_AVATAR_PICK_BYTES
      )}.`,
    };
  }
  return { ok: true, kind: "image", ext };
}

/**
 * Can this be stored as a profile picture?
 *
 * Asked of the shrunk result, on the server, before a token is issued. The
 * browser did the shrinking, so this is the check that does not trust it.
 */
export function checkAvatarUpload(type: string, size: number): MediaCheck {
  const ext = AVATAR_STORED_TYPES[type];
  if (!ext) {
    return { ok: false, error: "That is not an image this site can store." };
  }
  if (size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      error: `That came to ${humanBytes(size)} after resizing, over the ${humanBytes(
        MAX_AVATAR_BYTES
      )} a profile picture may be. Try a different photo.`,
    };
  }
  return { ok: true, kind: "image", ext };
}
