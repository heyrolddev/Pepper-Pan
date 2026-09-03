"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { error: string | null };

async function requireOwner() {
  const viewer = await getViewer();
  return can(viewer, "staff.manage") ? viewer : null;
}

/**
 * Who works here.
 *
 * There is no invite email, because there is no mail service and no budget
 * for one. The person signs up like any customer, and the owner promotes
 * them here — which has the useful side effect that the account already
 * exists and the password is theirs alone. Nobody shares a login.
 */
export async function setStaffRole(input: {
  profileId: string;
  /**
   * Manager sits between the two: runs a service, restocks, marks a dish sold
   * out — and still cannot change a price or see what anything earns.
   * "owner" is deliberately not offered. Handing over the whole business is
   * not a button on a list of names.
   */
  role: "manager" | "staff" | "customer";
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can change who works here." };
  if (input.profileId === owner.profile?.id) {
    return { error: "You can't change your own role." };
  }

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.role === "owner") {
    return { error: "You can't stand down another owner from here." };
  }

  // Standing someone down mid-shift would leave a shift open forever and the
  // takings unattributable, so the shift is closed first.
  if (input.role === "customer") {
    await supabase
      .from("staff_shifts")
      .update({ ended_at: new Date().toISOString(), note: "Closed — access removed" })
      .eq("staff_id", input.profileId)
      .is("ended_at", null);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: input.role })
    .eq("id", input.profileId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "staff",
    description:
      input.role === "customer"
        ? `Removed shop access from "${target.full_name ?? input.profileId}"`
        : `Made "${target.full_name ?? input.profileId}" ${ROLE_LABELS[
            input.role as Role
          ].toLowerCase()}`,
    actor: owner.profile?.id ?? null,
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  return { error: null };
}

