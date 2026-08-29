"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(input: {
  fullName: string;
  phone: string;
  address: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in first." };

  if (!input.fullName.trim()) return { error: "Please enter your name." };
  if (!input.phone.trim()) return { error: "Please enter a contact number." };

  // role / is_verified / is_blocked are clamped by a database trigger, so a
  // customer can never escalate here even if this payload were tampered with.
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim() || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/account");
  revalidatePath("/checkout");
  return { error: null };
}
