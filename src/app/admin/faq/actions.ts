"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What Ask Pepper Pan recommends, and what it says about offers.
 *
 * Two small fields and a dish, kept apart from the FAQ rows next to them
 * because they are a different kind of thing: an FAQ entry replaces a whole
 * answer with typed text, whereas these steer an answer the assistant still
 * assembles itself — so the price stays live and a finished promo drops out
 * on its own.
 */
export async function saveAssistantVoice(input: {
  /** Empty string means "work it out from the sales", which is the default. */
  featuredMealId: string;
  featuredNote: string;
  promoNote: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "faq")) {
    return { error: "Only the owner or a manager can change what the shop says." };
  }

  const mealId = input.featuredMealId.trim();
  const db = createAdminClient();

  // Checked rather than trusted: the picker sends an id from a list, but a
  // server action is reachable without the picker, and a dangling reference
  // would be rejected by the foreign key with a message nobody can read.
  if (mealId) {
    const { data, error } = await db
      .from("meals")
      .select("id")
      .eq("id", mealId)
      .eq("is_public", true)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) {
      return { error: "That dish isn't on the public menu any more. Pick another." };
    }
  }

  const { error } = await db
    .from("chat_settings")
    .update({
      featured_meal_id: mealId || null,
      featured_note: input.featuredNote.trim() || null,
      promo_note: input.promoNote.trim() || null,
    })
    .eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/faq");
  return { error: null };
}
