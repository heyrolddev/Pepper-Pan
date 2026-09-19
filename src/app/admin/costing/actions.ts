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

/**
 * A new dish that starts as a copy of one that already works.
 *
 * Most new dishes at this shop are a variation: the same noodles with a
 * different sauce, the same ji pai with a different flavour. Building one
 * from scratch means re-entering thirteen lines to change two of them, and
 * every one of those thirteen is a chance to mistype a quantity — so the new
 * dish's margin is wrong from the day it is created and nobody can tell,
 * because nothing says what it was copied from.
 *
 * Takes the recipe, the packaging, the price and the categories. Deliberately
 * leaves out two things.
 *
 * It is created HIDDEN, whatever the original was. A duplicate exists to be
 * edited, and the seconds between "copy" and "change the sauce" are seconds
 * in which the original's exact twin would be live on the homepage at the
 * original's exact price.
 *
 * And it copies no image. The photo is of the dish that was copied, and a
 * picture of the wrong food is worse on a menu than no picture at all.
 */
export async function duplicateDish(input: {
  mealId: string;
  name: string;
}): Promise<Result & { id?: string }> {
  const viewer = await getViewer();
  if (!can(viewer, "costs")) {
    return { error: "Only the owner can add a dish." };
  }

  const name = input.name.trim();
  if (!name) return { error: "What's the new one called?" };

  const supabase = createAdminClient();
  const { data: from } = await supabase
    .from("meals")
    .select("name, price, kind, categories")
    .eq("id", input.mealId)
    .maybeSingle();
  if (!from) return { error: "That dish no longer exists." };

  const { data: clash } = await supabase
    .from("meals")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();
  if (clash) return { error: `You already have a dish called “${clash.name}”.` };

  const { data: made, error: makeError } = await supabase
    .from("meals")
    .insert({
      name,
      price: from.price,
      kind: from.kind,
      categories: from.categories,
      is_public: false,
      is_available: true,
    })
    .select("id")
    .single();
  if (makeError || !made) {
    return { error: makeError?.message ?? "Could not create it." };
  }
  const id = made.id as string;

  // Recipe and packaging, read then rewritten under the new id. Copied after
  // the dish exists so a failure here leaves a hidden dish with no recipe —
  // visibly incomplete on the costing screen, which already flags exactly
  // that — rather than orphan recipe rows pointing at nothing.
  const [{ data: recipe }, { data: packaging }] = await Promise.all([
    supabase
      .from("meal_ingredients")
      .select("ref_type, ref_id, qty")
      .eq("meal_id", input.mealId),
    supabase
      .from("meal_packaging")
      .select("ref_type, ref_id, qty")
      .eq("meal_id", input.mealId),
  ]);

  const lines = (recipe ?? []) as { ref_type: string; ref_id: string; qty: number }[];
  if (lines.length > 0) {
    await supabase
      .from("meal_ingredients")
      .insert(lines.map((l) => ({ ...l, meal_id: id })));
  }
  const packs = (packaging ?? []) as { ref_type: string; ref_id: string; qty: number }[];
  if (packs.length > 0) {
    await supabase
      .from("meal_packaging")
      .insert(packs.map((l) => ({ ...l, meal_id: id })));
  }

  await supabase.from("activity_log").insert({
    category: "menu",
    description:
      `Copied "${from.name}" into "${name}" — ${lines.length} recipe line` +
      `${lines.length === 1 ? "" : "s"} and ${packs.length} packaging line` +
      `${packs.length === 1 ? "" : "s"}. Hidden until you put it on the menu.`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidatePath("/admin/costing");
  revalidatePath("/admin/menu");
  return { error: null, id };
}
