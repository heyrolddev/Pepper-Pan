"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, isStaff } from "@/lib/auth";

const BUCKET = "PepperPan";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const BLOCKED_MESSAGE =
  "The database didn't accept that change. Run the latest migration (0003) in the Supabase SQL Editor, then try again.";

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

export async function saveMeal(input: {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  isPublic: boolean;
  isAvailable: boolean;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };
  if (!input.name.trim()) return { error: "Name is required." };
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { error: "Enter a valid price." };
  }

  const supabase = await createClient();
  // `.select()` matters: PostgREST reports success on an UPDATE that a
  // row-level security policy silently matched zero rows for, which is how
  // this used to report "Saved" while changing nothing.
  const { data, error } = await supabase
    .from("meals")
    .update({
      name: input.name.trim(),
      price: input.price,
      description: input.description.trim() || null,
      categories: input.category.trim() ? [input.category.trim()] : [],
      is_public: input.isPublic,
      is_available: input.isAvailable,
    })
    .eq("id", input.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null };
}

export async function createMeal(input: {
  name: string;
  price: number;
  category: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };
  if (!input.name.trim()) return { error: "Name is required." };
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { error: "Enter a valid price." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .insert({
      name: input.name.trim(),
      price: input.price,
      categories: input.category.trim() ? [input.category.trim()] : [],
      is_public: true,
      is_available: true,
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null };
}

/**
 * Uploads a meal photo. `isStaff(viewer)` above is the real gate — once
 * that passes, the upload itself goes through the service-role client when
 * SUPABASE_SERVICE_ROLE_KEY is configured, bypassing storage RLS entirely
 * (this is what actually fixed uploads: the staff storage policy in
 * migration 0003 kept rejecting the insert in production for reasons that
 * weren't reproducible outside the live project). Without that key set,
 * it falls back to the signed-in user's own session, which depends on
 * migration 0003's policies being present.
 */
export async function uploadMealImage(
  formData: FormData
): Promise<{ error: string | null; url?: string }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const mealId = String(formData.get("mealId") ?? "");
  const file = formData.get("file");
  if (!mealId) return { error: "Missing meal." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image first." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Use a JPG, PNG or WebP image." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "That image is over 8MB — please use a smaller one." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `meals/${mealId}-${Date.now()}.${ext}`;

  const supabase = await createClient();
  const storageClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  const { error: uploadError } = await storageClient.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    return {
      error: `Upload failed: ${uploadError.message}. If this mentions permissions, run migration 0003 in the Supabase SQL Editor, or add SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings.`,
    };
  }

  const {
    data: { publicUrl },
  } = storageClient.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from("meals")
    .update({ image_url: publicUrl })
    .eq("id", mealId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null, url: publicUrl };
}
