"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { isAccount, type Account } from "@/lib/money-accounts";
import { SPEND_KINDS, SPEND_LABEL, type SpendKind } from "@/lib/spending";

/**
 * Paying suppliers, and buying the things that are not ingredients.
 *
 * ── The rule that shapes this whole file ─────────────────────────────────
 *
 * A debt does not move money. Settling it does.
 *
 * When a delivery is taken on utang the cash is still in the drawer, so
 * writing a ledger line then would make the drawer fail a physical count —
 * and that count is the only self-correcting check on the money screen. So a
 * debt is recorded as a debt, and `settleDebt` is the one thing here that
 * writes to `cash_ledger`, on the day the supplier is actually paid, out of
 * the pot the money actually came from.
 *
 * Everything paid for on the spot writes its ledger line immediately, for the
 * same reason read the other way: the money really has gone.
 */

type Result = { error: string | null };

function revalidate() {
  revalidatePath("/admin/money");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

async function mayManageMoney() {
  const viewer = await getViewer();
  return can(viewer, "business") ? viewer : null;
}

/** A number off a form, which is a string and may be nonsense. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export type DebtRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  description: string;
  amount: number;
  paid: number;
  incurred_on: string;
  source: string;
  note: string | null;
};

export type RunningCostRow = {
  id: string;
  label: string;
  kind: SpendKind;
  amount: number;
  size_label: string | null;
  spent_on: string;
  supplier_id: string | null;
  note: string | null;
};

/**
 * Record a debt the shop has taken on.
 *
 * Called from `recordRestock` when a delivery is taken unpaid, and from the
 * Spend flow for anything else bought on utang. Writes NOTHING to the ledger,
 * which is the point — see the note at the top of this file.
 *
 * Exported so `recordRestock` can call it rather than duplicating the insert:
 * a second copy of "what a debt looks like" is how the two drift apart.
 */
export async function recordDebt(input: {
  supplierId: string | null;
  supplierName: string | null;
  description: string;
  amount: number;
  source: "restock" | "spend" | "manual";
  note?: string | null;
  actorId?: string | null;
}): Promise<Result> {
  if (input.amount <= 0) return { error: null };

  const { error } = await createAdminClient().from("supplier_debts").insert({
    supplier_id: input.supplierId,
    // Frozen text, the way `orders.cogs` is frozen: a supplier renamed or
    // removed later must not silently relabel a debt already settled.
    supplier_name: input.supplierName,
    description: input.description,
    amount: input.amount,
    incurred_on: shopToday(),
    source: input.source,
    note: input.note ?? null,
    created_by: input.actorId ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function addDebt(input: {
  supplierId: string;
  description: string;
  amount: number;
  note: string;
}): Promise<Result> {
  const viewer = await mayManageMoney();
  if (!viewer) return { error: "Only the owner or a manager can record a debt." };

  const amount = num(input.amount);
  if (amount <= 0) return { error: "How much is owed?" };
  const description = input.description.trim();
  if (!description) return { error: "What was it for?" };

  let supplierName: string | null = null;
  if (input.supplierId) {
    const { data } = await createAdminClient()
      .from("suppliers")
      .select("name")
      .eq("id", input.supplierId)
      .maybeSingle();
    supplierName = (data?.name as string) ?? null;
  }

  const res = await recordDebt({
    supplierId: input.supplierId || null,
    supplierName,
    description,
    amount,
    source: "manual",
    note: input.note.trim() || null,
    actorId: viewer.profile?.id ?? null,
  });
  if (res.error) return res;
  revalidate();
  return { error: null };
}

/**
 * Pay a supplier — all of it, half of it, or a figure typed in.
 *
 * This is the only place in the file that moves money, and it does two things
 * that must both happen or neither: the debt's `paid` goes up, and a matching
 * `out` line lands in the chosen pot.
 *
 * The ledger line is written FIRST. If the debt update then fails, the shop
 * sees money gone from the drawer with a debt still open — visibly wrong, and
 * correctable by hand. The other order fails silently: a debt marked paid with
 * the cash still sitting in the drawer looks completely fine and quietly
 * overstates the balance for ever. Between two failure modes, take the one
 * somebody will notice.
 */
export async function settleDebt(input: {
  id: string;
  /** How much of it is being paid now. */
  amount: number;
  account: Account;
}): Promise<Result> {
  const viewer = await mayManageMoney();
  if (!viewer) return { error: "Only the owner or a manager can pay a supplier." };
  if (!isAccount(input.account)) return { error: "Which pot did the money come from?" };

  const supabase = createAdminClient();
  const { data: debt, error: readError } = await supabase
    .from("supplier_debts")
    .select("id, supplier_name, description, amount, paid")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!debt) return { error: "That debt is no longer there." };

  const owed = Number(debt.amount) - Number(debt.paid);
  const paying = Math.min(num(input.amount), owed);
  if (paying <= 0) {
    return { error: owed <= 0 ? "That one is already settled." : "How much are you paying?" };
  }

  const { error: ledgerError } = await supabase.from("cash_ledger").insert({
    date: shopToday(),
    type: "out",
    account: input.account,
    amount: paying,
    category: "Supplier",
    note:
      `Paid ${debt.supplier_name ? debt.supplier_name : "supplier"} — ${debt.description}` +
      (paying < owed ? " (part payment)" : ""),
    logged_by: viewer.profile?.id ?? null,
  });
  if (ledgerError) return { error: ledgerError.message };

  const { error: debtError } = await supabase
    .from("supplier_debts")
    .update({ paid: Number(debt.paid) + paying })
    .eq("id", input.id);
  if (debtError) {
    return {
      error:
        `The money was recorded as leaving the ${input.account}, but the debt did not ` +
        `update: ${debtError.message}. Check both before paying again.`,
    };
  }

  revalidate();
  return { error: null };
}

export async function deleteDebt(id: string): Promise<Result> {
  const viewer = await mayManageMoney();
  if (!viewer) return { error: "Only the owner or a manager can remove a debt." };

  // Only an unpaid one. A debt with payments against it has ledger lines
  // pointing at it, and deleting it would leave money gone from a pot with
  // nothing on screen to explain why.
  const supabase = createAdminClient();
  const { data: debt } = await supabase
    .from("supplier_debts")
    .select("paid")
    .eq("id", id)
    .maybeSingle();
  if (debt && Number(debt.paid) > 0) {
    return {
      error:
        "You've already paid part of this one, and that payment is in the ledger. " +
        "Settle the rest instead of removing it.",
    };
  }

  const { error } = await supabase.from("supplier_debts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}

/**
 * Money spent on something that is not an ingredient.
 *
 * One entry point for three destinations, because from where the owner is
 * standing it is one action — "I bought something" — and the differences are
 * questions the form asks rather than screens to choose between.
 *
 *   supplies / gas / repair / other → `running_costs`, and into break-even
 *   asset                           → `assets`, and into payback
 *
 * Fixed costs are deliberately NOT here. Rent is not a purchase; it is a
 * standing figure that the break-even sum divides, and it already has its own
 * editor. Putting it behind the same button would invite it to be entered
 * monthly as well as standing, and counted twice.
 */
export async function recordSpend(input: {
  label: string;
  /** A running-cost kind, or "asset". */
  kind: SpendKind | "asset";
  amount: number;
  /** Gas only: "22kg", "11kg". */
  sizeLabel: string;
  /** Which pot it came out of, or "unpaid" for utang. */
  paidFrom: Account | "unpaid";
  supplierId: string;
  note: string;
}): Promise<Result> {
  const viewer = await mayManageMoney();
  if (!viewer) return { error: "Only the owner or a manager can record a spend." };

  const label = input.label.trim();
  if (!label) return { error: "What did you buy?" };
  const amount = num(input.amount);
  if (amount <= 0) return { error: "How much was it?" };

  const isAsset = input.kind === "asset";
  if (!isAsset && !SPEND_KINDS.includes(input.kind as SpendKind)) {
    return { error: "What kind of spend was this?" };
  }

  const supabase = createAdminClient();
  const today = shopToday();

  let supplierName: string | null = null;
  if (input.supplierId) {
    const { data } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", input.supplierId)
      .maybeSingle();
    supplierName = (data?.name as string) ?? null;
  }

  // The record of the thing itself, written before any money moves — for the
  // same reason `recordRestock` writes the stock before the ledger line. A
  // ledger line for a purchase that failed to record takes pesos out of a pot
  // with nothing on screen to explain them.
  const { error: rowError } = isAsset
    ? await supabase.from("assets").insert({
        name: label,
        amount,
        bought_on: today,
        note: input.note.trim() || null,
        paid_from: input.paidFrom,
      })
    : await supabase.from("running_costs").insert({
        label,
        kind: input.kind,
        amount,
        // Only gas carries a size, and only when one was typed. An empty
        // string here would make `tankLife` count a sizeless refill as a
        // size of its own.
        size_label:
          input.kind === "gas" && input.sizeLabel.trim() ? input.sizeLabel.trim() : null,
        spent_on: today,
        supplier_id: input.supplierId || null,
        note: input.note.trim() || null,
        created_by: viewer.profile?.id ?? null,
      });
  if (rowError) return { error: rowError.message };

  if (input.paidFrom === "unpaid") {
    const res = await recordDebt({
      supplierId: input.supplierId || null,
      supplierName,
      description: label,
      amount,
      source: "spend",
      note: input.note.trim() || null,
      actorId: viewer.profile?.id ?? null,
    });
    if (res.error) return res;
  } else {
    const { error: ledgerError } = await supabase.from("cash_ledger").insert({
      date: today,
      type: "out",
      account: input.paidFrom,
      amount,
      category: isAsset ? "Equipment" : SPEND_LABEL[input.kind as SpendKind],
      note: label + (supplierName ? ` — ${supplierName}` : ""),
      logged_by: viewer.profile?.id ?? null,
    });
    // Reported, not fatal: the purchase happened, and refusing to record it
    // because the ledger line would not write leaves the shop further from
    // the truth than a missing ledger row does. Same call `recordRestock`
    // makes, for the same reason.
    if (ledgerError) {
      console.error(`[spend] ledger line: ${ledgerError.message}`);
    }
  }

  revalidate();
  return { error: null };
}

export async function deleteRunningCost(id: string): Promise<Result> {
  const viewer = await mayManageMoney();
  if (!viewer) return { error: "Only the owner or a manager can remove a spend." };
  const { error } = await createAdminClient().from("running_costs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}
