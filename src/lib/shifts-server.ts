import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shifts, from the app's side.
 *
 * Clocking in and out runs through two Postgres functions that only the
 * service role may call — a staff session cannot touch `staff_shifts`
 * directly at all. That is deliberate: an UPDATE policy scoped to "your own
 * rows" still lets the person being paid edit the record of what they are
 * owed.
 */

export type Shift = {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  closing_cash: number | null;
  note: string | null;
};

/** The shift this person is currently on, if any. */
export async function openShiftFor(staffId: string): Promise<Shift | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_id, started_at, ended_at, closing_cash, note")
    .eq("staff_id", staffId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[shifts] open shift for ${staffId}: ${error.message}`);
    return null;
  }
  return (data as Shift) ?? null;
}

export async function clockIn(staffId: string): Promise<Shift | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("clock_in", { p_staff_id: staffId });
  if (error) {
    console.error(`[shifts] clock in: ${error.message}`);
    return null;
  }
  return (data as Shift) ?? null;
}

export async function clockOut(
  staffId: string,
  closingCash: number | null,
  note: string | null
): Promise<Shift | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("clock_out", {
    p_staff_id: staffId,
    p_closing_cash: closingCash,
    p_note: note,
  });
  if (error) {
    console.error(`[shifts] clock out: ${error.message}`);
    return null;
  }
  return (data as Shift) ?? null;
}

/** Whole hours and minutes, for a number people read rather than compute with. */
export function shiftLength(startedAt: string, endedAt: string | null): string {
  const ms = new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}
