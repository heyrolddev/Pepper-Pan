"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { planPastDays, type PastDayInput } from "@/lib/past-days";

type Result = { error: string | null; saved?: number; total?: number };

/**
 * Save the days the shop traded before it had this till.
 *
 * Each day becomes one `orders` row, and three things about that row are the
 * whole job:
 *
 * `stock_applied_at` IS SET AT INSERT. That column is the claim
 * `apply_order_stock` makes before it moves anything, so a row that already
 * carries one can never have stock applied to it. Without this, saving three
 * months of August takings would walk the recipes of dishes that were eaten
 * in August and take their ingredients off a shelf that is full today —
 * emptying the store room to record history.
 *
 * `cogs` IS NEVER LEFT AT ZERO. The column defaults to 0, so a day saved as
 * takings alone reads as a perfect margin on every profit screen. The cost
 * comes from the ratio the owner set for the batch; `planPastDays` refuses
 * the whole row if there isn't one.
 *
 * `is_backfill` MARKS IT. One row is a whole day, so anything counting orders
 * is wrong about these even though the money is right, and a screen cannot
 * warn about what it cannot see.
 */
export async function savePastDays(input: {
  days: PastDayInput[];
  costPct: number;
}): Promise<Result> {
  const viewer = await getViewer();
  // The same permission that guards the rest of the money screens: this
  // writes revenue, and revenue is the owner's business.
  if (!can(viewer, "business")) {
    return { error: "Only the owner can enter past takings." };
  }

  const supabase = createAdminClient();

  // Days that already carry sales — real tickets or an earlier batch. Read
  // fresh rather than trusted from the browser, because the screen may have
  // been open since before somebody rang up a sale on one of these dates.
  const wanted = input.days
    .map((d) => (d.date ?? "").trim())
    .filter(Boolean)
    .sort();
  if (wanted.length === 0) return { error: "Nothing to save." };

  const { data: existing, error: readError } = await supabase
    .from("orders")
    .select("date")
    .gte("date", wanted[0])
    .lte("date", wanted[wanted.length - 1])
    .neq("status", "cancelled");
  if (readError) return { error: readError.message };

  const taken = new Set((existing ?? []).map((r) => String(r.date)));
  const plan = planPastDays(input.days, input.costPct, taken);

  if (plan.rows.length === 0) {
    const first = plan.problems[0];
    return {
      error: first ? `${first.date}: ${first.why}` : "Nothing to save.",
    };
  }

  const by = viewer!.profile?.full_name?.trim() || viewer!.email;
  const stamped = new Date().toISOString();

  const { error } = await supabase.from("orders").insert(
    plan.rows.map((r) => ({
      date: r.date,
      customer_id: null,
      status: "completed",
      fulfillment: "pickup",
      payment_method: "cod",
      revenue: r.revenue,
      cogs: r.cogs,
      gross_profit: r.grossProfit,
      logged_by: by,
      is_backfill: true,
      // The claim, made here so the stock engine can never make it.
      stock_applied_at: stamped,
    }))
  );
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "money",
    description:
      `Entered ${plan.rows.length} past trading day` +
      `${plan.rows.length === 1 ? "" : "s"} — ` +
      `${plan.rows[0].date} to ${plan.rows[plan.rows.length - 1].date}, ` +
      `₱${plan.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })} ` +
      `at ${input.costPct}% food cost`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidatePath("/admin/analytics");
  revalidatePath("/admin/money");
  revalidatePath("/admin");
  return { error: null, saved: plan.rows.length, total: plan.total };
}

/** Undo a batch: every backfilled day in a range, removed. */
export async function removePastDays(from: string, to: string): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "business")) {
    return { error: "Only the owner can remove past takings." };
  }

  const supabase = createAdminClient();
  // Only ever backfilled rows. A range delete that could catch a real ticket
  // is not an undo, it is a way to lose a sale.
  const { data, error } = await supabase
    .from("orders")
    .delete()
    .eq("is_backfill", true)
    .gte("date", from)
    .lte("date", to)
    .select("id");
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "money",
    description: `Removed ${(data ?? []).length} typed-in past day${
      (data ?? []).length === 1 ? "" : "s"
    } between ${from} and ${to}`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidatePath("/admin/analytics");
  revalidatePath("/admin/money");
  revalidatePath("/admin");
  return { error: null, saved: (data ?? []).length };
}
