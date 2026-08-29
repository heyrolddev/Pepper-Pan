"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(input: {
  fullName: string;
  phone: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  if (!input.fullName.trim()) return { error: "Please enter your name." };

  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    return { error: "Please enter a working mobile number (e.g. 09XX XXX XXXX)." };
  }

  const lat =
    typeof input.lat === "number" && Number.isFinite(input.lat) && Math.abs(input.lat) <= 90
      ? input.lat
      : null;
  const lng =
    typeof input.lng === "number" && Number.isFinite(input.lng) && Math.abs(input.lng) <= 180
      ? input.lng
      : null;

  // role / is_verified / is_blocked are clamped by a database trigger, so a
  // customer can never escalate here even if this payload were tampered with.
  // `.select()` matters: an RLS-blocked UPDATE returns success with zero rows.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim() || null,
      address_lat: lat,
      address_lng: lng,
    })
    .eq("id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The database didn't accept that change." };
  }

  revalidatePath("/account");
  revalidatePath("/checkout");
  return { error: null };
}
