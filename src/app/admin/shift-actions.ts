"use server";

import { revalidatePath } from "next/cache";
import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToOwners } from "@/lib/push";
import { clockIn, clockOut, shiftLength } from "@/lib/shifts-server";

type Result = { error: string | null };

/** How the person reads on the owner's lock screen and in the log. */
function nameOf(viewer: Awaited<ReturnType<typeof getViewer>>): string {
  return viewer?.profile?.full_name?.trim() || viewer?.email || "Someone";
}

/**
 * Starting and ending a shift.
 *
 * Clocking in is safe to press twice — it returns the running shift rather
 * than opening a second. Clocking out is not quite as forgiving any more:
 * it needs the drawer count, for the reason below.
 *
 * Both tell the owner. Not because a shift starting is urgent, but because
 * who is in the shop and when is exactly the thing an owner who is not in the
 * shop cannot otherwise know — and it is the pair of moments every other
 * record in the system hangs off.
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

  // Awaited rather than fired and forgotten: on serverless the function can be
  // frozen the moment the response is returned, which drops a dangling promise
  // silently. It swallows its own failures — a shift must never fail to start
  // because a notification did.
  await pushToOwners({
    title: `${nameOf(viewer)} clocked in`,
    body: "Shift started. Sales and changes from here are on their name.",
    url: "/admin/staff",
    // Per person, so two staff arriving together produce two lines rather
    // than one replacing the other.
    tag: `shift-${viewer.profile.id}`,
  });

  revalidatePath("/admin", "layout");
  return { error: null };
}

export async function endShift(input: {
  /**
   * What was counted in the drawer. Required now — see below.
   */
  closingCash: number;
  note?: string;
}): Promise<Result> {
  const viewer = await getViewer();
  if (!isStaff(viewer) || !viewer?.profile?.id) {
    return { error: "Only shop staff can clock out." };
  }

  /**
   * The drawer count is no longer optional, and this is the check that makes
   * that true rather than the placeholder text on the form.
   *
   * It used to accept null, meaning "nobody counted" — which is honest, and
   * also meant the one number that makes a shift report worth reading was
   * usually missing. Without it "took ₱3,400 in cash" is a claim with nothing
   * to test it against; with it, the report either squares or it does not, and
   * that difference is the only way a shortfall ever surfaces.
   *
   * Zero is allowed and is a real answer: a shift that took no cash counted
   * an empty drawer.
   */
  const counted = Number(input.closingCash);
  if (!Number.isFinite(counted) || counted < 0) {
    return {
      error: "Count the drawer before you clock out — how much cash is in it? Enter 0 if it's empty.",
    };
  }

  const shift = await clockOut(viewer.profile.id, counted, input.note?.trim() || null);
  // No open shift is not an error — it may have been closed on another device.
  if (shift) {
    await createAdminClient().from("activity_log").insert({
      category: "shift",
      description: `Clocked out — counted ₱${counted.toFixed(2)} in the drawer`,
      actor: viewer.profile.id,
    });

    await pushToOwners({
      title: `${nameOf(viewer)} clocked out`,
      body: `${shiftLength(shift.started_at, shift.ended_at)} on shift, ₱${counted.toFixed(
        2
      )} counted in the drawer.`,
      url: "/admin/staff",
      tag: `shift-${viewer.profile.id}`,
    });
  }
  revalidatePath("/admin", "layout");
  return { error: null };
}
