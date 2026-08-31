"use server";

import { revalidatePath } from "next/cache";
import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clockIn, clockOut } from "@/lib/shifts-server";

type Result = { error: string | null };

/**
 * Starting and ending a shift.
 *
 * Both are safe to press twice: clocking in while already on returns the
 * running shift rather than opening a second, and clocking out with nothing
 * open does nothing. Mid-service, on a phone with a queue waiting, an error
 * message about state is worse than a no-op.
 */
export async function startShift(): Promise<Result> {
  const viewer = await getViewer();
  if (!isStaff(viewer) || !viewer?.profile?.id) {
    return { error: "Only shop staff can clock in." };
  }
  const shift = await clockIn(viewer.profile.id);
  if (!shift) return { error: "Couldn't clock in. Try again." };

  await createAdminClient().from("activity_log").insert({
    category: "shift",
    description: "Clocked in",
    actor: viewer.profile.id,
  });
  revalidatePath("/admin", "layout");
  return { error: null };
}

export async function endShift(input: {
  /** What was counted in the drawer. Null when nobody counted, which is not zero. */
  closingCash: number | null;
  note?: string;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!isStaff(viewer) || !viewer?.profile?.id) {
    return { error: "Only shop staff can clock out." };
  }
  const shift = await clockOut(
    viewer.profile.id,
    input.closingCash,
    input.note?.trim() || null
  );
  // No open shift is not an error — it may have been closed on another device.
  if (shift) {
    await createAdminClient().from("activity_log").insert({
      category: "shift",
      description:
        "Clocked out" +
        (input.closingCash !== null
          ? ` — counted ₱${input.closingCash.toFixed(2)} in the drawer`
          : ""),
      actor: viewer.profile.id,
    });
  }
  revalidatePath("/admin", "layout");
  return { error: null };
}
