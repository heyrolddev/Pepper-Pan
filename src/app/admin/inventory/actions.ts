"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { NOT_ON_SHIFT, offShift } from "@/lib/shift-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { PAID_FROM_LABELS, isPaidFrom, type PaidFrom } from "@/lib/money-accounts";
import { recordDebt } from "@/lib/debts-server";
import { loadActivity, type Activity } from "@/lib/activity-server";

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

/**
 * Moving stock, setting a cost, editing a recipe: manager and above.
 *
 * Was `isStaff` — everyone who worked here — which put every ingredient's
 * purchase price and every recipe in reach of whoever was on the counter.
 */
async function requireStock() {
  const viewer = await getViewer();
  if (!can(viewer, "stock.manage")) return null;
  return viewer;
}

/**
 * Writing off what was thrown away: everyone.
 *
 * Deliberately the wider gate. Waste is logged at the moment it happens, by
 * the person it happened to; requiring a manager for it is how a shop ends up
 * with a waste log that says nothing was ever wasted and a shelf that
 * disagrees with the system.
 */
async function requireWaste() {
  const viewer = await getViewer();
  if (!can(viewer, "waste")) return null;
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
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change the store room." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

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
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change the store room." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

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
  /**
   * Which pot the money came out of, or that none did yet.
   *
   * This used to not exist, and neither did the deduction. The delivery was
   * written to `ingredient_lots`, `ingredients`, `purchase_log` and the
   * activity log — and nothing at all to `cash_ledger`. So the drawer figure
   * counted every sale in and no ingredient out: not a slow drift, but
   * permanently high by the total of every delivery the shop has ever taken.
   *
   * The screen's own help text conceded it — "that gap is usually a labas for
   * supplies that nobody wrote down" — and left it to the owner to type in.
   * Asking somebody to enter the same peso figure twice is exactly how the
   * second one stops happening, and the form already knows the number.
   */
  paidFrom?: PaidFrom;
  /** Picked from the supplier list, when the delivery came from somebody on it. */
  supplierId?: string | null;
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can record a delivery." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

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
    // Both: the text is what was written at the time and stays readable
    // whatever happens to the list, the id is what lets a report group.
    supplier: input.supplier?.trim() || null,
    supplier_id: input.supplierId || null,
    qty: input.qty,
    cost: input.amountPaid,
  });

  /**
   * The money leaves too.
   *
   * Written after the stock, never before: a ledger line for a delivery that
   * failed to record would take pesos out of the drawer for ingredients that
   * never arrived, and that is the one error here nobody would spot — a
   * shortfall with no stock to explain it.
   *
   * A failure to write this is reported but does not fail the restock. The
   * delivery physically happened; refusing to record it because the ledger
   * line would not write leaves the shelf and the system further apart than
   * a missing ledger row does.
   */
  const paidFrom: PaidFrom = isPaidFrom(input.paidFrom) ? input.paidFrom : "cash";

  /**
   * Taken on utang, and now recorded as such.
   *
   * This used to be the end of it: the `unpaid` branch skipped the ledger
   * block and wrote nothing anywhere else either. The stock arrived, the
   * purchase log kept the peso figure, and the obligation existed only in
   * the owner's memory — so the shop's money read high by every delivery it
   * had ever taken on credit, and there was no list of who was owed.
   *
   * Still no ledger line, and that part was always right: the cash really is
   * still in the drawer until the supplier is paid, and a line here would
   * make the drawer fail a physical count. `settleDebt` writes it later, on
   * the day the money actually leaves.
   */
  if (paidFrom === "unpaid" && input.amountPaid > 0) {
    const debt = await recordDebt({
      supplierId: input.supplierId || null,
      supplierName: input.supplier?.trim() || null,
      description: `${input.qty} ${ing.unit} of ${ing.name}`,
      amount: input.amountPaid,
      source: "restock",
      actorId: viewer.profile?.id ?? null,
    });
    if (debt.error) {
      console.error(`[inventory] restock debt: ${debt.error}`);
    }
  }

  if (paidFrom !== "unpaid" && input.amountPaid > 0) {
    const { error: ledgerError } = await supabase.from("cash_ledger").insert({
      date: today,
      type: "out",
      account: paidFrom,
      amount: input.amountPaid,
      category: "Stock",
      note: `${input.qty} ${ing.unit} of ${ing.name}` +
        (input.supplier?.trim() ? ` — ${input.supplier.trim()}` : ""),
      logged_by: viewer.profile?.id ?? null,
    });
    if (ledgerError) {
      console.error(`[inventory] restock ledger line: ${ledgerError.message}`);
    }
  }

  const priceMoved = Math.abs(lotCost - Number(ing.cost)) > 0.0001;
  await log(
    "inventory",
    `Restocked ${input.qty} ${ing.unit} of "${ing.name}" for ₱${input.amountPaid.toFixed(2)}` +
      (paidFrom === "unpaid"
        ? " — on utang, so no money moved and the shop now owes it"
        : ` — paid from ${PAID_FROM_LABELS[paidFrom]}`) +
      (input.updateStandardCost && priceMoved
        ? `; cost per ${ing.unit} now ₱${lotCost.toFixed(4)}`
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
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can adjust stock." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };
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

/* ------------------------------------------------------------------ */
/* Batches                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cook a batch.
 *
 * Consumes the recipe and adds the yield, in one Postgres call — thirteen
 * ingredients for Black Pepper Sauce alone, and a failure part-way through
 * would take the ingredients without producing the sauce.
 *
 * Deliberately does not refuse when stock is short. The form warns first,
 * because that is where a human can judge it: the pepper may well have been
 * bought this morning and not entered yet, and refusing to record work that
 * has actually been done is how a system starts getting worked around.
 */
export async function produceBatch(input: {
  batchId: string;
  multiplier: number;
}): Promise<Result & { cost?: number }> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can record a batch." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };
  if (!(input.multiplier > 0)) return { error: "How many batches?" };

  const supabase = createAdminClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("name, yield_qty, yield_unit")
    .eq("id", input.batchId)
    .maybeSingle();
  if (!batch) return { error: "That batch no longer exists." };

  const { data, error } = await supabase.rpc("produce_batch", {
    p_batch_id: input.batchId,
    p_multiplier: input.multiplier,
  });
  // A raise inside the function arrives here as an error message written for
  // the person reading it, so it is passed through rather than replaced.
  if (error) return { error: error.message };

  const made = Number(batch.yield_qty) * input.multiplier;
  await log(
    "movement",
    `Made ${input.multiplier}× "${batch.name}" — ${made.toLocaleString("en-PH")} ${batch.yield_unit}, cost ₱${Number(data ?? 0).toFixed(2)}`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null, cost: Number(data ?? 0) };
}

/**
 * Replace what goes into a batch, in one go.
 *
 * Rewritten wholesale rather than diffed line by line: a recipe is edited as
 * a whole thing on screen, and reconciling adds, edits and removes against
 * what was there is a lot of moving parts for no visible gain.
 */
export async function saveBatchRecipe(input: {
  batchId: string;
  lines: { refType: "inv" | "batch"; refId: string; qty: number }[];
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change recipes." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const lines = input.lines.filter((l) => l.refId && l.qty > 0);
  const supabase = createAdminClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("name")
    .eq("id", input.batchId)
    .maybeSingle();
  if (!batch) return { error: "That batch no longer exists." };

  /**
   * A batch may be made of other batches — and must not be made of itself,
   * however many hops away.
   *
   * The database refuses the direct case. This is the transitive one: butter
   * uses ji pai uses butter. `costBatches` copes with it — it has to, because
   * bad rows can arrive from an import — but coping means showing the recipe
   * as unpriceable, and it is far better to refuse the save and say why.
   *
   * Walks from each batch this recipe would draw on and looks for the way
   * back here. Reading the existing edges once is enough: the only new ones
   * are the lines being saved, and they all start at this batch.
   */
  const subs = lines.filter((l) => l.refType === "batch").map((l) => l.refId);
  if (subs.includes(input.batchId)) {
    return { error: "A batch can't be made of itself." };
  }
  if (subs.length > 0) {
    const { data: edgeRows } = await supabase
      .from("batch_ingredients")
      .select("batch_id, ref_id")
      .eq("ref_type", "batch");

    const edges = new Map<string, string[]>();
    for (const e of (edgeRows ?? []) as { batch_id: string; ref_id: string }[]) {
      // The rows for THIS batch are about to be replaced, so the old ones
      // must not be part of the check — otherwise removing a loop in the
      // same save that adds a legitimate line would still be refused.
      if (e.batch_id === input.batchId) continue;
      edges.set(e.batch_id, [...(edges.get(e.batch_id) ?? []), e.ref_id]);
    }

    const seen = new Set<string>();
    const stack = [...subs];
    while (stack.length > 0) {
      const at = stack.pop()!;
      if (at === input.batchId) {
        const { data: names } = await supabase
          .from("batches")
          .select("name")
          .in("id", subs);
        const which = ((names ?? []) as { name: string }[])
          .map((n) => `"${n.name}"`)
          .join(" or ");
        return {
          error:
            `That would make this batch part of its own recipe — ${which} ` +
            `already leads back to "${batch.name}". Take the loop out first.`,
        };
      }
      if (seen.has(at)) continue;
      seen.add(at);
      stack.push(...(edges.get(at) ?? []));
    }
  }

  const { error: clearError } = await supabase
    .from("batch_ingredients")
    .delete()
    .eq("batch_id", input.batchId);
  if (clearError) return { error: clearError.message };

  if (lines.length > 0) {
    const { error } = await supabase.from("batch_ingredients").insert(
      lines.map((l) => ({
        batch_id: input.batchId,
        ref_type: l.refType,
        ref_id: l.refId,
        qty: l.qty,
      }))
    );
    if (error) return { error: error.message };
  }

  await log(
    "inventory",
    `Changed the recipe for "${batch.name}" — ${lines.length} line${lines.length === 1 ? "" : "s"}` +
      (subs.length > 0
        ? `, ${subs.length} of them another batch`
        : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/** Same, for a dish. `refType` is "inv" for an ingredient, "batch" for a batch. */
export async function saveMealRecipe(input: {
  mealId: string;
  lines: { refType: "inv" | "batch"; refId: string; qty: number }[];
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change recipes." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const lines = input.lines.filter((l) => l.refId && l.qty > 0);
  const supabase = createAdminClient();

  const { data: meal } = await supabase
    .from("meals")
    .select("name")
    .eq("id", input.mealId)
    .maybeSingle();
  if (!meal) return { error: "That dish no longer exists." };

  const { error: clearError } = await supabase
    .from("meal_ingredients")
    .delete()
    .eq("meal_id", input.mealId);
  if (clearError) return { error: clearError.message };

  if (lines.length > 0) {
    const { error } = await supabase.from("meal_ingredients").insert(
      lines.map((l) => ({
        meal_id: input.mealId,
        ref_type: l.refType,
        ref_id: l.refId,
        qty: l.qty,
      }))
    );
    if (error) return { error: error.message };
  }

  await log(
    "inventory",
    `Changed the recipe for "${meal.name}" — ${lines.length} line${lines.length === 1 ? "" : "s"}`,
    viewer.profile?.id ?? null
  );
  revalidate();
  revalidatePath("/menu");
  return { error: null };
}

/* ------------------------------------------------------------------ */
/* Waste and internal use                                              */
/* ------------------------------------------------------------------ */

export type WasteCategory = "waste" | "internal";

/**
 * Something didn't get sold.
 *
 * Two categories, kept apart on purpose. "Waste" is stock that spoiled, spilt
 * or burnt — money gone, and a number worth driving down. "Internal" is staff
 * meals and tasting portions — also money, but money spent deliberately.
 * Adding them together produces a figure that is either an unfair
 * indictment of the kitchen or a hiding place for real spoilage, depending on
 * which way the mix runs.
 *
 * It goes through the same movement engine as a sale, so the shelf ends up
 * right either way. It is logged to `consumption_log` under its own type
 * rather than as a sale: reorder suggestions are built on what the shop
 * actually sells, and quietly buying more to cover what keeps getting thrown
 * away is how a waste problem becomes permanent.
 */
export async function recordWaste(input: {
  sourceType: "inv" | "batch";
  sourceId: string;
  qty: number;
  reason: string;
  category: WasteCategory;
  note?: string;
}): Promise<Result & { cost?: number }> {
  const viewer = await requireWaste();
  if (!viewer) return { error: "Only shop staff can log waste." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };
  if (!(input.qty > 0)) return { error: "How much was it?" };
  if (!input.reason.trim()) return { error: "What happened to it?" };

  const supabase = createAdminClient();
  const today = shopToday();
  const logType = input.category === "internal" ? "internal" : "waste";

  if (input.sourceType === "inv") {
    const { data: ing } = await supabase
      .from("ingredients")
      .select("id, name, unit, cost")
      .eq("id", input.sourceId)
      .maybeSingle();
    if (!ing) return { error: "That ingredient no longer exists." };

    const { data: cost, error } = await supabase.rpc("consume_ingredient", {
      p_ingredient_id: ing.id,
      p_qty: input.qty,
      p_date: today,
      p_type: logType,
    });
    if (error) return { error: error.message };

    const total = Number(cost ?? 0);
    await supabase.from("waste_log").insert({
      date: today,
      ingredient_id: ing.id,
      qty: input.qty,
      unit: ing.unit,
      reason: input.reason.trim(),
      cost_at_time: Number(ing.cost) || 0,
      total_cost: total,
      category: input.category,
      source_type: "inv",
      source_id: ing.id,
      source_name: ing.name,
      note: input.note?.trim() || null,
      logged_by: viewer.profile?.full_name?.trim() || viewer.email,
    });

    await log(
      "waste",
      `${input.category === "internal" ? "Internal use" : "Waste"}: ${input.qty} ${ing.unit} of "${ing.name}" — ₱${total.toFixed(2)} (${input.reason.trim()})`,
      viewer.profile?.id ?? null
    );
    revalidate();
    return { error: null, cost: total };
  }

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, yield_unit, batch_stock")
    .eq("id", input.sourceId)
    .maybeSingle();
  if (!batch) return { error: "That batch no longer exists." };

  const { data: perUnit } = await supabase.rpc("batch_cost_per_unit", {
    p_batch_id: batch.id,
  });
  const unitCost = Number(perUnit ?? 0);
  const total = unitCost * input.qty;

  const { error: stockError } = await supabase
    .from("batches")
    .update({ batch_stock: Number(batch.batch_stock) - input.qty })
    .eq("id", batch.id);
  if (stockError) return { error: stockError.message };

  await supabase.from("waste_log").insert({
    date: today,
    ingredient_id: null,
    qty: input.qty,
    unit: batch.yield_unit,
    reason: input.reason.trim(),
    cost_at_time: unitCost,
    total_cost: total,
    category: input.category,
    source_type: "batch",
    source_id: batch.id,
    source_name: batch.name,
    note: input.note?.trim() || null,
    logged_by: viewer.profile?.full_name?.trim() || viewer.email,
  });

  await log(
    "waste",
    `${input.category === "internal" ? "Internal use" : "Waste"}: ${input.qty} ${batch.yield_unit} of "${batch.name}" — ₱${total.toFixed(2)} (${input.reason.trim()})`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null, cost: total };
}

/* ------------------------------------------------------------------ */
/* Packaging                                                           */
/* ------------------------------------------------------------------ */

/**
 * What a dish needs to travel, per serving.
 *
 * Stored apart from the recipe on purpose. A dish eaten at the stall uses
 * none of it, and rolling packaging into the recipe is exactly what forced
 * 27 duplicate "(T.O)" dishes onto this menu — two entries, two prices to
 * keep in step, and a best-seller list split between the twins.
 */
export async function saveMealPackaging(input: {
  mealId: string;
  lines: { refType: "inv" | "batch"; refId: string; qty: number }[];
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change packaging." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const lines = input.lines.filter((l) => l.refId && l.qty > 0);
  const supabase = createAdminClient();

  const { data: meal } = await supabase
    .from("meals")
    .select("name")
    .eq("id", input.mealId)
    .maybeSingle();
  if (!meal) return { error: "That dish no longer exists." };

  const { error: clearError } = await supabase
    .from("meal_packaging")
    .delete()
    .eq("meal_id", input.mealId);
  if (clearError) return { error: clearError.message };

  if (lines.length > 0) {
    const { error } = await supabase.from("meal_packaging").insert(
      lines.map((l) => ({
        meal_id: input.mealId,
        ref_type: l.refType,
        ref_id: l.refId,
        qty: l.qty,
      }))
    );
    if (error) return { error: error.message };
  }

  await log(
    "inventory",
    `Changed take-out packaging for "${meal.name}" — ${lines.length} item${lines.length === 1 ? "" : "s"}`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * What a take-out ORDER needs, once — the bag.
 *
 * Separate from per-dish packaging because it does not multiply. Pricing the
 * bag into each dish charges four bags for a four-dish order, which is what
 * the old duplicate menu quietly did.
 */
export async function saveOrderPackaging(input: {
  lines: { refType: "inv" | "batch"; refId: string; qty: number }[];
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Not allowed." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const lines = input.lines.filter((l) => l.refId && l.qty > 0);
  const supabase = createAdminClient();

  const { error: clearError } = await supabase
    .from("order_packaging")
    .delete()
    .neq("id", -1);
  if (clearError) return { error: clearError.message };

  if (lines.length > 0) {
    const { error } = await supabase.from("order_packaging").insert(
      lines.map((l) => ({ ref_type: l.refType, ref_id: l.refId, qty: l.qty }))
    );
    if (error) return { error: error.message };
  }

  await log(
    "inventory",
    `Changed what every take-out order includes — ${lines.length} item${lines.length === 1 ? "" : "s"}`,
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * A new batch, from the Inventory tab.
 *
 * There was no way to make one. Batches could be costed, cooked, edited and
 * drawn on — and the only way to get a new one into the system at all was the
 * legacy importer. So the shop could use the twenty-six it started with and
 * never add the twenty-seventh, which is the sort of gap that is invisible
 * until somebody invents a new sauce.
 *
 * The recipe is not asked for here. Naming the thing and saying what a batch
 * makes is one decision; what goes in it is another, usually taken standing
 * at the shelf. So this creates it and the recipe editor fills it in.
 */
export async function createBatch(input: {
  name: string;
  yieldQty: number;
  yieldUnit: string;
  reorderLevel: number;
  /** Set for a repack — a bought item split into portions, with no recipe. */
  manualCostPerUnit: number | null;
}): Promise<Result & { id?: string }> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can add a batch." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const name = input.name.trim();
  if (!name) return { error: "What's it called?" };
  if (!(input.yieldQty > 0)) {
    return { error: "How much does one batch make? That's what every recipe divides by." };
  }
  const unit = input.yieldUnit.trim();
  if (!unit) return { error: "What unit — g, ml, pcs?" };

  const supabase = createAdminClient();

  // One batch, one row. A second "Black Pepper Sauce" would split the stock
  // in two and leave every recipe pointing at whichever one was picked that
  // day — the same failure the supplier list exists to prevent.
  const { data: clash } = await supabase
    .from("batches")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();
  if (clash) return { error: `You already have a batch called “${clash.name}”.` };

  const { data, error } = await supabase
    .from("batches")
    .insert({
      name,
      yield_qty: input.yieldQty,
      yield_unit: unit,
      batch_stock: 0,
      reorder_level: Math.max(0, input.reorderLevel || 0),
      manual_cost_per_unit:
        input.manualCostPerUnit && input.manualCostPerUnit > 0
          ? input.manualCostPerUnit
          : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not add it." };

  await log(
    "inventory",
    `Added the batch "${name}" — makes ${input.yieldQty.toLocaleString("en-PH")} ${unit} a batch` +
      (input.manualCostPerUnit ? ", priced by hand as a repack" : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null, id: data.id as string };
}

/**
 * What happened to a batch.
 *
 * Its stock moves for four different reasons — it was made, a dish used it, a
 * bigger batch drew on it, somebody threw it away — and until now the number
 * just changed with nothing on screen to say why. "Why is there only 200g of
 * sauce" had no answer short of guessing.
 *
 * Read from what the system already writes rather than from a new table: the
 * activity log has every one of those events in it, because each of them goes
 * through an action that logs. A movements table would be a second copy of
 * the same facts, and the day the two disagree neither is trustworthy.
 */
export async function batchHistory(
  batchId: string
): Promise<{ rows: Activity[]; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "stock.view")) return { rows: [], error: null };

  const supabase = createAdminClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("name")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) return { rows: [], error: "That batch no longer exists." };

  // Matched on the name as the log line spells it. Every line that names a
  // batch wraps it in curly quotes, which is what stops "Sauce" also matching
  // "Sauce Base".
  return loadActivity({ mentions: batch.name as string, limit: 60 });
}

/** What happened to one ingredient — same reader, same reasoning as a batch's. */
export async function ingredientHistory(
  ingredientId: string
): Promise<{ rows: Activity[]; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "stock.view")) return { rows: [], error: null };

  const supabase = createAdminClient();
  const { data: ing } = await supabase
    .from("ingredients")
    .select("name")
    .eq("id", ingredientId)
    .maybeSingle();
  if (!ing) return { rows: [], error: "That ingredient no longer exists." };

  return loadActivity({ mentions: ing.name as string, limit: 60 });
}

/**
 * Change what a batch is, rather than what is in it.
 *
 * Its name, what one batch makes, when to nag. Separate from the recipe
 * editor because they are different decisions taken at different moments —
 * and because a yield changed by accident silently reprices every dish that
 * draws on this batch, which is worth a deliberate trip to a different form.
 */
export async function saveBatch(input: {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  reorderLevel: number;
  manualCostPerUnit: number | null;
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can change a batch." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const name = input.name.trim();
  if (!name) return { error: "What's it called?" };
  if (!(input.yieldQty > 0)) return { error: "How much does one batch make?" };
  const unit = input.yieldUnit.trim();
  if (!unit) return { error: "What unit — g, ml, pcs?" };

  const supabase = createAdminClient();
  const { data: clash } = await supabase
    .from("batches")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();
  if (clash && clash.id !== input.id) {
    return { error: `You already have a batch called “${clash.name}”.` };
  }

  const { data: was } = await supabase
    .from("batches")
    .select("name, yield_qty")
    .eq("id", input.id)
    .maybeSingle();
  if (!was) return { error: "That batch no longer exists." };

  const { error } = await supabase
    .from("batches")
    .update({
      name,
      yield_qty: input.yieldQty,
      yield_unit: unit,
      reorder_level: Math.max(0, input.reorderLevel || 0),
      manual_cost_per_unit:
        input.manualCostPerUnit && input.manualCostPerUnit > 0
          ? input.manualCostPerUnit
          : null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  await log(
    "inventory",
    `Edited the batch "${name}"` +
      (was.name !== name ? ` — was "${was.name}"` : "") +
      (Number(was.yield_qty) !== input.yieldQty
        ? `; now makes ${input.yieldQty.toLocaleString("en-PH")} ${unit} a batch, which reprices every dish that uses it`
        : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * Remove a batch.
 *
 * Refused while anything still points at it — a dish, or another batch. The
 * refs carry no foreign key (see 0046), so nothing in the database would stop
 * this: the row would vanish and every recipe using it would quietly cost ₱0
 * from then on, which reads as a wonderful margin rather than as a hole.
 */
export async function deleteBatch(id: string): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can remove a batch." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };

  const supabase = createAdminClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("name, batch_stock")
    .eq("id", id)
    .maybeSingle();
  if (!batch) return { error: null };

  const [{ data: inMeals }, { data: inBatches }] = await Promise.all([
    supabase
      .from("meal_ingredients")
      .select("meal_id")
      .eq("ref_type", "batch")
      .eq("ref_id", id)
      .limit(5),
    supabase
      .from("batch_ingredients")
      .select("batch_id")
      .eq("ref_type", "batch")
      .eq("ref_id", id)
      .limit(5),
  ]);

  const usedByMeals = (inMeals ?? []).length;
  const usedByBatches = (inBatches ?? []).length;
  if (usedByMeals > 0 || usedByBatches > 0) {
    const parts = [
      usedByMeals > 0 && `${usedByMeals} dish${usedByMeals === 1 ? "" : "es"}`,
      usedByBatches > 0 &&
        `${usedByBatches} other batch${usedByBatches === 1 ? "" : "es"}`,
    ].filter(Boolean);
    return {
      error:
        `"${batch.name}" is still used by ${parts.join(" and ")}. Take it out ` +
        `of those recipes first — removing it now would cost them at ₱0 and ` +
        `nothing on screen would say why.`,
    };
  }

  const { error } = await supabase.from("batches").delete().eq("id", id);
  if (error) return { error: error.message };

  await log(
    "inventory",
    `Removed the batch "${batch.name}"` +
      (Number(batch.batch_stock) > 0
        ? ` — ${Number(batch.batch_stock).toLocaleString("en-PH")} still recorded as made`
        : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}

/**
 * Correct what a batch says it has.
 *
 * The ingredient side has had this since the beginning — count the shelf,
 * type what is actually there. A batch never did, so the only ways its stock
 * could move were making more, selling it, or writing it off. There was no
 * way to say "the tub says 600g and the system says 800g".
 *
 * Deliberately NOT the same thing as a write-off, and the form says so. A
 * correction means the number was wrong; a write-off means the sauce was real
 * and went off. Only the second reaches spoilage, and spoilage is in
 * break-even — so a shop that corrects everything quietly reports lower costs
 * than it has.
 *
 * Written straight to `batch_stock` rather than through the lot machinery:
 * batches have no lots. `produce_batch` adds, `consume_for_order` and the
 * waste log subtract, and this sets. One column, and the activity log carries
 * the why.
 */
export async function adjustBatchStock(input: {
  batchId: string;
  countedQty: number;
  note?: string;
}): Promise<Result> {
  const viewer = await requireStock();
  if (!viewer) return { error: "Only shop staff can adjust stock." };
  if (await offShift(viewer)) return { error: NOT_ON_SHIFT };
  if (!Number.isFinite(input.countedQty) || input.countedQty < 0) {
    return { error: "Enter the counted amount." };
  }

  const supabase = createAdminClient();
  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, yield_unit, batch_stock")
    .eq("id", input.batchId)
    .maybeSingle();
  if (!batch) return { error: "That batch no longer exists." };

  const was = Number(batch.batch_stock) || 0;
  const variance = input.countedQty - was;
  if (Math.abs(variance) < 0.0001) return { error: "That's already the count." };

  const { error } = await supabase
    .from("batches")
    .update({ batch_stock: input.countedQty })
    .eq("id", input.batchId);
  if (error) return { error: error.message };

  await log(
    "movement",
    `Counted "${batch.name}" — ${was.toLocaleString("en-PH")} → ` +
      `${input.countedQty.toLocaleString("en-PH")} ${batch.yield_unit} ` +
      `(${variance > 0 ? "+" : ""}${variance.toLocaleString("en-PH")})` +
      (input.note?.trim() ? ` · ${input.note.trim()}` : ""),
    viewer.profile?.id ?? null
  );
  revalidate();
  return { error: null };
}
