import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DELIVERY, type DeliverySettings } from "@/lib/delivery";

const COLUMNS =
  "is_enabled, shop_lat, shop_lng, base_fee, base_km, per_km_fee, min_fee, max_km, free_over, notice";

/**
 * Reads the shop's delivery settings, falling back to the documented defaults
 * so checkout still renders on a database where migration 0005 hasn't been
 * run yet (or where the singleton row is somehow missing).
 */
export async function getDeliverySettings(): Promise<DeliverySettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("delivery_settings")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (!data) return DEFAULT_DELIVERY;

    // Postgres numerics arrive as strings over PostgREST; the fee maths needs
    // real numbers or `base_fee + extraKm * rate` silently concatenates.
    const row = data as Record<string, unknown>;
    return {
      is_enabled: Boolean(row.is_enabled),
      shop_lat: Number(row.shop_lat),
      shop_lng: Number(row.shop_lng),
      base_fee: Number(row.base_fee),
      base_km: Number(row.base_km),
      per_km_fee: Number(row.per_km_fee),
      min_fee: Number(row.min_fee),
      max_km: Number(row.max_km),
      free_over: Number(row.free_over),
      notice: (row.notice as string | null) ?? null,
    };
  } catch {
    return DEFAULT_DELIVERY;
  }
}
