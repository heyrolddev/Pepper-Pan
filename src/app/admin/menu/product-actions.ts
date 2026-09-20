"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grouping dishes into one menu card.
 *
 * Every write in here is presentation only. Not one of them touches a price,
 * a recipe, a stock level or an order line — a group says "show these four as
 * one card", and ungrouping says "show them as four again". That is worth
 * stating at the top because the buttons feel destructive: a screen that
 * turns four menu items into one looks like it is deleting three of them, and
 * the copy on those buttons leans on this being untrue.
 */

type Result = { error: string | null };

const DENIED = "Only the owner can change how the menu is grouped.";

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

/** The options an owner typed, cleaned to what the picker can actually use. */
function cleanOptions(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const key = k.trim();
    const value = String(v ?? "").trim();
    // A key with no value is a chip with nothing written on it; a value with
    // no key belongs to no row of chips. Both are dropped rather than saved
    // and then puzzled over on the menu.
    if (key && value) out[key] = value;
  }
  return out;
}

export async function saveProductGroup(input: {
  /** Absent for a new group. */
  id?: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  /** The dishes on this card, in the order the chips are offered. */
  members: { mealId: string; options: Record<string, string> }[];
}): Promise<Result & { id?: string }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const name = input.name.trim();
  if (!name) return { error: "Give the card a name — it is what the customer reads." };
  if (input.members.length === 0) {
    return { error: "A card with no dishes on it would show a customer nothing." };
  }

  const db = createAdminClient();

  let id = input.id;
  const row = {
    name,
    description: input.description?.trim() || null,
    image_url: input.imageUrl || null,
    is_active: input.isActive ?? true,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await db.from("menu_products").update(row).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await db
      .from("menu_products")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not create the card." };
    id = data.id as string;
  }

  /**
   * Members are set by difference, not by clearing and re-adding.
   *
   * Clearing first would leave every dish ungrouped for the moment between
   * the two writes — and there is no transaction across two PostgREST calls,
   * so a failure in the second half leaves the menu permanently scattered
   * with nothing to say why.
   */
  const keep = new Set(input.members.map((m) => m.mealId));
  const { data: current } = await db
    .from("meals")
    .select("id")
    .eq("product_id", id);

  const dropped = ((current ?? []) as { id: string }[])
    .map((m) => m.id)
    .filter((mealId) => !keep.has(mealId));

  if (dropped.length > 0) {
    const { error } = await db
      .from("meals")
      // Back to being its own card, with its options cleared: a stale
      // {"Size":"22oz"} on a dish that is no longer in a group would do
      // nothing until it was grouped again, and then quietly put it in the
      // wrong place.
      .update({ product_id: null, options: {}, variant_sort: 0 })
      .in("id", dropped);
    if (error) return { error: error.message };
  }

  for (const [i, m] of input.members.entries()) {
    const { error } = await db
      .from("meals")
      .update({
        product_id: id,
        options: cleanOptions(m.options),
        variant_sort: i,
      })
      .eq("id", m.mealId);
    if (error) return { error: error.message };
  }

  await db.from("activity_log").insert({
    category: "menu",
    description:
      `${input.id ? "Updated" : "Created"} the menu card “${name}” — ` +
      `${input.members.length} dish${input.members.length === 1 ? "" : "es"} on one card.`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidateMenu();
  return { error: null, id };
}

/**
 * Ungroup.
 *
 * The dishes are pushed out first and the group deleted second. The foreign
 * key is `on delete set null`, so the order does not strictly matter — but
 * relying on that means a future migration that "tidied" the constraint to
 * cascade would silently start deleting dishes here, and with them their
 * recipes and every order line that ever pointed at them.
 */
export async function deleteProductGroup(id: string): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const db = createAdminClient();
  const { data: group } = await db
    .from("menu_products")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error: freed } = await db
    .from("meals")
    .update({ product_id: null, options: {}, variant_sort: 0 })
    .eq("product_id", id);
  if (freed) return { error: freed.message };

  const { error } = await db.from("menu_products").delete().eq("id", id);
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "menu",
    description: `Ungrouped the menu card “${group?.name ?? id}”. Its dishes are back on the menu on their own.`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidateMenu();
  return { error: null };
}

/** Where the card sits among the others. Ties break on name, as elsewhere. */
export async function reorderProductGroups(ids: string[]): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const db = createAdminClient();
  for (const [i, id] of ids.entries()) {
    const { error } = await db
      .from("menu_products")
      .update({ sort_order: i * 10 })
      .eq("id", id);
    if (error) return { error: error.message };
  }
  revalidateMenu();
  return { error: null };
}
