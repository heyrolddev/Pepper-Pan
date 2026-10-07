"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NOT_ON_SHIFT, offShift } from "@/lib/shift-guard";

/**
 * Whether a branch offers a dish.
 *
 * Its own file beside the rest of the menu actions, because it is the only
 * thing on the menu screen that is a BRANCH's decision rather than the
 * shop's. Everything else there — the name, the price, the photo, the
 * recipe — belongs to the commissary and must keep belonging to it, or
 * Apalit cooks the sauce one way while a branch's costing believes another.
 *
 * Gated on `menu.availability`, the same capability as marking a dish sold
 * out. It is the same kind of decision: what can be bought here, today,
 * decided by whoever is running the service.
 */
export async function setMealOfferedAt(input: {
  mealId: string;
  branchId: string;
  offered: boolean;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.availability")) return { error: "Not allowed." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const supabase = await createClient();

  if (input.offered) {
    /* Upsert rather than insert: two taps on the same chip is one answer,
       and the second should not come back as a duplicate-key error. */
    const { error } = await supabase
      .from("meal_branches")
      .upsert(
        { meal_id: input.mealId, branch_id: input.branchId },
        { onConflict: "meal_id,branch_id" }
      );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("meal_branches")
      .delete()
      .eq("meal_id", input.mealId)
      .eq("branch_id", input.branchId);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/menu");
  revalidatePath("/admin/counter");
  // The public menu is the commissary's, so taking a dish off main changes
  // what the website shows.
  revalidatePath("/menu");
  return { error: null };
}
