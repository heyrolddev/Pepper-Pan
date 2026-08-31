"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { error: string | null };

async function requireOwner() {
  const viewer = await getViewer();
  return viewer?.profile?.role === "owner" ? viewer : null;
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
  role: "staff" | "customer";
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
      input.role === "staff"
        ? `Gave "${target.full_name ?? input.profileId}" staff access`
        : `Removed staff access from "${target.full_name ?? input.profileId}"`,
    actor: owner.profile?.id ?? null,
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  return { error: null };
}

/**
 * Close a shift somebody forgot to end.
 *
 * Owner only, and logged. A shift left open all night otherwise reads as a
 * fourteen-hour day, and the person it belongs to cannot fix it themselves —
 * by design, since that is the same edit as claiming the hours.
 */
export async function closeShiftAsOwner(input: {
  shiftId: string;
  endedAt: string;
  closingCash: number | null;
}): Promise<Result> {
  const owner = await requireOwner();
  if (!owner) return { error: "Only the owner can correct a shift." };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("staff_shifts")
    .update({
      ended_at: input.endedAt,
      closing_cash: input.closingCash,
      note: "Closed by the owner",
    })
    .eq("id", input.shiftId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That shift no longer exists." };

  await supabase.from("activity_log").insert({
    category: "staff",
    description: `Closed shift ${input.shiftId.slice(0, 8)} by hand`,
    actor: owner.profile?.id ?? null,
  });
  revalidatePath("/admin/staff");
  return { error: null };
}
