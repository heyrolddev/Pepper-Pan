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
  /** Closed by the system because nobody clocked out. See below. */
  auto_closed?: boolean;
};

/**
 * How long a shift may run before the system closes it itself.
 *
 * A street stall's longest day is well inside this; anything past it is a
 * button nobody pressed. Fourteen rather than twelve so a genuinely long
 * market day is never cut short mid-service.
 */
export const STALE_SHIFT_HOURS = 14;

/** The shift this person is currently on, if any. */
export async function openShiftFor(staffId: string): Promise<Shift | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_id, started_at, ended_at, closing_cash, note, auto_closed")
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

/**
 * Close shifts nobody clocked out of, and say which ones.
 *
 * This mattered much more the moment the clock started gating the shop floor.
 * Before that, a forgotten shift was a wrong number in a report. Now an open
 * shift is the key to the till, the board and the store room — so a shift
 * nobody closed is a key nobody took back, held by someone who went home, and
 * one that never gets a drawer count either.
 *
 * There is no scheduled job on this project, so it cannot be a cron. It runs
 * when HQ is opened, which is often enough to matter and costs nothing when
 * there is nothing to close. `closing_cash` is left null on purpose: nobody
 * counted, and the report says exactly that rather than inventing a figure.
 *
 * Returns the rows it closed so the caller can tell the owner — silently
 * tidying this up would hide the very thing worth knowing, which is that
 * somebody keeps forgetting.
 */
export async function closeStaleShifts(): Promise<Shift[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("close_stale_shifts", {
    p_hours: STALE_SHIFT_HOURS,
  });
  if (error) {
    // Never fatal: HQ loading is not worth failing over a tidy-up.
    console.error(`[shifts] close stale: ${error.message}`);
    return [];
  }
  return (data as Shift[]) ?? [];
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
