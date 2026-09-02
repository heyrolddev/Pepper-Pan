"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_COLOURS, fallbackColour } from "@/lib/categories";
import { applyTakeoutMerge, planTakeoutMerge, type MergePlan } from "@/lib/takeout-merge";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";

const BLOCKED_MESSAGE =
  "The database didn't accept that change. Run the latest migration (0003) in the Supabase SQL Editor, then try again.";

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}


/**
 * Remember a category the moment a dish uses it.
 *
 * Typing a new name on a dish form is allowed — refusing it would mean going
 * somewhere else to create the category before you can finish adding the dish
 * — so the row has to appear by itself, or the name would exist on the dish
 * and nowhere else, and show up uncoloured with no way to colour it.
 *
 * It gets a colour worked out from its name rather than a placeholder grey, so
 * a new category looks like the others straight away. `fallbackColour` is the
 * same function the screens use when a row is missing, so the colour does not
 * change the instant this row is written.
 */
async function rememberCategory(name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const supabase = createAdminClient();
  // Case-insensitive: a dish saved as "chicken" should join "Chicken", not
  // start a second category beside it. That is the exact thing this table
  // exists to stop happening.
  const { data: existing } = await supabase
    .from("menu_categories")
    .select("name")
    .ilike("name", clean)
    .maybeSingle();
  if (existing) return;

  const { data: last } = await supabase
    .from("menu_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("menu_categories").insert({
    name: clean,
    colour: fallbackColour(clean),
    sort_order: (last?.sort_order ?? 0) + 10,
  });
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
  if (!can(viewer, "menu.edit")) {
    return { error: "Only the owner can change what a dish is or costs." };
  }
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

  await rememberCategory(input.category);
  revalidateMenu();
  return { error: null };
}

export async function createMeal(input: {
  name: string;
  price: number;
  category: string;
  description?: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) {
    return { error: "Only the owner can change what a dish is or costs." };
  }
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
      description: input.description?.trim() || null,
      is_public: true,
      is_available: true,
    })
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  await rememberCategory(input.category);
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
  if (!can(viewer, "menu.edit")) {
    return { error: "Only the owner can change what a dish is or costs." };
  }

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
  if (!can(viewer, "menu.edit")) {
    return { error: "Only the owner can change what a dish is or costs." };
  }

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


/**
 * Sold out, and back on again.
 *
 * Split from `saveMeal` because they are two different powers that happened to
 * be the same UPDATE. "We've run out of chicken" has to be sayable mid-service
 * by whoever notices; "this now costs ₱149" is the owner's alone. Rolled into
 * one action, the only way to let a manager do the first was to let them do
 * the second.
 *
 * Written through the caller's own session rather than the service role, so
 * the column guard in migration 0021 gets a say too: if this ever grew a
 * second field by accident, the database would put it back.
 */
export async function setMealAvailability(
  id: string,
  isAvailable: boolean
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.availability")) return { error: "Not allowed." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .update({ is_available: isAvailable })
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidateMenu();
  return { error: null };
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

/**
 * Name and colour a category.
 *
 * Renaming is the reason this exists at all. A category has always been free
 * text on each dish, so "Chicken" became "chicken" the day somebody typed it
 * in a hurry, and fixing that meant opening every dish. Here it is one edit,
 * and the dishes are carried across with it.
 */
export async function saveCategory(input: {
  /** The name as it is now. Empty when creating one. */
  was: string;
  name: string;
  colour: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) {
    return { error: "Only the owner can change the menu's categories." };
  }

  const name = input.name.trim();
  if (!name) return { error: "Give the category a name." };
  if (name.length > 40) return { error: "That name is too long for a filter pill." };
  if (!CATEGORY_COLOURS.includes(input.colour)) {
    return { error: "That isn't one of the colours." };
  }

  // The service role, not the caller's session: renaming rewrites the
  // `categories` array on every dish that used the old name, and doing that
  // one dish at a time through RLS would leave the menu half-renamed if any
  // single row were refused.
  const supabase = createAdminClient();
  const was = input.was.trim();

  if (was && was !== name) {
    const { data: clash } = await supabase
      .from("menu_categories")
      .select("name")
      .ilike("name", name)
      .maybeSingle();
    if (clash && clash.name !== was) {
      return {
        error: `There's already a category called "${clash.name}". Move the dishes into it instead.`,
      };
    }
  }

  const { error } = await supabase
    .from("menu_categories")
    .upsert({ name, colour: input.colour }, { onConflict: "name" });
  if (error) return { error: error.message };

  if (was && was !== name) {
    // Carry the dishes over, then drop the old row. In that order: a dish
    // left pointing at a name that no longer exists still renders, but it
    // renders under the old name, which looks like the rename silently failed.
    const { data: affected, error: readError } = await supabase
      .from("meals")
      .select("id, categories")
      .contains("categories", [was]);
    if (readError) return { error: readError.message };

    for (const m of (affected ?? []) as { id: string; categories: string[] }[]) {
      const next = (m.categories ?? []).map((c) => (c === was ? name : c));
      const { error: moveError } = await supabase
        .from("meals")
        .update({ categories: next })
        .eq("id", m.id);
      if (moveError) return { error: moveError.message };
    }
    await supabase.from("menu_categories").delete().eq("name", was);
  }

  revalidateMenu();
  return { error: null };
}

/**
 * Forget a category.
 *
 * Refuses while dishes are still in it, rather than cascading. Deleting the
 * row would not delete the dishes — they would simply reappear as an
 * uncoloured category with the same name, which looks exactly like the delete
 * silently failed. Better to say what is in the way.
 */
export async function deleteCategory(name: string): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: "Not allowed." };

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("meals")
    .select("id", { count: "exact", head: true })
    .contains("categories", [name]);

  if ((count ?? 0) > 0) {
    return {
      error: `${count} dish${count === 1 ? " is" : "es are"} still in "${name}". Move them first, or rename this category instead.`,
    };
  }

  const { error } = await supabase.from("menu_categories").delete().eq("name", name);
  if (error) return { error: error.message };

  revalidateMenu();
  return { error: null };
}

/* ------------------------------------------------------------------ */
/* Collapsing the "(T.O)" duplicates                                   */
/* ------------------------------------------------------------------ */

/**
 * What the merge would do, without doing it.
 *
 * Read-only, so it is safe to call every time the Menu screen loads — which
 * is the point: the panel only appears when there is something to collapse,
 * and disappears by itself once there isn't.
 */
export async function previewTakeoutMerge(): Promise<MergePlan> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) {
    return { rows: [], skipped: [], before: 0, after: 0, error: "Not allowed." };
  }
  return planTakeoutMerge();
}

/**
 * Do it. Owner only, and logged.
 *
 * The heaviest single change this software can make to a menu, so it leaves a
 * line in the activity log saying so — the one screen where "who did this and
 * when" is worth more than the change itself.
 */
export async function runTakeoutMerge(): Promise<{
  done: number;
  failed: string[];
  error: string | null;
}> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) {
    return { done: 0, failed: [], error: "Only the owner can do this." };
  }

  const result = await applyTakeoutMerge();
  if (result.done > 0) {
    await createAdminClient()
      .from("activity_log")
      .insert({
        category: "menu",
        description: `Collapsed ${result.done} take-out duplicate${
          result.done === 1 ? "" : "s"
        } into packaging on the dine-in dish`,
        actor: viewer?.profile?.id ?? null,
      });
  }

  revalidateMenu();
  revalidatePath("/admin/costing");
  return result;
}
