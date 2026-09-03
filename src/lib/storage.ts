import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { IMAGE_TYPES, MEDIA_BUCKET, checkMedia } from "@/lib/media";

/**
 * The rules for what may be uploaded live in `media.ts`, not here.
 *
 * This file used to restate them, and the two copies had drifted: a menu
 * photo could be 8MB and a promo photo 5MB, a promo could be a GIF and a menu
 * photo could not — and the "over 8MB" in the rejection message was a third
 * copy of the number, written out as English. None of that was decided; it is
 * just what happens when the same question is answered in two places.
 *
 * One answer now. If a limit should differ by surface, that is a real product
 * decision and belongs in `media.ts` as a named thing, not as a second
 * constant that quietly disagrees.
 */

export function extensionFor(type: string) {
  return IMAGE_TYPES[type] ?? "jpg";
}

export function validateImage(file: unknown): { error: string } | { file: File } {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  const check = checkMedia(file.type, file.size);
  // A video passes checkMedia but is not an image, and this is the image path.
  if (!check.ok) return { error: check.error };
  if (check.kind !== "image") {
    return { error: "That has to be a photo — JPG, PNG, WEBP or GIF." };
  }
  return { file };
}

/**
 * Uploads to the shop's bucket and returns the public URL.
 *
 * Callers are responsible for deciding *who* may upload — this only moves
 * bytes. It prefers the service-role client, which bypasses storage RLS: the
 * bucket's staff-write policy proved unreliable on the live project, and a
 * customer uploading a payment receipt is legitimately not staff. Falls back
 * to the caller's own session where no service-role key is configured.
 */
export async function uploadImage(
  file: File,
  path: string
): Promise<{ error: string } | { url: string }> {
  const sessionClient = await createClient();
  const client = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : sessionClient;

  const { error } = await client.storage
    .from(MEDIA_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    return {
      error: `Upload failed: ${error.message}. If this mentions permissions, add SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings.`,
    };
  }

  const {
    data: { publicUrl },
  } = client.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: publicUrl };
}
