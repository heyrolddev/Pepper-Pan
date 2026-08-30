"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Every path that shows an open/closed state or a schedule. */
function revalidateShop() {
  revalidatePath("/admin/hours");
  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/checkout");
}

export async function saveHours(
  days: { weekday: number; is_open: boolean; opens: string; closes: string }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  for (const day of days) {
    // A close time at or before the open time would make the day silently
    // unreachable — say so rather than saving a shop nobody can order from.
    if (day.is_open && day.closes <= day.opens) {
      return {
        error: `Closing time has to be after opening time — check ${
          ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
            day.weekday
          ]
        }.`,
      };
    }
  }

  for (const day of days) {
    const { error } = await supabase
      .from("shop_hours")
      .update({ is_open: day.is_open, opens: day.opens, closes: day.closes })
      .eq("weekday", day.weekday);

    if (error) {
      return {
        error: `${error.message}. If this mentions shop_hours, run migration 0013 in the Supabase SQL Editor.`,
      };
    }
  }

  revalidateShop();
  return { error: null };
}

export async function saveShopSettings(input: {
  acceptingOrders: boolean;
  pausedMessage: string;
  minLeadHours: number;
  maxDaysAhead: number;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shop_settings")
    .update({
      accepting_orders: input.acceptingOrders,
      paused_message: input.pausedMessage.trim() || null,
      min_lead_hours: Math.max(0, Math.min(168, Math.round(input.minLeadHours) || 0)),
      max_days_ahead: Math.max(1, Math.min(90, Math.round(input.maxDaysAhead) || 14)),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");

  if (error) {
    return {
      error: `${error.message}. If this mentions shop_settings, run migration 0013 in the Supabase SQL Editor.`,
    };
  }
  if (!data?.length) return { error: "Couldn't save — run migration 0013, then try again." };

  revalidateShop();
  return { error: null };
}

export async function addClosure(
  closedOn: string,
  reason: string
): Promise<{ error: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) return { error: "Pick a date." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_closures")
    .upsert({ closed_on: closedOn, reason: reason.trim() || null });

  if (error) {
    return {
      error: `${error.message}. If this mentions shop_closures, run migration 0013 in the Supabase SQL Editor.`,
    };
  }

  revalidateShop();
  return { error: null };
}

export async function removeClosure(closedOn: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("shop_closures").delete().eq("closed_on", closedOn);
  if (error) return { error: error.message };
  revalidateShop();
  return { error: null };
}
