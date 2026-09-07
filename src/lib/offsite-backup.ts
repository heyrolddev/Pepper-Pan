import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectSnapshot, snapshotToJson } from "@/lib/backup";

/**
 * The copy that leaves the building.
 *
 * The daily copies from 0037 live in the same database they protect. They
 * undo a bad restore, a wrong reset or a botched import — and they cannot
 * survive losing the project, because there is nothing left to read them out
 * of. This is the one that can.
 *
 * Email, because the shop already sends it. Resend is configured for order
 * updates, so a weekly attachment costs nothing new and needs no second
 * account for the owner to forget the password to.
 */

/**
 * Weekly, measured a little short of seven days.
 *
 * 160 rather than 168 for the same reason the daily check uses 20 hours: at
 * exactly a week, a shop that opens slightly earlier each Monday drifts into
 * skipping one.
 */
export const OFFSITE_DUE_HOURS = 160;

/**
 * The most this will attach.
 *
 * Resend accepts around 40MB for the whole request and the payload is
 * base64-encoded on the way, which costs a third on top — so 18MB of JSON is
 * the honest ceiling. Past it the email still goes, saying plainly that the
 * records have outgrown being posted and the download is now the only way.
 * Silently sending nothing is the one thing this must not do.
 */
const MAX_ATTACH_BYTES = 18 * 1024 * 1024;

export type OffsiteSettings = {
  enabled: boolean;
  email: string | null;
  lastAt: string | null;
  lastError: string | null;
  /** Whether email is set up at all on this deployment. */
  configured: boolean;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.SHOP_FROM_EMAIL);
}

export async function readOffsiteSettings(): Promise<OffsiteSettings> {
  const db = createAdminClient();
  const { data } = await db
    .from("settings")
    .select(
      "offsite_backup_enabled, offsite_backup_email, offsite_backup_last_at, offsite_backup_last_error"
    )
    .eq("id", 1)
    .maybeSingle();

  return {
    enabled: Boolean(data?.offsite_backup_enabled),
    email: (data?.offsite_backup_email as string | null) ?? null,
    lastAt: (data?.offsite_backup_last_at as string | null) ?? null,
    lastError: (data?.offsite_backup_last_error as string | null) ?? null,
    configured: emailConfigured(),
  };
}

/** Not a validator so much as a guard against a typo silently costing a year. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

type SendResult = { sent: boolean; error: string | null };

/**
 * Take the snapshot and post it.
 *
 * Records the outcome either way. A weekly backup that stopped working eleven
 * weeks ago and never said so is worse than one that was never set up, because
 * the owner has been counting on it.
 */
export async function sendOffsiteBackup(): Promise<SendResult> {
  const db = createAdminClient();
  const settings = await readOffsiteSettings();

  if (!settings.configured) {
    return { sent: false, error: "Email isn't set up on this site (RESEND_API_KEY)." };
  }
  const to = settings.email?.trim();
  if (!to || !looksLikeEmail(to)) {
    return { sent: false, error: "No address to send it to." };
  }

  let payload: string;
  let rows = 0;
  try {
    const snapshot = await collectSnapshot();
    rows = snapshot.tables.reduce((n, t) => n + t.rows.length, 0);
    payload = snapshotToJson(snapshot);
  } catch (e) {
    const error = e instanceof Error ? e.message : "could not read the shop's tables";
    await note(db, { error });
    return { sent: false, error };
  }

  const bytes = Buffer.byteLength(payload, "utf8");
  const stamp = new Date().toISOString().slice(0, 10);
  const tooBig = bytes > MAX_ATTACH_BYTES;

  const body = tooBig
    ? [
        "The weekly copy could not be attached: the shop's records are now",
        `${(bytes / 1_048_576).toFixed(1)} MB, past what email will carry.`,
        "",
        "Nothing is lost — the records are fine and the daily copies inside the",
        "shop are still being taken. But the off-site copy has to be a download",
        "from now on: HQ → Backup → Download everything.",
      ].join("\n")
    : [
        "Attached is a full copy of everything Pepper Pan knows, as of today.",
        "",
        `${rows.toLocaleString()} rows · ${(bytes / 1_048_576).toFixed(1)} MB`,
        "",
        "Keep it somewhere that isn't the shop's phone or laptop. To put it back:",
        "HQ → Backup → Restore, and choose this file.",
        "",
        "This file contains every customer's name, phone and address. Treat it",
        "like the shop's books, because it is.",
      ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SHOP_FROM_EMAIL,
        to,
        subject: tooBig
          ? `Pepper Pan backup — too big to email (${stamp})`
          : `Pepper Pan backup — ${stamp}`,
        text: body,
        ...(tooBig
          ? {}
          : {
              attachments: [
                {
                  filename: `pepperpan-backup_${stamp}.json`,
                  content: Buffer.from(payload, "utf8").toString("base64"),
                },
              ],
            }),
      }),
      // Generous, because this is megabytes rather than a status update — but
      // still bounded, so a hung provider cannot hold a request open.
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      const error = `Email provider said ${res.status}. ${detail}`.trim();
      await note(db, { error });
      return { sent: false, error };
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "the email did not go";
    await note(db, { error });
    return { sent: false, error };
  }

  // The stamp records that a FILE went out, not that a button was pressed.
  // A "last sent" date that records intent is the kind of reassurance that
  // gets somebody through a data loss believing they were covered.
  await note(db, { at: new Date().toISOString() });
  return { sent: tooBig ? false : true, error: tooBig ? "Too big to attach — sent a warning instead." : null };
}

async function note(
  db: ReturnType<typeof createAdminClient>,
  what: { at?: string; error?: string }
): Promise<void> {
  const { error } = await db
    .from("settings")
    .update({
      ...(what.at ? { offsite_backup_last_at: what.at } : {}),
      offsite_backup_last_error: what.error ?? null,
    })
    .eq("id", 1);
  if (error) console.error(`[offsite] note: ${error.message}`);
}

/** Whether a weekly copy is owed. */
export async function offsiteBackupDue(): Promise<boolean> {
  const s = await readOffsiteSettings();
  if (!s.enabled || !s.configured || !s.email) return false;
  if (!s.lastAt) return true;
  return (Date.now() - new Date(s.lastAt).getTime()) / 3_600_000 >= OFFSITE_DUE_HOURS;
}
