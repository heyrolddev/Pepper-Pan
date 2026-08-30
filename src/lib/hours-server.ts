import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/auth";
import {
  openState,
  type Closure,
  type DayHours,
  type OpenState,
  type ShopSettings,
} from "@/lib/hours";

export type ShopSchedule = {
  hours: DayHours[];
  closures: Closure[];
  settings: ShopSettings;
  state: OpenState;
  /** False when migration 0013 hasn't run — the shop then behaves as always open. */
  configured: boolean;
};

const DEFAULT_SETTINGS: ShopSettings = {
  accepting_orders: true,
  paused_message: null,
  min_lead_hours: 2,
  max_days_ahead: 14,
};

/**
 * The shop's schedule, and whether it's open right now.
 *
 * Before migration 0013 this returns "always open" rather than throwing —
 * a missing table shouldn't take the storefront down or, worse, silently
 * refuse every order.
 */
export async function getSchedule(): Promise<ShopSchedule> {
  const fallback: ShopSchedule = {
    hours: [],
    closures: [],
    settings: DEFAULT_SETTINGS,
    state: { isOpen: true, reason: null, opensNext: null, today: null },
    configured: false,
  };

  if (!isConfigured()) return fallback;

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);

    const [hoursRes, closuresRes, settingsRes] = await Promise.all([
      supabase.from("shop_hours").select("weekday, is_open, opens, closes").order("weekday"),
      // Only what's still ahead — a closure from March tells nobody anything.
      supabase
        .from("shop_closures")
        .select("closed_on, reason")
        .gte("closed_on", today)
        .order("closed_on")
        .limit(60),
      supabase
        .from("shop_settings")
        .select("accepting_orders, paused_message, min_lead_hours, max_days_ahead")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (hoursRes.error || !hoursRes.data?.length) return fallback;

    const hours = hoursRes.data as DayHours[];
    const closures = (closuresRes.data ?? []) as Closure[];
    const settings = (settingsRes.data as ShopSettings | null) ?? DEFAULT_SETTINGS;

    return {
      hours,
      closures,
      settings,
      state: openState(hours, closures, settings),
      configured: true,
    };
  } catch {
    return fallback;
  }
}
