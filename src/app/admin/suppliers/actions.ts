"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Supplier } from "@/lib/suppliers";
import type { PurchaseLine } from "@/lib/supplier-prices";

/**
 * The people the shop buys from.
 *
 * Read by anyone on shift — the restock form needs the list, and a shift
 * records deliveries. Written by the owner and a manager, because a supplier
 * list that anyone can edit becomes a supplier list with four spellings of
 * the same person in it, which is the problem this table exists to solve.
 */

type Result = { error: string | null };

const COLUMNS = "id, name, phone, place, sells, note, active";

function revalidate() {
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/money");
}

export async function listSuppliers(): Promise<{
  rows: Supplier[];
  error: string | null;
}> {
  const viewer = await getViewer();
  if (!can(viewer, "stock.view")) return { rows: [], error: null };

  const { data, error } = await createAdminClient()
    .from("suppliers")
    .select(COLUMNS)
    .order("active", { ascending: false })
    .order("name");

  // A missing table is migration 0045 not having been run, which the page
  // says in words rather than showing as a crash.
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as Supplier[], error: null };
}

export async function saveSupplier(input: {
  /** Absent when creating. */
  id?: string;
  name: string;
  phone: string;
  place: string;
  sells: string;
  note: string;
  active: boolean;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) {
    return { error: "Only the owner or a manager can change the supplier list." };
  }

  const name = input.name.trim();
  if (!name) return { error: "What do you call them?" };

  const supabase = createAdminClient();

  // The whole point of the table is that one supplier is one row. Checked
  // case-insensitively, because "Aling Nena" and "aling nena" are the same
  // person and the shop would not thank us for a list containing both.
  const { data: clash } = await supabase
    .from("suppliers")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();
  if (clash && clash.id !== input.id) {
    return { error: `You already have a supplier called “${clash.name}”.` };
  }

  const row = {
    name,
    phone: input.phone.trim() || null,
    place: input.place.trim() || null,
    sells: input.sells.trim() || null,
    note: input.note.trim() || null,
    active: input.active,
  };

  const { error } = input.id
    ? await supabase.from("suppliers").update(row).eq("id", input.id)
    : await supabase.from("suppliers").insert(row);

  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

/**
 * Add a supplier from wherever the shop happens to be standing.
 *
 * The restock form needs this: a delivery arrives from somebody not on the
 * list, and sending the person to another tab to add them — while holding a
 * sack of chicken — is how the free-text field gets used instead, which is
 * the habit this replaces. Returns the new id so the form can select it.
 */
export async function quickAddSupplier(
  name: string
): Promise<{ id: string | null; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "stock.manage")) {
    return { id: null, error: "Only shop staff can add a supplier." };
  }
  const clean = name.trim();
  if (!clean) return { id: null, error: "What do you call them?" };

  const supabase = createAdminClient();

  // Already there under a different capitalisation? Use that one rather than
  // making the duplicate this table exists to prevent.
  const { data: found } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", clean)
    .maybeSingle();
  if (found) {
    revalidate();
    return { id: found.id as string, error: null };
  }

  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: error?.message ?? "Could not add them." };

  revalidate();
  return { id: data.id as string, error: null };
}

export async function deleteSupplier(id: string): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) {
    return { error: "Only the owner or a manager can remove a supplier." };
  }

  // Deliveries and debts keep pointing at nothing rather than disappearing —
  // `on delete set null` on both, and `supplier_name` on a debt is frozen
  // text, so a settled debt still says who it was owed to.
  const { error } = await createAdminClient().from("suppliers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

/**
 * What the shop has bought from one supplier, and what it paid each time.
 *
 * The recording already happened — every delivery has written a
 * `purchase_log` row carrying the supplier, the ingredient, the quantity and
 * the amount since 0045. The supplier screen simply never read any of it and
 * showed a free-text note saying what they sell, which is a label rather
 * than a basis for anything.
 *
 * Other suppliers' lines for the SAME ingredients come back too, and that is
 * the point rather than a bonus. A price history says whether somebody is
 * getting dearer; it cannot say whether they were ever the right choice, and
 * the shop has always had the answer to that without ever being shown it
 * side by side.
 *
 * Costs, so it is gated on `stock.manage` — the same line the restock form
 * draws, and for the same reason: you cannot record a delivery without
 * knowing what was paid for it.
 */
export async function supplierPurchases(supplierId: string): Promise<{
  lines: PurchaseLine[];
  others: PurchaseLine[];
  error: string | null;
}> {
  const viewer = await getViewer();
  if (!can(viewer, "stock.manage")) {
    return { lines: [], others: [], error: null };
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("purchase_log")
    .select(
      "id, date, qty, cost, supplier, supplier_id, ingredient_id, ingredients(name, unit), suppliers(name)"
    )
    .order("date", { ascending: false })
    .limit(500);

  if (error) {
    return { lines: [], others: [], error: error.message };
  }

  type Row = {
    id: string;
    date: string;
    qty: number;
    cost: number | null;
    supplier: string | null;
    supplier_id: string | null;
    ingredient_id: string;
    ingredients: { name: string; unit: string } | { name: string; unit: string }[] | null;
    suppliers: { name: string } | { name: string }[] | null;
  };

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const all: PurchaseLine[] = ((data ?? []) as Row[]).map((r) => {
    const ing = one(r.ingredients);
    return {
      id: r.id,
      date: r.date,
      ingredientId: r.ingredient_id,
      ingredientName: ing?.name ?? "Something",
      unit: ing?.unit ?? "",
      supplierId: r.supplier_id,
      // The linked supplier's current name, falling back to the text written
      // at the time. Rows from before 0045 have only the text.
      supplierName: one(r.suppliers)?.name ?? r.supplier,
      qty: Number(r.qty) || 0,
      paid: Number(r.cost) || 0,
    };
  });

  return {
    lines: all.filter((l) => l.supplierId === supplierId),
    others: all.filter((l) => l.supplierId !== supplierId),
    error: null,
  };
}
