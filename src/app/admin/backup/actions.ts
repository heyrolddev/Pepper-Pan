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

  const db = createAdminClient();
  const outcomes: TableOutcome[] = [];

  for (const table of RESTORE_ORDER) {
    const rows = file.data?.[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    let restored = 0;
    let failed: string | null = null;

    // Child rows with no id of their own replace their parent's whole set
    // rather than adding to it — see `parentsToClear`. Without this, a second
    // import would leave every recipe listing each ingredient twice, and the
    // costing built on those recipes would be wrong in a way that looks
    // plausible.
    const parents = parentsToClear(table, rows);
    if (parents) {
      for (let i = 0; i < parents.ids.length; i += RESTORE_CHUNK) {
        const { error } = await db
          .from(table)
          .delete()
          .in(parents.column, parents.ids.slice(i, i + RESTORE_CHUNK));
        if (error) {
          failed = `could not clear existing rows: ${error.message}`;
          break;
        }
      }
    }

    for (let i = 0; !failed && i < rows.length; i += RESTORE_CHUNK) {
      const slice = rows.slice(i, i + RESTORE_CHUNK);
      // Insert rather than upsert when the rows have no id: their primary key
      // is generated, and an upsert with no conflict target is just an insert
      // with extra steps.
      const { error } = parents
        ? await db.from(table).insert(slice)
        : await db.from(table).upsert(slice);
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
  };
}
