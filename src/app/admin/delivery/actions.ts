"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";

export async function saveDeliverySettings(input: {
  isEnabled: boolean;
  shopLat: number;
  shopLng: number;
  baseFee: number;
  baseKm: number;
  perKmFee: number;
  minFee: number;
  maxKm: number;
  freeOver: number;
  notice: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const nums = {
    shop_lat: input.shopLat,
    shop_lng: input.shopLng,
    base_fee: input.baseFee,
    base_km: input.baseKm,
    per_km_fee: input.perKmFee,
    min_fee: input.minFee,
    max_km: input.maxKm,
    free_over: input.freeOver,
  };

  for (const [key, value] of Object.entries(nums)) {
    if (!Number.isFinite(value)) return { error: `${key} must be a number.` };
  }
  if (Math.abs(input.shopLat) > 90 || Math.abs(input.shopLng) > 180) {
    return { error: "Drop the shop pin somewhere valid on the map." };
  }
  if (input.maxKm <= 0) return { error: "Maximum distance must be more than 0 km." };
  if (
    input.baseFee < 0 ||
    input.baseKm < 0 ||
    input.perKmFee < 0 ||
    input.minFee < 0 ||
    input.freeOver < 0
  ) {
    return { error: "Fees and distances can't be negative." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_settings")
    .update({
      is_enabled: input.isEnabled,
      ...nums,
      notice: input.notice.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that change. Run migration 0005 in the Supabase SQL Editor, then try again.",
    };
  }

  revalidatePath("/admin/delivery");
  revalidatePath("/checkout");
  revalidatePath("/account");
  return { error: null };
}
