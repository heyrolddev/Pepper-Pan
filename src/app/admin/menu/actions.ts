"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer, isStaff } from "@/lib/auth";

const BUCKET = "PepperPan";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const { error } = await supabase
    .from("meals")
    .update({
      name: input.name.trim(),
      price: input.price,
      description: input.description.trim() || null,
      categories: input.category.trim() ? [input.category.trim()] : [],
      is_public: input.isPublic,
      is_available: input.isAvailable,
    })
    .eq("id", input.id);

  if (error) return { error: error.message };
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
  const { error } = await supabase.from("meals").insert({
    name: input.name.trim(),
    price: input.price,
    categories: input.category.trim() ? [input.category.trim()] : [],
    is_public: true,
    is_available: true,
  });

  if (error) return { error: error.message };
  revalidateMenu();
  return { error: null };
}

/**
 * Uploads a meal photo. The file goes up with the service-role key so the
 * storage bucket needs no public write policy — but only after confirming
 * from the session cookie that the caller is actually staff.
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

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  const supabase = await createClient();
  const { error } = await supabase
    .from("meals")
    .update({ image_url: publicUrl })
    .eq("id", mealId);
  if (error) return { error: error.message };

  revalidateMenu();
  return { error: null, url: publicUrl };
}
