"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Building an add-on group.
 *
 * Unlike the grouping actions next door, these DO touch money: an option
 * carries a price and a dish, and both end up on somebody's receipt. So every
 * write here is checked the way a price change is, and every refusal says
 * what to do instead rather than just failing.
 *
 * The one rule the whole screen exists to enforce: AN OPTION IS A DISH. A
 * group whose options point at nothing would sell add-ons the shop cannot
 * cost and cannot take off the shelf, which overstates the margin on every
 * combo it touches. So an option cannot be saved without one.
 */

type Result = { error: string | null };

const DENIED = "Only the owner can change the add-ons — they carry a price.";

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin/counter");
  revalidatePath("/menu");
}

export type OptionInput = {
  /** Absent for a new one. */
  id?: string;
  mealId: string;
  label: string;
  /** Null means "charge whatever that dish costs". */
  priceOverride: number | null;
};

export async function saveModifierGroup(input: {
  id?: string;
  name: string;
  helper?: string | null;
  /** Must the customer answer? */
  required: boolean;
  /** 1 is a radio; more is a checklist. */
  maxSelect: number;
  isActive?: boolean;
  options: OptionInput[];
  /** Menu cards this is offered on. */
  productIds: string[];
  /** Individual dishes it is offered on, on top of the cards. */
  mealIds: string[];
}): Promise<Result & { id?: string }> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const name = input.name.trim();
  if (!name) {
    return { error: "Give the group a name — it is the question the customer reads." };
  }

  const max = Math.max(1, Math.min(10, Math.round(input.maxSelect || 1)));
  const min = input.required ? 1 : 0;

  const options = input.options
    .map((o) => ({
      ...o,
      label: o.label.trim(),
      mealId: o.mealId.trim(),
    }))
    .filter((o) => o.mealId);

  if (options.length === 0) {
    return {
      error:
        "Add at least one option. Each one points at a dish — make a hidden dish like “Extra rice” with its own recipe and price, then choose it here.",
    };
  }
  const blank = options.find((o) => !o.label);
  if (blank) {
    return { error: "Every option needs a label — it is what the chip says." };
  }
  const bad = options.find(
    (o) =>
      o.priceOverride !== null &&
      (!Number.isFinite(o.priceOverride) || o.priceOverride < 0)
  );
  if (bad) {
    return { error: `"${bad.label}" has a price that isn't a number.` };
  }
  if (input.required && options.length < 2) {
    // A compulsory question with one answer is not a question. It is a
    // dialog the customer has to dismiss to buy something.
    return {
      error:
        "A required group needs at least two options — with only one there is nothing to choose.",
    };
  }

  const db = createAdminClient();

  // The dishes have to exist. An option pointing at a deleted id is exactly
  // the uncostable sale this whole file is trying to prevent.
  const { data: liveMeals, error: mealsError } = await db
    .from("meals")
    .select("id, name")
    .in("id", [...new Set(options.map((o) => o.mealId))]);
  if (mealsError) return { error: mealsError.message };
  const live = new Set(((liveMeals ?? []) as { id: string }[]).map((m) => m.id));
  const missing = options.find((o) => !live.has(o.mealId));
  if (missing) {
    return {
      error: `"${missing.label}" points at a dish that no longer exists. Pick another one.`,
    };
  }

  const row = {
    name,
    helper: input.helper?.trim() || null,
    min_select: min,
    max_select: max,
    is_active: input.isActive ?? true,
  };

  let id = input.id;
  if (id) {
    // `.select("id")` and a row count, because an UPDATE matching nothing is
    // a success in PostgREST — the dialog would close, the menu would keep
    // the old text, and nothing anywhere would say why.
    const { data, error } = await db
      .from("modifier_groups")
      .update(row)
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return {
        error:
          "That group no longer exists — it may have been deleted in another tab. Close this and take another look.",
      };
    }
  } else {
    const { data, error } = await db
      .from("modifier_groups")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      return { error: error?.message ?? "Could not create the group." };
    }
    id = data.id as string;
  }

  /**
   * Options are upserted and then the leftovers removed, rather than cleared
   * and re-added.
   *
   * Their ids are on order lines. Deleting and re-creating would give every
   * option a new id, and `order_line_extras.option_id` would go null across
   * the shop's whole history — the receipts would survive, and every report
   * that asks "how many combos took the iced tea" would come back empty
   * forever, with nothing to say it had happened.
   */
  const keep: string[] = [];
  for (const [at, o] of options.entries()) {
    const optionRow = {
      group_id: id,
      option_meal_id: o.mealId,
      label: o.label,
      price_override: o.priceOverride,
      sort_order: at,
      is_active: true,
    };
    if (o.id) {
      const { data, error } = await db
        .from("modifier_options")
        .update(optionRow)
        .eq("id", o.id)
        .select("id");
      if (error) return { error: error.message };
      if (data && data.length > 0) {
        keep.push(o.id);
        continue;
      }
      // It was deleted elsewhere. Written again rather than refused: the
      // owner's intent is plain, and losing their typing to a race is worse
      // than losing one option's history.
    }
    const { data, error } = await db
      .from("modifier_options")
      .insert(optionRow)
      .select("id")
      .single();
    if (error || !data) {
      return { error: error?.message ?? "Could not save an option." };
    }
    keep.push(data.id as string);
  }

  const { data: existing } = await db
    .from("modifier_options")
    .select("id")
    .eq("group_id", id);
  const doomed = ((existing ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((optionId) => !keep.includes(optionId));
  if (doomed.length > 0) {
    /**
     * Removed from the menu, not from history. `is_active = false` rather
     * than DELETE, because `order_line_extras.option_id` points here and
     * deleting would null it — the receipt would still read right and the
     * reporting behind it would quietly lose its link.
     */
    const { error } = await db
      .from("modifier_options")
      .update({ is_active: false })
      .in("id", doomed);
    if (error) return { error: error.message };
  }

  // Attachments ARE cleared and re-added: they carry nothing but the pairing,
  // so re-creating one loses nothing, and the pair is the primary key so a
  // duplicate cannot happen.
  const attach = async (
    table: "meal_modifier_groups" | "product_modifier_groups",
    column: "meal_id" | "product_id",
    ids: string[]
  ) => {
    const { error: clearError } = await db.from(table).delete().eq("group_id", id);
    if (clearError) return clearError.message;
    if (ids.length === 0) return null;
    const { error } = await db.from(table).insert(
      [...new Set(ids)].map((owner, at) => ({
        [column]: owner,
        group_id: id,
        sort_order: at,
      }))
    );
    return error?.message ?? null;
  };

  const attachError =
    (await attach("product_modifier_groups", "product_id", input.productIds)) ??
    (await attach("meal_modifier_groups", "meal_id", input.mealIds));
  if (attachError) return { error: attachError };

  revalidateMenu();
  return { error: null, id };
}

export async function deleteModifierGroup(id: string): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const db = createAdminClient();
  const { data, error } = await db
    .from("modifier_groups")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That group was already gone." };
  }

  revalidateMenu();
  return { error: null };
}

/** Off the menu without losing it — and without touching a single order. */
export async function setModifierGroupActive(
  id: string,
  isActive: boolean
): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "menu.edit")) return { error: DENIED };

  const db = createAdminClient();
  const { data, error } = await db
    .from("modifier_groups")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That group no longer exists." };

  revalidateMenu();
  return { error: null };
}
