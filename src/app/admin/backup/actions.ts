"use server";

import { revalidatePath } from "next/cache";
import { can, getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESTORE_CHUNK,
  RESTORE_ORDER,
  parentsToClear,
  readBackup,
  unknownTables,
} from "@/lib/restore-order";
import { convertLegacyBackup, detectBackupKind } from "@/lib/legacy-import";
import { collectAuthIds, repairNote, repairRows } from "@/lib/restore-repair";
import { automaticBackupDue, takeSafetyNet } from "@/lib/safety-net";
import {
  emailConfigured,
  looksLikeEmail,
  offsiteBackupDue,
  sendOffsiteBackup,
} from "@/lib/offsite-backup";

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
      /**
       * What had to be repaired to get the rows in, table by table.
       *
       * Empty on a restore into the same project, which is the common case.
       * Non-empty means the backup was put into a database that does not
       * have the accounts it refers to — and the owner needs to know which
       * records came back without their link and which are waiting on an
       * account being re-created.
       */
      repairs: { table: string; note: string }[];
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
  const repairs: { table: string; note: string }[] = [];

  /* Which of the accounts this file refers to actually exist HERE.
  
     A backup cannot carry `auth.users` — Supabase owns that table and it
     holds password hashes that are not ours to copy. So a file put into a
     fresh project is full of orders, reviews and shifts pointing at
     accounts that exist nowhere, and Postgres refuses every one of them.
     Asked of the database rather than assumed from the file, because the
     common case is a restore into the SAME project, where every id is
     found and nothing below does anything at all. */
  const wanted = collectAuthIds(file.data);
  const present = new Set<string>();
  if (wanted.length > 0) {
    const { data: found, error: authError } = await db.rpc("auth_users_present", {
      p_ids: wanted,
    });
    if (authError) {
      // Not fatal, and deliberately not silent. Treating every account as
      // present is what the code did before 0068 and it is the safe
      // direction to fail in: a restore into the same project still works
      // exactly as it always did.
      console.error(`[restore] auth_users_present: ${authError.message}`);
      for (const id of wanted) present.add(id);
      repairs.push({
        table: "—",
        note: `Could not check which accounts still exist (${authError.message}). If this is a fresh project, run migration 0068 and import again — rows belonging to deleted accounts may have been refused.`,
      });
    } else {
      for (const id of (found ?? []) as (string | { id: string })[]) {
        present.add(String(typeof id === "string" ? id : id.id).toLowerCase());
      }
    }
  }

  for (const table of RESTORE_ORDER) {
    const original = file.data?.[table];
    if (!Array.isArray(original) || original.length === 0) continue;

    // Dangling account links dropped, rows that cannot exist without one
    // held back and named. A no-op when every id was found.
    const repair = repairRows(table, original, present);
    const rows = repair.rows;
    const note = repairNote(table, repair);
    if (note) repairs.push({ table, note });
    if (rows.length === 0) {
      outcomes.push({
        table,
        rows: original.length,
        restored: 0,
        error: note ?? "every row referred to an account that no longer exists",
      });
      continue;
    }

    let restored = 0;
    let failed: string | null = null;
    // Rows that would not go in even one at a time, and the last reason
    // given. Counted rather than collected: a hundred identical foreign-key
    // messages is not a hundred pieces of information.
    let failedRows = 0;
    let lastFailure = "";

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
          /* One bad row must not cost the four hundred and ninety-nine
             travelling with it.
          
             PostgREST sends a chunk as a single statement, so a chunk is
             all-or-nothing — and this used to take the failure as the
             table's answer and `break`, abandoning every chunk after it
             too. A single unrestorable row therefore lost the entire
             table, which on `orders` is every sale the shop ever made.
          
             So a failed chunk is retried row by row. It is slow, and it is
             slow exactly once, on the worst day, for the rows that are
             actually broken — and it turns "the orders would not restore"
             into "these four orders would not restore, and here is why". */
          let lastError = error.message;
          let salvaged = 0;
          for (const one of slice) {
            const { error: rowError } = await db.from(table).upsert(one);
            if (rowError) lastError = rowError.message;
            else salvaged += 1;
          }
          restored += salvaged;
          if (salvaged < slice.length) {
            const lost = slice.length - salvaged;
            failedRows += lost;
            lastFailure = lastError;
          }
          // Deliberately no `break`: the next chunk may be perfectly good,
          // and there is no reason the rest of the shop's history should
          // depend on these particular rows.
          continue;
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
    /* The table's verdict, in the order that matters: a hard failure
       first, then rows that individually refused, then a repair note. All
       three can be true at once, and the most alarming one is the one the
       owner needs at the front. */
    const refused =
      failedRows > 0
        ? `${failedRows} row${failedRows === 1 ? "" : "s"} would not go in (${lastFailure})`
        : null;
    outcomes.push({
      table,
      rows: original.length,
      restored,
      error: [failed, refused, note].filter(Boolean).join(". ") || null,
    });
  }

  /**
   * A restore brings its own ticket numbers, which can sit above where the
   * live sequence is — and then the next real order tries to take a number a
   * restored order already has and the insert fails on the unique index. This
   * moves the sequence past everything now in the table.
   *
   * Not fatal: a restore that got the rows back and could not bump a counter
   * is still a successful restore, and the next order failing is a much
   * smaller problem than the restore appearing to have failed.
   */
  const { error: seqError } = await db.rpc("sync_order_ticket_seq");
  if (seqError) console.error(`[restore] ticket sequence: ${seqError.message}`);

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
    repairs,
  };
}

/**
 * The daily copy, taken because somebody opened HQ rather than because they
 * remembered to.
 *
 * There is no cron on this project, and adding one would mean a platform
 * dependency and a shared secret for a shop that opens HQ every single day it
 * trades. So the visit is the heartbeat — the same trick that closes stale
 * shifts. It also fails in the right direction: a week with no backups is a
 * week where nobody opened the shop, and therefore a week with nothing new to
 * lose.
 *
 * Called from the browser rather than from a page render, deliberately. A
 * snapshot reads every table, and doing that inside a render would make one
 * HQ page load a day mysteriously slow. Fired and forgotten from the client,
 * it happens beside the page instead of in front of it.
 *
 * Any member of staff may trigger it. The snapshot is taken with the service
 * role and nothing comes back, so who pressed the button carries no privilege
 * — and restricting it to the owner would mean no copies on the days the
 * owner does not log in, which is exactly the gap this closes.
 */
export async function backUpIfDue(): Promise<{
  took: boolean;
  error: string | null;
}> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { took: false, error: null };

  const { due } = await automaticBackupDue();
  if (!due) return { took: false, error: null };

  const net = await takeSafetyNet("Daily copy, taken automatically", {
    automatic: true,
  });
  if (!net.ok) {
    // Recorded and reported, never thrown. A failed backup must not break the
    // page that triggered it — but it must not pass silently either, because
    // a backup that quietly stopped working is worse than one that never was.
    console.error(`[backup] automatic: ${net.error}`);
    return { took: false, error: net.error };
  }

  const db = createAdminClient();
  await db.from("activity_log").insert({
    category: "backup",
    description: `Automatic copy taken — ${net.rows} rows, ${(net.bytes / 1_048_576).toFixed(1)} MB`,
    actor: null,
  });

  revalidatePath("/admin/backup");
  return { took: true, error: null };
}

/**
 * The weekly copy that leaves the building.
 *
 * Rides the same heartbeat as the daily one — opening HQ — for the same
 * reasons, and is checked after it so a week where both are due takes the
 * snapshot for the drawer first. Owner-gated unlike the daily copy: this one
 * puts every customer's details into an email, and that is not a decision a
 * shift makes.
 */
export async function sendOffsiteIfDue(): Promise<{ sent: boolean; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) return { sent: false, error: null };
  if (!(await offsiteBackupDue())) return { sent: false, error: null };

  const result = await sendOffsiteBackup();
  const db = createAdminClient();
  await db.from("activity_log").insert({
    category: "backup",
    description: result.sent
      ? "Weekly copy emailed out"
      : `Weekly copy could not be sent — ${result.error ?? "unknown reason"}`,
    actor: viewer?.profile?.id ?? null,
  });
  revalidatePath("/admin/backup");
  return result;
}

/** Turn the weekly copy on or off, and say where it goes. */
export async function saveOffsiteBackup(input: {
  enabled: boolean;
  email: string;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) {
    return { error: "Only the owner can change where the shop's records are sent." };
  }

  const email = input.email.trim();
  // Checked before it is stored, not when the first send fails a week later.
  if (input.enabled && !looksLikeEmail(email)) {
    return { error: "That doesn't look like an email address." };
  }
  if (input.enabled && !emailConfigured()) {
    return {
      error: "Email isn't set up on this site yet, so there is nothing to send with.",
    };
  }

  const db = createAdminClient();
  const { error } = await db
    .from("settings")
    .update({
      offsite_backup_enabled: input.enabled,
      offsite_backup_email: email || null,
      // Cleared, because an old failure has nothing to say about a new setting.
      offsite_backup_last_error: null,
    })
    .eq("id", 1);
  if (error) return { error: error.message };

  await db.from("activity_log").insert({
    category: "backup",
    description: input.enabled
      ? `Weekly copy switched on, going to ${email}`
      : "Weekly copy switched off",
    actor: viewer?.profile?.id ?? null,
  });
  revalidatePath("/admin/backup");
  return { error: null };
}

/** Send one now, so the owner finds out it works before they need it to. */
export async function sendOffsiteNow(): Promise<{ sent: boolean; error: string | null }> {
  const viewer = await getViewer();
  if (!can(viewer, "settings")) {
    return { sent: false, error: "Only the owner can send the shop's records." };
  }
  const result = await sendOffsiteBackup();
  await createAdminClient().from("activity_log").insert({
    category: "backup",
    description: result.sent
      ? "Copy emailed out by hand"
      : `Copy could not be emailed — ${result.error ?? "unknown reason"}`,
    actor: viewer?.profile?.id ?? null,
  });
  revalidatePath("/admin/backup");
  return result;
}
