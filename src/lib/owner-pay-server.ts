import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopToday } from "@/lib/format-date";
import { daysLeftInMonth, payMonth, type DrawRow, type PayMonth } from "@/lib/owner-pay";

/**
 * This month's pay, read back for the panel.
 *
 * Two reads and no joins. The draws are `cash_ledger` lines carrying
 * `category = 'draw'`; the budget is whichever fixed cost is flagged as the
 * owner's pay. Neither knows about the other — which is the point of the
 * shape, because a month with a budget and no draws, and a month with draws
 * and no budget, are both ordinary and neither is an error.
 */

export type OwnerPay = {
  month: PayMonth;
  /** This month's draws, newest first. */
  draws: DrawRow[];
  daysLeft: number;
  /** The flagged fixed cost, so the panel can name it rather than just its figure. */
  budgetLabel: string | null;
  budgetId: string | null;
  /** Every standing cost, so the owner can pick which one is their pay. */
  choices: { id: string; label: string; amount: number }[];
};

const EMPTY: OwnerPay = {
  month: payMonth([], null),
  draws: [],
  daysLeft: 0,
  budgetLabel: null,
  budgetId: null,
  choices: [],
};

export async function readOwnerPay(): Promise<OwnerPay> {
  try {
    const supabase = createAdminClient();
    const today = shopToday();
    const first = `${today.slice(0, 7)}-01`;

    const [drawsRes, costsRes] = await Promise.all([
      supabase
        .from("cash_ledger")
        .select("id, date, amount, account, note")
        .eq("category", "draw")
        .gte("date", first)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      // Active only. A salary the owner has switched off is not this month's
      // budget, and showing it would measure the month against a figure the
      // break-even sum above has already stopped counting.
      supabase
        .from("fixed_costs")
        .select("id, label, amount, is_owner_pay")
        .eq("active", true)
        .order("amount", { ascending: false }),
    ]);

    const draws = ((drawsRes.data ?? []) as DrawRow[]).map((d) => ({
      ...d,
      amount: Number(d.amount) || 0,
    }));

    const costs = (costsRes.data ?? []) as {
      id: string;
      label: string;
      amount: number;
      is_owner_pay: boolean;
    }[];
    const flagged = costs.find((c) => c.is_owner_pay) ?? null;

    return {
      month: payMonth(draws, flagged ? Number(flagged.amount) : null),
      draws,
      daysLeft: daysLeftInMonth(today),
      budgetLabel: flagged?.label ?? null,
      budgetId: flagged?.id ?? null,
      choices: costs.map((c) => ({
        id: c.id,
        label: c.label,
        amount: Number(c.amount) || 0,
      })),
    };
  } catch {
    // A missing migration must not take the money screen down with it. The
    // same rule every other panel on this page follows.
    return EMPTY;
  }
}
