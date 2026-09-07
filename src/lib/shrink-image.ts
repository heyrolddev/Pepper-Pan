import { AVATAR_EDGE } from "@/lib/media";

/**
 * Square and shrink a photo in the browser, before it is uploaded.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The shop's brief was "add a size limit so the site doesn't get big or
 * slow". A limit alone would do that, and would also be the worst possible
 * answer for the person holding the phone: they pick the photo they have,
 * are told it is 4.2MB, and are now expected to go and find an image
 * resizer. Most of them simply won't have a profile picture.
 *
 * The size of a profile picture is not a decision a customer should have to
 * make. It is shown as a circle a centimetre across. So the photo is squared,
 * scaled to {@link AVATAR_EDGE} and re-encoded here — a 6MB camera photo
 * leaves the phone at around 40KB, every time, whatever it started as. The
 * limits in `media.ts` then sit behind this as backstops, not as walls, and
 * the upload is quick on the kind of connection a stall's customers use.
 *
 * THREE DETAILS THAT ARE EASY TO GET WRONG
 *
 * `imageOrientation: "from-image"` — `createImageBitmap` ignores EXIF
 * rotation by default, and phone cameras lean on it heavily. Without this,
 * a portrait photo taken on an iPhone arrives on its side, and it looks like
 * the site rotated it.
 *
 * The white fill — the result may be encoded as JPEG, which has no alpha
 * channel. Drawing a transparent PNG onto an untouched canvas and encoding
 * it as JPEG gives you a black square. White is also what the circle sits on
 * in most places it appears.
 *
 * Never upscaling — a 96px picture stays 96px. Blowing it up to 512 makes
 * the file eight times bigger and the photo no clearer.
 */

export type Shrunk = { blob: Blob; type: string };

/** WEBP is a third the size of JPEG at the same quality; JPEG is the fallback. */
const QUALITY = 0.86;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  // Older Safari. An <img> applies EXIF orientation by itself, so there is
  // nothing to ask for here.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file isn't a photo this browser can read."));
      img.src = url;
    });
  } finally {
    // Safe to revoke once decoding has finished either way — the bitmap is
    // already in memory, and a rejection has nothing left to load.
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function squareShrink(file: File, edge = AVATAR_EDGE): Promise<Shrunk> {
  const source = await decode(file);
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;

  try {
    if (!width || !height) {
      throw new Error("That photo came out empty. Try another one.");
    }

    // Centre crop to a square, then scale down — never up.
    const side = Math.min(width, height);
    const out = Math.min(edge, side);

    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser wouldn't let us resize the photo.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out);

    // A canvas asked for a format it cannot write returns PNG without saying
    // so, which is why the type that comes back is trusted over the one asked
    // for.
    const webp = await toBlob(canvas, "image/webp");
    if (webp && webp.type === "image/webp") return { blob: webp, type: webp.type };

    const jpeg = await toBlob(canvas, "image/jpeg");
    if (jpeg) return { blob: jpeg, type: jpeg.type || "image/jpeg" };

    throw new Error("Couldn't prepare that photo. Try a different one.");
  } finally {
    if ("close" in source) source.close();
  }
}
