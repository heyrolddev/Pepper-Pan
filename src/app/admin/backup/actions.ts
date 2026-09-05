"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESTORE_CHUNK,
  RESTORE_ORDER,
  parentsToClear,
  readBackup,
  unknownTables,
} from "@/lib/restore-order";
import { convertLegacyBackup, detectBackupKind } from "@/lib/legacy-import";
import { takeSafetyNet } from "@/lib/safety-net";

export type TableOutcome = {
  table: string;
  rows: number;
  restored: number;
  error: string | null;
};

export type RestoreResult =
  | { error: string }
  | {
      error: null;
      exportedAt: string | null;
      outcomes: TableOutcome[];
      skipped: string[];
      /** Tables the backup itself failed to export — they will be empty. */
      wereEmpty: string[];
      /** Which system wrote the file, so the result can say what it read. */
      kind: "legacy" | "native";
      /** Facts in a legacy file this schema has no column for. */
      dropped: string[];
      /** Rows a legacy file could not supply, and why. */
      unusable: string[];
      /** The copy taken automatically before any of this was written. */
      safetyNet: { rows: number; bytes: number } | null;
    };

/**
 * Put a backup file back.
 *
 * This existed only as `scripts/restore.mjs`, which needs a laptop, a
 * checkout of the code and the service-role key in a local file. That is a
 * fair amount to have ready on the day the shop's data is gone, and it is
 * the one day it has to work. Same logic, reachable from HQ.
 *
 * Upserts rather than deletes, exactly as the script does: rows in the file
 * overwrite rows with the same id, and anything already in the database that
 * is not in the file is left alone. That makes it safe to run twice, and safe
 * against a database that has moved on — but it does mean a restore does NOT
 * undo a deletion of rows the backup never had. Emptying a table first, on
 * purpose, is the only way to roll one fully back to the file.
 *
 * Owner only, through the same capability that guards the download.
 */
export async function restoreFromBackup(text: string): Promise<RestoreResult> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) {
    return { error: "Only the owner can restore a backup." };
  }

  const parsed = readBackup(text);
  if ("error" in parsed) return { error: parsed.error };

  // Which of the two shapes this is, decided from the file's own table names
  // rather than from anything the owner had to know. Both say
  // `app: "PepperPan"`, because both are this shop's; only the old phone app
  // writes `inventory` and `cashLedger`.
  const kind = detectBackupKind(parsed) === "legacy" ? "legacy" : "native";
  const converted = kind === "legacy" ? convertLegacyBackup(parsed) : null;
  const file = converted ? converted.backup : parsed;

  // Before a single row is written. Refusing to continue when this fails is
  // the whole point rather than an over-reaction: a restore is undertaken
  // because something is already wrong, and the case that matters is the one
  // where the restore turns out to be wrong too. Without a copy there is
  // nothing to go back to, and "it seemed fine at the time" is not a plan.
  const net = await takeSafetyNet(
    kind === "legacy"
      ? "Before bringing in the old phone app's records"
      : "Before putting a backup back"
  );
  if (!net.ok) {
    return {
      error: `Stopped before writing anything: the safety copy could not be taken (${net.error}). Nothing has changed. Download a backup by hand and try again, or check that migration 0031 has been run.`,
    };
  }

  const db = createAdminClient();
  const outcomes: TableOutcome[] = [];

  for (const table of RESTORE_ORDER) {
    const rows = file.data?.[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    let restored = 0;
    let failed: string | null = null;

    // Child rows with no id of their own replace their parent's whole set
    // rather than adding to it — see `parentsToClear`. Without that, a second
    // import would leave every recipe listing each ingredient twice, and the
    // costing built on those recipes would be wrong in a way that still looks
    // plausible.
    //
    // The ORDER of the replacement is the part worth being careful about, and
    // the obvious order is the wrong one. Clearing first and inserting second
    // means a failure between the two — a constraint, a dropped connection
    // halfway through a chunk — leaves the shop with no recipes at all and
    // nothing to put back. That is a worse outcome than the duplication this
    // is here to prevent: duplicates can be seen and fixed, silence cannot.
    //
    // So the old rows are noted, the new rows go in alongside them, and only
    // once every new row has landed are the old ones removed. There is a
    // moment when both sets exist, which is a moment of duplicate rows — but
    // it is a moment inside one server action, and every way out of it leaves
    // the shop with a complete set of recipes rather than none:
    //
    //   insert fails  -> the new rows are removed, the old set is untouched
    //   delete fails  -> both sets are there, reported, and importing again
    //                    converges because the second run notes both and
    //                    replaces them together
    //
    // PostgREST has no transaction across separate requests, so this is what
    // "atomic enough" looks like without moving the whole restore into a
    // database function. The remaining gap is stated in the return value: a
    // failure at the tenth table does not undo the nine before it.
    const parents = parentsToClear(table, rows);
    let oldIds: (string | number)[] = [];
    const newIds: (string | number)[] = [];

    if (parents) {
      const { data, error } = await db
        .from(table)
        .select("id")
        .in(parents.column, parents.ids);
      if (error) failed = `could not read the existing rows: ${error.message}`;
      else oldIds = (data ?? []).map((r) => (r as { id: string | number }).id);
    }

    for (let i = 0; !failed && i < rows.length; i += RESTORE_CHUNK) {
      const slice = rows.slice(i, i + RESTORE_CHUNK);
      if (parents) {
        // `select` so the new rows can be identified and taken back out if a
        // later chunk fails. Their keys are generated, so this is the only
        // moment they can be known.
        const { data, error } = await db.from(table).insert(slice).select("id");
        if (error) {
          failed = error.message;
          break;
        }
        for (const r of data ?? []) newIds.push((r as { id: string | number }).id);
      } else {
        const { error } = await db.from(table).upsert(slice);
        if (error) {
          failed = error.message;
          break;
        }
      }
      restored += slice.length;
    }

    if (parents) {
      // Which set to remove depends entirely on whether the insert finished.
      const doomed = failed ? newIds : oldIds;
      for (let i = 0; i < doomed.length; i += RESTORE_CHUNK) {
        const { error } = await db
          .from(table)
          .delete()
          .in("id", doomed.slice(i, i + RESTORE_CHUNK));
        if (error) {
          failed = failed
            ? `${failed} (and the half-written rows could not be taken back out: ${error.message})`
            : `the new rows are in, but the old ones could not be removed: ${error.message} — import again to clear the duplicates`;
          break;
        }
      }
      if (failed) restored = 0;
    }

    // Recorded and carried on, never thrown. One table that will not load —
    // usually `profiles`, whose rows point at auth users that do not exist in
    // a fresh project — must not stop the recipes and the sales history from
    // coming back.
    outcomes.push({ table, rows: rows.length, restored, error: failed });
  }

  await db.from("activity_log").insert({
    category: "backup",
    description: `${
      viewer?.profile?.full_name?.trim() || viewer?.email || "The owner"
    } restored ${
      kind === "legacy" ? "records from the old phone app" : "a backup"
    } from ${file.exportedAt ?? "an unknown date"} (${
      outcomes.reduce((n, o) => n + o.restored, 0)
    } rows)`,
    actor: viewer?.profile?.id ?? null,
  });

  revalidatePath("/admin/backup");
  revalidatePath("/admin");

  return {
    error: null,
    exportedAt: file.exportedAt ?? null,
    outcomes,
    // A converted file has no unknown tables by construction — the converter
    // reports what it could not carry, in its own words.
    skipped: converted ? [] : unknownTables(file),
    // Only this system's own backup records which tables failed to export;
    // a converted file reports its gaps through `dropped` instead.
    wereEmpty: converted ? [] : parsed.failed ?? [],
    kind,
    dropped: converted?.report.dropped ?? [],
    unusable: converted?.report.skipped ?? [],
    safetyNet: { rows: net.rows, bytes: net.bytes },
  };
}
