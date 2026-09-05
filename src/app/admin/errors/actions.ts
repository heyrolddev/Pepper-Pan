"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ticking a fault off, or putting it back.
 *
 * Resolving does not delete. A fault that comes back is one of the more
 * useful things this log can tell the owner — "this happened again, three
 * weeks later" is a different problem from "this happened once" — and the
 * database reopens a resolved row by itself the next time the same
 * fingerprint arrives.
 */
export async function setErrorResolved(input: {
  id: string;
  resolved: boolean;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) {
    return { error: "Only the owner can manage the error log." };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("error_log")
    .update({
      resolved: input.resolved,
      resolved_at: input.resolved ? new Date().toISOString() : null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}

/**
 * Clear everything already ticked off.
 *
 * The only delete here, and it only reaches rows the owner has said they are
 * done with. Open faults have no delete at all: the way to make one go away
 * is to fix it or to mark it resolved, both of which are decisions, and
 * neither of which is a swipe.
 */
export async function clearResolvedErrors(): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) {
    return { error: "Only the owner can manage the error log." };
  }

  const db = createAdminClient();
  const { error } = await db.from("error_log").delete().eq("resolved", true);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}
