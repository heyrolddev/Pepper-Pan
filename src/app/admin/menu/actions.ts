"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";

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
 * Removes a menu item. Meals referenced by a past order can't be deleted —
 * `order_lines.meal_id` has no ON DELETE, so Postgres refuses, which is the
 * behaviour we want: deleting one would rewrite sales history. Those are
 * hidden from the menu instead, which the caller is told to do.
 */
export async function deleteMeal(id: string): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("meals").delete().eq("id", id).select("id");

  if (error) {
    // 23503 = foreign key violation, i.e. the item appears on a past order.
    if (error.code === "23503") {
      return {
        error:
          "This item is part of past orders, so deleting it would change your sales history. Untick “Shown on menu” to retire it instead.",
      };
    }
    return { error: error.message };
  }
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null };
}

/**
 * Uploads a meal photo. `isStaff(viewer)` is the real gate — see
 * `lib/storage.ts` for why the bytes go through the service-role client.
 */
export async function uploadMealImage(
  formData: FormData
): Promise<{ error: string | null; url?: string }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const mealId = String(formData.get("mealId") ?? "");
  if (!mealId) return { error: "Missing meal." };

  const checked = validateImage(formData.get("file"));
  if ("error" in checked) return { error: checked.error };

  const uploaded = await uploadImage(
    checked.file,
    `meals/${mealId}-${Date.now()}.${extensionFor(checked.file.type)}`
  );
  if ("error" in uploaded) return { error: uploaded.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .update({ image_url: uploaded.url })
    .eq("id", mealId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null, url: uploaded.url };
}
