"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { ACCOUNT_SHORT, isAccount, type Account } from "@/lib/money-accounts";
import { isBillKind, monthLabel, monthOf } from "@/lib/monthly-bills";

type Result = { error: string | null };

async function requireOwner() {
  const viewer = await getViewer();
  return can(viewer, "business") ? viewer : null;
}

function done() {
  revalidatePath("/admin/money");
  revalidatePath("/admin");
}

/** For an error message, where the shop's own sign reads better than a code. */
function pesoPlain(n: number): string {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  kind?: string;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change the shop's bills." };
  const label = input.label.trim();
  if (!label) return { error: "What is it for?" };
  if (!(input.amount >= 0)) return { error: "How much a month?" };
  const kind = isBillKind(input.kind) ? input.kind : "overhead";

  const supabase = createAdminClient();
  const { error } = input.id
    ? await supabase
        .from("fixed_costs")
        .update({ label, amount: input.amount, kind })
        .eq("id", input.id)
    : await supabase.from("fixed_costs").insert({ label, amount: input.amount, kind });
  if (error) return { error: error.message };

  await log(`Set "${label}" at ₱${input.amount.toFixed(2)} a month`, owner.profile?.id ?? null);
  done();
  return { error: null };
}

/* ---------------- what a bill actually came to ---------------- */

/**
 * Record — or correct — one bill for one month.
 *
 * An upsert on (bill, month) rather than an insert, because the month a bill
 * is entered twice is the month it silently doubles break-even. The database
 * has a unique constraint saying the same thing (migration 0058); this is the
 * half of it that turns a second entry into a CORRECTION instead of an error
 * the owner has to understand.
 */
export async function saveMonthlyBill(input: {
  billId: string;
  /** Any date in the month. Normalised here so a picker can hand over a day. */
  month: string;
  amount: number;
  note?: string;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can record the shop's bills." };
  if (!input.billId) return { error: "Which bill is this?" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.month)) return { error: "Which month?" };
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { error: "How much was it?" };
  }
  const month = monthOf(input.month);
  // A bill cannot have arrived for a month that has not started. Typing 2027
  // instead of 2026 is one keystroke, and it would sit at the top of the
  // history as the newest figure — which is the one break-even averages.
  if (month > monthOf(shopToday())) {
    return { error: `${monthLabel(month)} has not happened yet.` };
  }

  const supabase = createAdminClient();
  const { data: bill } = await supabase
    .from("fixed_costs")
    .select("label")
    .eq("id", input.billId)
    .maybeSingle();
  if (!bill) return { error: "That bill is no longer on the list." };

  const { error } = await supabase.from("monthly_bills").upsert(
    {
      fixed_cost_id: input.billId,
      month,
      amount: input.amount,
      note: input.note?.trim() || null,
      created_by: owner.profile?.id ?? null,
    },
    { onConflict: "fixed_cost_id,month" }
  );
  if (error) return { error: error.message };

  await log(
    `${bill.label} for ${monthLabel(month)}: ₱${input.amount.toFixed(2)}`,
    owner.profile?.id ?? null
  );
  done();
  return { error: null };
}

export async function deleteMonthlyBill(id: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change the shop's bills." };
  const supabase = createAdminClient();
  const { error } = await supabase.from("monthly_bills").delete().eq("id", id);
  if (error) return { error: error.message };
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

/**
 * Start counting the e-wallet, the same way the drawer is counted.
 *
 * A start date and an opening figure, and nothing retroactive. Without them
 * the balance would be every GCash sale since the shop opened — a running
 * total that only ever climbs, which looks authoritative and is wrong from
 * the first cash-out.
 */
export async function startGcashTracking(openingAmount: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can start counting GCash." };
  if (!(openingAmount >= 0)) return { error: "How much is in GCash now?" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({
      gcash_balance_enabled: true,
      gcash_balance_starting_amount: openingAmount,
      gcash_balance_start_date: shopToday(),
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  await log(
    `Started counting GCash from ₱${openingAmount.toFixed(2)}`,
    owner.profile?.id ?? null
  );
  done();
  return { error: null };
}

/**
 * Start counting the bank, the same way the drawer and the e-wallet are.
 *
 * No sales query anywhere for this one: nobody pays for noodles by transfer,
 * so the balance is the opening figure plus what the owner records moving.
 */
export async function startBankTracking(openingAmount: number): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can start counting the bank." };
  if (!(openingAmount >= 0)) return { error: "How much is in the bank now?" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({
      bank_balance_enabled: true,
      bank_balance_starting_amount: openingAmount,
      bank_balance_start_date: shopToday(),
    })
    .eq("id", 1);
  if (error) return { error: error.message };
  await log(
    `Started counting the bank from ₱${openingAmount.toFixed(2)}`,
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
  /**
   * Which pot moved. Defaults to the drawer, which every caller meant before
   * there was more than one — and which every row written before 0042 was.
   */
  account?: Account;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) return { error: "Only the owner can record cash." };
  if (!(input.amount > 0)) return { error: "How much?" };

  const account: Account = isAccount(input.account) ? input.account : "cash";

  const supabase = createAdminClient();
  const { error } = await supabase.from("cash_ledger").insert({
    date: shopToday(),
    type: input.type,
    amount: input.amount,
    account,
    category: input.category?.trim() || null,
    note: input.note?.trim() || null,
    logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
  });
  if (error) return { error: error.message };

  await log(
    `${ACCOUNT_SHORT[account]} ${input.type === "in" ? "in" : "out"} ₱${input.amount.toFixed(2)}${
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
  /**
   * Which pot the payment landed in, or "none" if it landed in no pot yet.
   *
   * This was a boolean — `toDrawer` — and the ledger line it wrote carried no
   * `account` at all, so it took the column default and went into the drawer
   * whatever actually happened. A customer settling their utang by GCash
   * therefore added pesos to a drawer nobody had put anything in, and took
   * nothing off the GCash balance that really had gone up. Two balances
   * wrong, total right, and nothing on any screen saying so.
   *
   * "none" is kept as a real answer rather than dropped. Somebody paying in
   * goods, or handing over cash that has not been counted into the drawer
   * yet, is a settled utang and an untouched pot — and forcing a pot on it
   * would put money in a balance that cannot be counted against anything.
   */
  account: Account | "none";
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
  const outstanding = total - already;

  /**
   * More than is owed is refused, not quietly clamped.
   *
   * The utang was capped with `Math.min` and the CASH LEDGER was not, so
   * typing 1,000 against a 689 utang cleared the 689 and told the drawer
   * 1,000 had come in — a 311 peso discrepancy, on the screen whose whole
   * job is knowing where the money is. Nobody would find it.
   *
   * Refusing is right rather than clamping both: if a customer really handed
   * over more, that is a sale or a deposit, and it belongs on its own line
   * with its own reason.
   */
  if (input.amount > outstanding + 0.005) {
    return {
      error: `That is more than is owed — ${pesoPlain(outstanding)} left on this one.`,
    };
  }

  const collected = Math.min(total, already + input.amount);

  const { error } = await supabase
    .from("receivables")
    .update({
      amount_collected: collected,
      collected: collected >= total - 0.005,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  const intoPot = isAccount(input.account) ? input.account : null;
  if (intoPot) {
    await supabase.from("cash_ledger").insert({
      date: shopToday(),
      type: "in",
      amount: input.amount,
      account: intoPot,
      category: "utang",
      note: `Collected from ${row.customer ?? "a customer"}`,
      logged_by: viewer!.profile?.full_name?.trim() || viewer!.email,
    });
  }

  await log(
    `Collected ₱${input.amount.toFixed(2)} from ${row.customer ?? "a customer"}` +
      (intoPot ? ` into ${ACCOUNT_SHORT[intoPot]}` : " — not into any pot"),
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
