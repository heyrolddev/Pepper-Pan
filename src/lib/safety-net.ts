import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectSnapshot, snapshotToJson } from "@/lib/backup";

/**
 * The copy nobody had to remember to take.
 *
 * The restore screen has always said "download a backup first if there is
 * anything here worth keeping". That sentence is doing a lot of work for a
 * sentence, and it is read at exactly the moment somebody is least likely to
 * act on it: they are restoring because something has already gone wrong, and
 * a detour to download a file feels like the opposite of fixing it.
 *
 * So the restore takes the copy itself, before it writes anything. The
 * instruction stays on the screen, because a second copy in the owner's own
 * hands is still better than one that lives in the same database as the thing
 * it protects — but it is no longer the only thing standing between a mistake
 * and a month of records.
 */

/** How many to keep. */
const KEEP = 5;

export type SafetyNet =
  | { ok: true; id: string; rows: number; bytes: number }
  | { ok: false; error: string };

/**
 * Copy everything, then trim the oldest away.
 *
 * Failure here is reported rather than thrown, and the caller decides what to
 * do about it. That decision is not obvious and is worth stating: a restore
 * that cannot take a safety copy should NOT proceed, because the whole point
 * of the copy is the case where the restore turns out to be wrong. The
 * caller enforces that; this function only reports.
 */
export async function takeSafetyNet(reason: string): Promise<SafetyNet> {
  let payload: string;
  let rows = 0;

  try {
    const snapshot = await collectSnapshot();
    rows = snapshot.tables.reduce((n, t) => n + t.rows.length, 0);
    payload = snapshotToJson(snapshot);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "could not read the shop's tables" };
  }

  // An empty database is a legitimate thing to restore into — a fresh
  // project, or one just cleared on purpose — and there is nothing to protect
  // in that case. Recorded anyway, so the list shows that a copy was
  // considered rather than leaving a gap the owner has to interpret.
  const db = createAdminClient();
  const bytes = Buffer.byteLength(payload, "utf8");

  const { data, error } = await db
    .from("restore_snapshots")
    .insert({ reason, rows_included: rows, bytes, payload })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Trimmed after the new one is safely in, never before: a prune that runs
  // first would, on a bad day, delete the fifth copy and then fail to write
  // the sixth.
  const { data: old } = await db
    .from("restore_snapshots")
    .select("id")
    .order("taken_at", { ascending: false })
    .range(KEEP, KEEP + 50);
  const doomed = (old ?? []).map((r) => r.id as string);
  if (doomed.length > 0) await db.from("restore_snapshots").delete().in("id", doomed);

  return { ok: true, id: data.id as string, rows, bytes };
}

export type SnapshotRow = {
  id: string;
  taken_at: string;
  reason: string;
  rows_included: number;
  bytes: number;
};

/** The list, without dragging half a megabyte of JSON along per row. */
export async function listSafetyNets(): Promise<SnapshotRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("restore_snapshots")
    .select("id, taken_at, reason, rows_included, bytes")
    .order("taken_at", { ascending: false });
  if (error) {
    // Advisory list on a page the owner needs for other things. Reported to
    // the log, never allowed to take the page down.
    console.error(`[safety-net] could not list: ${error.message}`);
    return [];
  }
  return (data ?? []) as SnapshotRow[];
}

/** One snapshot's JSON, for downloading or for putting back. */
export async function readSafetyNet(id: string): Promise<string | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("restore_snapshots")
    .select("payload")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data.payload as string;
}
