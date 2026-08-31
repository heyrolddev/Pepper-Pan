"use server";

import { revalidatePath } from "next/cache";
import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";

type Result = { error: string | null };

/**
 * Writing to the store room.
 *
 * Everything here is staff-allowed rather than owner-only: the person who
 * notices the sugar is nearly gone is the person on shift, and a system that
 * makes them message the owner to record it is a system that stops being
 * updated by the second week.
 *
 * Every write goes through the service-role client after an explicit staff
 * check, and every one of them leaves a line in `activity_log` — which, as
 * of migration 0016, nobody can edit or delete afterwards.
 */

async function requireStaff() {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return null;
  return viewer;
}

async function log(
  category: string,
  description: string,
  actorId: string | null
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("activity_log").insert({
    category,
    description,
    actor: actorId,
  });
  // Never fatal. Losing the log line is bad; losing the stock change it
  // describes because the log line failed is worse.
  if (error) console.error(`[inventory] log: ${error.message}`);
}

function revalidate() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/costing");
  revalidatePath("/admin");
}

/**
 * Cost per unit is derived, never typed.
 *
 * The owner buys a kilo of sugar for ₱70; the recipes use grams. Asking for
 * "₱0.07 per gram" invites a slipped decimal that silently multiplies every
 * dish cost by ten, so the form asks what they actually paid and for how
 * much, and the arithmetic happens here.
 */
function unitCost(purchasePrice: number, purchaseQty: number): number {
  return purchaseQty > 0 ? purchasePrice / purchaseQty : 0;
}

export async function saveIngredient(input: {
  id?: string;
  name: string;
  unit: string;
  purchasePrice: number;
  purchaseQty: number;
  reorder: number;
  categories: string[];
  /** Only used when creating — afterwards stock moves through restock/sales. */
  openingStock?: number;
}): Promise<Result & { id?: string }> {
  const viewer = await requireStaff();
  if (!viewer) return { error: "Only shop staff can change the store room." };

  const name = input.name.trim();
  const unit = input.unit.trim();
  if (!name) return { error: "Give the ingredient a name." };
  if (!unit) return { error: "Say what it's measured in — g, ml, pc." };
  if (input.purchasePrice < 0 || input.purchaseQty < 0) {
    return { error: "Price and quantity can't be negative." };
  }

  const supabase = createAdminClient();
  const cost = unitCost(input.purchasePrice, input.purchaseQty);

  if (input.id) {
    const { data, error } = await supabase
      .from("ingredients")
      .update({
        name,
        unit,
        purchase_price: input.purchasePrice,
        purchase_qty: input.purchaseQty,
        cost,
        reorder: input.reorder,
        categories: input.categories,
      })
      .eq("id", input.id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "That ingredient no longer exists." };

    await log("inventory", `Edited ingredient "${name}"`, viewer.profile?.id ?? null);
    revalidate();
    return { error: null, id: input.id };
  }

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      name,
      unit,
      purchase_price: input.purchasePrice,
      purchase_qty: input.purchaseQty,
      cost,
      stock: input.openingStock ?? 0,
      reorder: input.reorder,
      categories: input.categories,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add it." };

  // An opening balance is stock the shop already had, so it gets a lot at
  // today's cost — otherwise the first sale would price it as a shortfall.
  if ((input.openingStock ?? 0) > 0) {
    await supabase.from("ingredient_lots").insert({
      ingredient_id: data.id,
      qty: input.openingStock,
      cost,
      received_date: shopToday(),
    });
  }

  await log("inventory", `Added ingredient "${name}"`, viewer.profile?.id ?? null);
  revalidate();
  return { error: null, id: data.id };
}

export async function deleteIngredient(id: string): Promise<Result> {
  const viewer = await requireStaff();
  if (!viewer) return { error: "Only shop staff can change the store room." };

  const supabase = createAdminClient();

  // Refused rather than cascaded. Deleting an ingredient a recipe still uses
  // would leave that dish costing less than it does, which reads as a dish
  // that suddenly got more profitable — the exact silent-failure shape this
  // system keeps having to design against.
  const [{ data: inRecipes }, { data: inBatches }] = await Promise.all([
    supabase.from("meal_ingredients").select("meal_id").eq("ref_type", "inv").eq("ref_id", id).limit(5),
    supabase.from("batch_ingredients").select("batch_id").eq("ingredient_id", id).limit(5),
  ]);
  const uses = (inRecipes?.length ?? 0) + (inBatches?.length ?? 0);
  if (uses > 0) {
    return {
      error: `Still used by ${uses} recipe${uses === 1 ? "" : "s"}. Take it out of those first, or it would quietly make them look cheaper.`,
    };
  }

  const { data: row } = await supabase
    .from("ingredients")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) return { error: error.message };

  await log(
    "inventory",
    `Deleted ingredient "${row?.name ?? id}"`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * A delivery arrived.
 *
 * This is the only way stock goes up, and it does three things at once: adds
 * a lot at the price actually paid, records the purchase, and — when the
 * price has moved — updates the standard cost so every dish that uses it
 * reprices.
 */
export async function recordRestock(input: {
  ingredientId: string;
  /** How much arrived, in the ingredient's own unit. */
  qty: number;
  /** Total peso amount paid for that quantity. */
  amountPaid: number;
  supplier?: string;
  expiryDate?: string | null;
  /** Whether to move the standard cost to this delivery's price. */
  updateStandardCost: boolean;
}): Promise<Result> {
  const viewer = await requireStaff();
  if (!viewer) return { error: "Only shop staff can record a delivery." };

  if (input.qty <= 0) return { error: "How much arrived?" };
  if (input.amountPaid < 0) return { error: "The amount paid can't be negative." };

  const supabase = createAdminClient();
  const { data: ing, error: ingError } = await supabase
    .from("ingredients")
    .select("id, name, unit, cost, stock")
    .eq("id", input.ingredientId)
    .maybeSingle();
  if (ingError) return { error: ingError.message };
  if (!ing) return { error: "That ingredient no longer exists." };

  const lotCost = input.amountPaid / input.qty;
  const today = shopToday();

  const { data: lot, error: lotError } = await supabase
    .from("ingredient_lots")
    .insert({
      ingredient_id: ing.id,
      qty: input.qty,
      cost: lotCost,
      received_date: today,
      expiry_date: input.expiryDate || null,
    })
    .select("id")
    .single();
  if (lotError || !lot) {
    return { error: lotError?.message ?? "Could not record the delivery." };
  }

  const { error: stockError } = await supabase
    .from("ingredients")
    .update({
      stock: Number(ing.stock) + input.qty,
      // Only when asked. A one-off panic buy at the sari-sari store down the
      // road shouldn't reprice the whole menu; a new supplier price should.
      ...(input.updateStandardCost
        ? { cost: lotCost, purchase_price: input.amountPaid, purchase_qty: input.qty }
        : {}),
    })
    .eq("id", ing.id);
  if (stockError) return { error: stockError.message };

  await supabase.from("purchase_log").insert({
    ingredient_id: ing.id,
    lot_id: lot.id,
    date: today,
    supplier: input.supplier?.trim() || null,
    qty: input.qty,
    cost: input.amountPaid,
  });

  const priceMoved = Math.abs(lotCost - Number(ing.cost)) > 0.0001;
  await log(
    "inventory",
    `Restocked ${input.qty} ${ing.unit} of "${ing.name}" for ₱${input.amountPaid.toFixed(2)}` +
      (input.updateStandardCost && priceMoved
        ? ` — cost per ${ing.unit} now ₱${lotCost.toFixed(4)}`
        : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * Correct a count by hand.
 *
 * Deliberately separate from restock: "we bought 5kg" and "the shelf says
 * 300g, not 480g" are different events, and mixing them would put a purchase
 * in the ledger that never happened. The difference is applied as a lot
 * (found more) or a consumption (found less) so the lot history stays
 * truthful.
 */
export async function adjustStock(input: {
  ingredientId: string;
  countedQty: number;
  note?: string;
}): Promise<Result> {
  const viewer = await requireStaff();
  if (!viewer) return { error: "Only shop staff can adjust stock." };
  if (!Number.isFinite(input.countedQty) || input.countedQty < 0) {
    return { error: "Enter the counted amount." };
  }

  const supabase = createAdminClient();
  const { data: ing } = await supabase
    .from("ingredients")
    .select("id, name, unit, cost, stock")
    .eq("id", input.ingredientId)
    .maybeSingle();
  if (!ing) return { error: "That ingredient no longer exists." };

  const variance = input.countedQty - Number(ing.stock);
  if (Math.abs(variance) < 0.0001) return { error: "That's already the count." };

  if (variance > 0) {
    await supabase.rpc("restore_ingredient", {
      p_ingredient_id: ing.id,
      p_qty: variance,
      p_date: shopToday(),
      p_type: "count",
    });
  } else {
    await supabase.rpc("consume_ingredient", {
      p_ingredient_id: ing.id,
      p_qty: -variance,
      p_date: shopToday(),
      p_type: "count",
    });
  }

  await supabase.from("cycle_counts").insert({
    date: shopToday(),
    payload: {
      ingredientId: ing.id,
      name: ing.name,
      systemQty: Number(ing.stock),
      countedQty: input.countedQty,
      variance,
      valueImpact: variance * Number(ing.cost || 0),
      note: input.note?.trim() || null,
    },
  });

  await log(
    "movement",
    `Counted "${ing.name}": ${ing.stock} → ${input.countedQty} ${ing.unit} (${
      variance > 0 ? "+" : ""
    }${variance.toFixed(2)})`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}
