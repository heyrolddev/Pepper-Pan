"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listBranches } from "@/lib/branches-server";

type Result = { error: string | null };

/**
 * Where somebody works.
 *
 * Its own file beside `setStaffRole`, not a branch inside it, because the
 * two answer different questions and folding them together would give that
 * function two meanings:
 *
 *   role    WHAT they may do   — offered, and accepted by the person
 *   branch  WHERE they may do it — assigned by the owner, immediately
 *
 * The difference in how they are granted is not an accident either. A role
 * hands somebody the shop's money screens, so it is offered and they accept
 * from their own session. A branch takes access AWAY — it narrows what an
 * existing account can see — so there is nothing to consent to and waiting
 * for an acceptance would leave the booth's cashier reading Apalit's orders
 * until they got round to tapping yes.
 */
export async function setStaffBranch(input: {
  profileId: string;
  /** Null means every branch: the owner, and anyone left deliberately free. */
  branchId: string | null;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!can(viewer, "staff.manage")) {
    return { error: "Only the owner can change where somebody works." };
  }

  /* Pinning yourself is refused, for the same reason you cannot change your
     own role: an owner who pins themselves to one branch can no longer see
     the others, and cannot reach the screen that would undo it. */
  if (input.profileId === viewer?.profile?.id) {
    return { error: "You can't change your own branch." };
  }

  const supabase = createAdminClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, full_name, branch_id")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };

  let name = "every branch";
  if (input.branchId) {
    const branch = (await listBranches()).find((b) => b.id === input.branchId);
    if (!branch) return { error: "That branch does not exist." };
    name = branch.name;
  }

  if (target.branch_id === input.branchId) return { error: null };

  /* A shift belongs to the branch it was worked at, so moving somebody
     mid-shift would leave the rest of that shift's sales filed in a place
     the person no longer works. Closed first, exactly as standing somebody
     down does. */
  await supabase
    .from("staff_shifts")
    .update({ ended_at: new Date().toISOString(), note: "Closed — moved branch" })
    .eq("staff_id", input.profileId)
    .is("ended_at", null);

  const { error } = await supabase
    .from("profiles")
    .update({ branch_id: input.branchId })
    .eq("id", input.profileId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    category: "staff",
    description: `Moved "${target.full_name ?? input.profileId}" to ${name}`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidatePath("/admin/staff");
  revalidatePath("/admin", "layout");
  return { error: null };
}
