"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Changing what a dish sells for, from the screen that shows what it costs.
 *
 * The price lived only on the Menu tab, which is the wrong place to decide
 * it: the Menu tab knows the price and nothing about the margin, and Dish
 * costs knows the margin and could not change the price. So repricing meant
 * reading one screen, remembering a number, and typing it into another — and
 * the figure that actually justifies the change was never on screen at the
 * moment of making it.
 *
 * There is only one price. `meals.price` is what the menu renders, what the
 * counter rings up and what every margin here is measured against, so
 * changing it here changes it everywhere by construction rather than by
 * anything being kept in step.
 */

type Result = { error: string | null };

export async function setDishPrice(input: {
  mealId: string;
  price: number;
}): Promise<Result> {
  const viewer = await getViewer();
  // The price is the business's, not the shift's — the same line drawn around
  // the margin itself. A shift can mark a dish sold out; it cannot reprice it.
  if (!can(viewer, "costs")) {
    return { error: "Only the owner can change what a dish sells for." };
  }

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) {
    return { error: "What should it sell for?" };
  }

  const supabase = createAdminClient();
  const { data: meal } = await supabase
    .from("meals")
    .select("name, price")
    .eq("id", input.mealId)
    .maybeSingle();
  if (!meal) return { error: "That dish no longer exists." };

  const was = Number(meal.price) || 0;
  if (Math.abs(was - price) < 0.005) return { error: null };

  const { error } = await supabase
    .from("meals")
    .update({ price })
    .eq("id", input.mealId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "menu",
    description:
      `Repriced "${meal.name}" — ₱${was.toFixed(2)} → ₱${price.toFixed(2)}`,
    actor: viewer?.profile?.id ?? null,
  });

  // Every screen that quotes a price. The homepage and the menu are
  // statically rendered, so they do not notice a database change by
  // themselves — and a customer looking at yesterday's price is the one
  // failure here that costs money at the counter.
  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/costing");
  revalidatePath("/admin/menu");
  revalidatePath("/admin/counter");
  return { error: null };
}
