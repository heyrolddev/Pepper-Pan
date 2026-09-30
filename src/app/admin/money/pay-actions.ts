"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { isAccount, type Account } from "@/lib/money-accounts";

/**
 * The owner's own pay — taking it, changing it, undoing it.
 *
 * A draw is one `cash_ledger` line with `category = 'draw'`, and deliberately
 * nothing else. See migration 0073 for why there is no second table: the pot
 * balance already counts every ledger line, and break-even and net profit
 * already read none of them, so the arithmetic is correct the moment the row
 * exists. Anything more would be a second place for the same peso to live.
 *
 * Every one of these is owner-only. Not because a draw is a secret — staff
 * counting the drawer must see that money left it — but because deciding what
 * the owner is paid is not a shift's decision to make.
 */

type Result = { error: string | null };

/** The one category that marks a ledger line as the owner's pay. */
const DRAW = "draw";

function done() {
  revalidatePath("/admin/money");
  revalidatePath("/admin");
}

async function requireOwner() {
  const viewer = await getViewer();
  return can(viewer, "business") ? viewer : null;
}

async function log(description: string, actor: string | null) {
  try {
    await createAdminClient()
      .from("activity_log")
      .insert({ category: "money", description, actor });
  } catch {
    // The draw is recorded. A missing line in the history is not worth
    // failing the thing the owner actually asked for.
  }
}

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Take pay.
 *
 * `spentOn` is accepted because pay is remembered in the evening as often as
 * it is taken at noon, and a draw filed on the wrong day lands in the wrong
 * month at a month boundary — which is the one time the figure is read
 * closely. A future date is refused: it would spend a budget that has not
 * started.
 */
export async function takePay(input: {
  amount: number;
  account?: Account;
  note?: string;
  spentOn?: string;
}): Promise<Result> {
  const viewer = await requireOwner();
  if (!viewer) return { error: "Only the owner can record their own pay." };

  const amount = money(Number(input.amount));
  if (!(amount > 0)) return { error: "How much are you taking?" };

  const account: Account = isAccount(input.account) ? input.account : "cash";
  const today = shopToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.spentOn ?? "")
    ? (input.spentOn as string)
    : today;
  if (date > today) return { error: "That date is in the future." };

  const { error } = await createAdminClient().from("cash_ledger").insert({
    date,
    type: "out",
    amount,
    account,
    category: DRAW,
    // What the drawer's own history will read. Named rather than left blank
    // because the person counting the drawer tonight has to know why it is
    // light, and "Owner's pay" is the true answer at the right level of
    // detail — what the household spent it on is nobody's business.
    note: input.note?.trim() ? `Owner's pay — ${input.note.trim()}` : "Owner's pay",
    logged_by: viewer.profile?.full_name?.trim() || viewer.email,
  });
  if (error) return { error: error.message };

  await log(`Owner's pay ₱${amount.toFixed(2)} from ${account}`, viewer.profile?.id ?? null);
  done();
  return { error: null };
}

/**
 * Change one.
 *
 * Scoped to `category = 'draw'` in the query itself, not checked first and
 * updated after. An id typed into the wrong field must not be able to rewrite
 * a sale or a supplier payment, and the narrow filter makes that impossible
 * rather than unlikely.
 */
export async function editPay(input: {
  id: string;
  amount: number;
  account?: Account;
  note?: string;
  spentOn?: string;
}): Promise<Result> {
  const viewer = await requireOwner();
  if (!viewer) return { error: "Only the owner can change their own pay." };

  const amount = money(Number(input.amount));
  if (!(amount > 0)) return { error: "How much?" };

  const today = shopToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.spentOn ?? "")
    ? (input.spentOn as string)
    : undefined;
  if (date && date > today) return { error: "That date is in the future." };

  const patch: Record<string, unknown> = {
    amount,
    note: input.note?.trim() ? `Owner's pay — ${input.note.trim()}` : "Owner's pay",
  };
  if (isAccount(input.account)) patch.account = input.account;
  if (date) patch.date = date;

  const { data, error } = await createAdminClient()
    .from("cash_ledger")
    .update(patch)
    .eq("id", input.id)
    .eq("category", DRAW)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That pay entry is no longer there — it may already have been removed." };
  }

  await log(`Owner's pay changed to ₱${amount.toFixed(2)}`, viewer.profile?.id ?? null);
  done();
  return { error: null };
}

/** Remove one. Same narrow filter, for the same reason. */
export async function deletePay(id: string): Promise<Result> {
  const viewer = await requireOwner();
  if (!viewer) return { error: "Only the owner can remove their own pay." };

  const { data, error } = await createAdminClient()
    .from("cash_ledger")
    .delete()
    .eq("id", id)
    .eq("category", DRAW)
    .select("amount");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "That pay entry is no longer there." };
  }

  await log(
    `Owner's pay ₱${Number(data[0].amount).toFixed(2)} removed`,
    viewer.profile?.id ?? null
  );
  done();
  return { error: null };
}

/**
 * Say which standing cost is the owner's pay.
 *
 * Cleared from every other row first, then set on this one. The database
 * allows only one flagged row (a partial unique index, 0073), so setting
 * before clearing would be refused — the order here is the whole reason this
 * is a server action and not two client calls.
 *
 * `null` unsets it entirely, which is a real answer: an owner who does not
 * budget a salary still wants to record what they take.
 */
export async function setPayBudget(fixedCostId: string | null): Promise<Result> {
  const viewer = await requireOwner();
  if (!viewer) return { error: "Only the owner can set their own pay." };

  const supabase = createAdminClient();
  const cleared = await supabase
    .from("fixed_costs")
    .update({ is_owner_pay: false })
    .eq("is_owner_pay", true);
  if (cleared.error) return { error: cleared.error.message };

  if (fixedCostId === null) {
    await log("Owner's pay budget unset", viewer.profile?.id ?? null);
    done();
    return { error: null };
  }

  const { data, error } = await supabase
    .from("fixed_costs")
    .update({ is_owner_pay: true })
    .eq("id", fixedCostId)
    .select("label, amount");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "That cost is no longer there." };

  await log(
    `Owner's pay budget set to "${data[0].label}" (₱${Number(data[0].amount).toFixed(2)}/month)`,
    viewer.profile?.id ?? null
  );
  done();
  return { error: null };
}
