"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";

/**
 * Only the owner may change trust flags — a database trigger enforces the
 * same rule, so this check is the friendly error rather than the guarantee.
 */
export async function setCustomerFlags(
  customerId: string,
  flags: { isVerified?: boolean; isBlocked?: boolean }
): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "owner") {
    return { error: "Only the shop owner can change this." };
  }

  const patch: Record<string, boolean> = {};
  if (typeof flags.isVerified === "boolean") patch.is_verified = flags.isVerified;
  if (typeof flags.isBlocked === "boolean") patch.is_blocked = flags.isBlocked;
  if (Object.keys(patch).length === 0) return { error: null };

  const supabase = await createClient();
  // `.select()` matters: an RLS-blocked UPDATE returns success with zero rows.
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", customerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "The database didn't accept that change." };
  }

  revalidatePath("/admin/customers");
  revalidatePath("/admin/orders");
  return { error: null };
}
