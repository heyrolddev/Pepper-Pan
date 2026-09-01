"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";

type Result = { error: string | null };

async function requireOwner() {
  const viewer = await getViewer();
  return can(viewer, "business") ? viewer : null;
}

function done() {
  revalidatePath("/admin/money");
  revalidatePath("/admin");
}

async function log(description: string, actor: string | null) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("activity_log")
    .insert({ category: "money", description, actor });
  if (error) console.error(`[money] log: ${error.message}`);
}

/* ---------------- fixed costs ---------------- */

export async function saveFixedCost(input: {
  id?: string;
  label: string;
  amount: number;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change the shop's bills." };
  const label = input.label.trim();
  if (!label) return { error: "What is it for?" };
  if (!(input.amount >= 0)) return { error: "How much a month?" };

  const supabase = createAdminClient();
  const { error } = input.id
    ? await supabase
        .from("fixed_costs")
        .update({ label, amount: input.amount })
        .eq("id", input.id)
    : await supabase.from("fixed_costs").insert({ label, amount: input.amount });
  if (error) return { error: error.message };

  await log(`Set "${label}" at ₱${input.amount.toFixed(2)} a month`, owner.profile?.id ?? null);
  done();
  return { error: null };
}

export async function deleteFixedCost(id: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change the shop's bills." };
  const supabase = createAdminClient();
  const { error } = await supabase.from("fixed_costs").delete().eq("id", id);
  if (error) return { error: error.message };
  done();
  return { error: null };
}

export async function setOpenDays(days: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change this." };
  if (!(days >= 1 && days <= 31)) return { error: "Somewhere between 1 and 31." };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({ open_days_per_month: Math.round(days) })
    .eq("id", 1);
  if (error) return { error: error.message };
  done();
  return { error: null };
}

/* ---------------- cash ---------------- */

/**
 * Start counting the drawer from today.
 *
 * Deliberately not retroactive. Reconstructing a cash balance from months of
 * history means guessing at every peso that was ever taken out for tricycle
 * fare, and a balance built on guesses is worse than no balance — it looks
 * authoritative and drifts.
 */
export async function startCashTracking(openingAmount: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can start cash tracking." };
  if (!(openingAmount >= 0)) return { error: "How much is in the drawer now?" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({
      cash_balance_enabled: true,
      cash_balance_starting_amount: openingAmount,
      cash_balance_start_date: shopToday(),
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  await log(
    `Started counting cash from ₱${openingAmount.toFixed(2)}`,
    owner.profile?.id ?? null
  );
  done();
  return { error: null };
}

export async function addCashEntry(input: {
  type: "in" | "out";
  amount: number;
  category?: string;
  note?: string;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: "Only the owner can record cash." };
  if (!(input.amount > 0)) return { error: "How much?" };

  const supabase = createAdminClient();
  const { error } = await supabase.from("cash_ledger").insert({
    date: shopToday(),
    type: input.type,
    amount: input.amount,
    category: input.category?.trim() || null,
    note: input.note?.trim() || null,
    logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
  });
  if (error) return { error: error.message };

  await log(
    `Cash ${input.type === "in" ? "in" : "out"} ₱${input.amount.toFixed(2)}${
      input.note?.trim() ? ` — ${input.note.trim()}` : ""
    }`,
    viewer!.profile?.id ?? null
  );
  done();
  return { error: null };
}

/* ---------------- utang ---------------- */

export async function addReceivable(input: {
  customer: string;
  phone?: string;
  amount: number;
  note?: string;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: "Only the owner can record utang." };
  if (!input.customer.trim()) return { error: "Whose is it?" };
  if (!(input.amount > 0)) return { error: "How much?" };

  const supabase = createAdminClient();
  const { error } = await supabase.from("receivables").insert({
    date: shopToday(),
    customer: input.customer.trim(),
    phone: input.phone?.trim() || null,
    amount: input.amount,
    note: input.note?.trim() || null,
  });
  if (error) return { error: error.message };
  await log(
    `Utang: ${input.customer.trim()} ₱${input.amount.toFixed(2)}`,
    viewer!.profile?.id ?? null
  );
  done();
  return { error: null };
}

/**
 * Somebody paid some of it back.
 *
 * Partial by design. "₱500 owed, ₱200 paid" stays one row with its own date,
 * rather than a deletion and a fresh row that loses when the debt started —
 * which is the part that tells you whether to keep extending it.
 */
export async function collectReceivable(input: {
  id: string;
  amount: number;
  /** Whether the collected cash went into the drawer. */
  toDrawer: boolean;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: "Only the owner can collect." };
  if (!(input.amount > 0)) return { error: "How much did they pay?" };

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("receivables")
    .select("id, customer, amount, amount_collected")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { error: "That utang no longer exists." };

  const already = Number(row.amount_collected) || 0;
  const total = Number(row.amount) || 0;
  const collected = Math.min(total, already + input.amount);

  const { error } = await supabase
    .from("receivables")
    .update({
      amount_collected: collected,
      collected: collected >= total - 0.005,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  if (input.toDrawer) {
    await supabase.from("cash_ledger").insert({
      date: shopToday(),
      type: "in",
      amount: input.amount,
      category: "utang",
      note: `Collected from ${row.customer ?? "a customer"}`,
      logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
    });
  }

  await log(
    `Collected ₱${input.amount.toFixed(2)} from ${row.customer ?? "a customer"}`,
    viewer!.profile?.id ?? null
  );
  done();
  return { error: null };
}

/* ---------------- assets and payback ---------------- */

export async function saveAsset(input: {
  id?: string;
  name: string;
  amount: number;
  boughtOn?: string | null;
  note?: string;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change this." };
  if (!input.name.trim()) return { error: "What is it?" };
  if (!(input.amount >= 0)) return { error: "What did it cost?" };

  const supabase = createAdminClient();
  const row = {
    name: input.name.trim(),
    amount: input.amount,
    bought_on: input.boughtOn || null,
    note: input.note?.trim() || null,
  };
  const { error } = input.id
    ? await supabase.from("assets").update(row).eq("id", input.id)
    : await supabase.from("assets").insert(row);
  if (error) return { error: error.message };
  done();
  return { error: null };
}

export async function deleteAsset(id: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change this." };
  const supabase = createAdminClient();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) return { error: error.message };
  done();
  return { error: null };
}

/** Draw the line and start counting payback from a date. */
export async function setPaybackFrom(date: string | null): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change this." };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({ payback_from: date })
    .eq("id", 1);
  if (error) return { error: error.message };
  done();
  return { error: null };
}
