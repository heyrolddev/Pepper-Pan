"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESTORE_CHUNK,
  RESTORE_ORDER,
  readBackup,
  unknownTables,
} from "@/lib/restore-order";

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

  const file = readBackup(text);
  if ("error" in file) return { error: file.error };

  const db = createAdminClient();
  const outcomes: TableOutcome[] = [];

  for (const table of RESTORE_ORDER) {
    const rows = file.data?.[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    let restored = 0;
    let failed: string | null = null;

    for (let i = 0; i < rows.length; i += RESTORE_CHUNK) {
      const slice = rows.slice(i, i + RESTORE_CHUNK);
      const { error } = await db.from(table).upsert(slice);
      if (error) {
        failed = error.message;
        break;
      }
      restored += slice.length;
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
    } restored a backup from ${file.exportedAt ?? "an unknown date"} (${
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
    skipped: unknownTables(file),
    wereEmpty: file.failed ?? [],
  };
}
