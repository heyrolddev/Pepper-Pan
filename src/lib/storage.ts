import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET = "PepperPan";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function extensionFor(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export function validateImage(file: unknown): { error: string } | { file: File } {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image first." };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "Use a JPG, PNG or WebP image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "That image is over 8MB — please use a smaller one." };
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
    .from(BUCKET)
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
  } = client.storage.from(BUCKET).getPublicUrl(path);
  return { url: publicUrl };
}
