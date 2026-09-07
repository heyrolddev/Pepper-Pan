import "server-only";
import type { Viewer } from "@/lib/auth";
import { openShiftFor } from "@/lib/shifts-server";

/**
 * Nothing happens off the clock.
 *
 * The till used to take a sale with no shift attached, and the comment there
 * said why: "refusing to take money because of a missed button is never the
 * right trade". That was wrong in a way testing showed — a staff member who is
 * clocked out can still ring up sales, move orders along and cancel them, and
 * every one of those lands in the records with no shift to hang it on. The
 * owner can see that it happened and not who did it, which is worse than a
 * moment's friction at the counter: the whole point of the shift report is
 * that a service has one name on it.
 *
 * So the button is no longer missable. Every action that changes something on
 * the shop floor asks this first, and the rail's clock is the one thing a
 * clocked-out person can still press.
 *
 * The owner is exempt. They are not on a rota, they are not paid by the hour,
 * and there is nobody above them for the record to protect — locking the owner
 * out of their own shop because they had not clocked in would be a bug.
 */
export const NOT_ON_SHIFT =
  "Clock in first — the shift is what puts your name on this. The clock is at the bottom of the menu.";

export async function offShift(viewer: Viewer): Promise<boolean> {
  if (viewer?.profile?.role === "owner") return false;
  const id = viewer?.profile?.id;
  if (!id) return true;
  return (await openShiftFor(id)) === null;
}
