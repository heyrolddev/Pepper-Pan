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
        "Save that video as MP4 — it's the one every phone and browser can play. Most editors have it under Export or Share.",
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
export function storagePathOf(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return null;
  const path = publicUrl.slice(at + marker.length).split("?")[0];
  return path.startsWith(`${MEDIA_PREFIX}/`) && !path.includes("..") ? path : null;
}
