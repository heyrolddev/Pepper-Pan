"use client";

import { useState } from "react";
import { RestorePanel } from "@/components/restore-panel";
import { useRouter } from "next/navigation";
import { hqTitle } from "@/lib/hq-theme";

export type BackupFile = {
  kind: string;
  label: string;
  what: string;
  when: string;
  /** Which tables feed it, so the card can show a real row count. */
  tables: string[];
  sensitive?: boolean;
};

type Count = { table: string; count: number; error: string | null };
type HealthIssue = { kind: string; detail: string };

/** Manila, and in words, because "3 days ago" is the number that matters. */
function ageOf(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const when = new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return { days, when };
}

/**
 * Downloads the file the same way the browser would, but knows when it's done.
 *
 * A plain link would be less code. It would also give no sign that anything is
 * happening while the server reads twenty-nine tables, and no moment at which
 * to refresh the "last backed up" date — so the page would go on saying "never
 * backed up" straight after a backup, which is exactly the reassurance this
 * screen must not get wrong.
 */
function useDownloader() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: string) {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(
        `/admin/backup/download?file=${encodeURIComponent(kind)}`
      );
      if (!res.ok) throw new Error(`The server said no (${res.status}).`);

      // The server already picked a dated filename; using it keeps every
      // backup in the folder distinct instead of "download (4).json".
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1] ?? kind;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Freed on the next tick — revoking immediately can beat the download
      // in some browsers and hand the user an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      // The date only moves for the full backup, but refreshing after any of
      // them is harmless and keeps the counts current.
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The download didn't finish. Try again."
      );
    } finally {
      setBusy(null);
    }
  }

  return { download, busy, error };
}

export function BackupPanel({
  files,
  counts,
  byTable,
  totalRows,
  brokenTables,
  lastBackup,
  health,
}: {
  files: BackupFile[];
  counts: Count[];
  byTable: Record<string, number>;
  totalRows: number;
  brokenTables: string[];
  lastBackup: string | null;
  /** Recipes pointing at things that no longer exist, and duplicate names. */
  health: HealthIssue[];
}) {
  const { download, busy, error } = useDownloader();
  const age = ageOf(lastBackup);

  // Three states, and the middle one is the one that does the work: a backup
  // that is fine today quietly becomes a backup that isn't, and nothing on
  // screen would otherwise change on the day it did.
  const level =
    age === null ? "never" : age.days >= 14 ? "stale" : age.days >= 7 ? "aging" : "fresh";

  const HERO = {
    never: {
      ring: "ring-brand-600/30",
      bg: "bg-brand-600",
      text: "text-cream-50",
      eyebrow: "No copy exists",
      headline: "Everything you have is in one place",
      body: "If this database is lost, so are your recipes, your costs and every order you've taken. Download a copy now — it takes a few seconds and costs nothing.",
    },
    stale: {
      ring: "ring-brand-600/30",
      bg: "bg-brand-600",
      text: "text-cream-50",
      eyebrow: `Last copy ${age?.days} days ago`,
      headline: "Time for a fresh copy",
      body: "Everything you've entered since that day exists in exactly one place. Download again.",
    },
    aging: {
      ring: "ring-gold-600/30",
      bg: "bg-gold-400",
      text: "text-ink-950",
      eyebrow: `Last copy ${age?.days} days ago`,
      headline: "Worth doing again soon",
      body: "A week of orders and any recipe changes since then aren't in your last copy.",
    },
    fresh: {
      ring: "ring-jade-600/30",
      bg: "bg-jade-600",
      text: "text-cream-50",
      eyebrow:
        age?.days === 0 ? "Backed up today" : `Last copy ${age?.days} day${age?.days === 1 ? "" : "s"} ago`,
      headline: "You have a copy",
      body: "Keep it somewhere that isn't this laptop — Google Drive, or a phone. A backup on the machine that breaks is not a backup.",
    },
  }[level];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className={hqTitle}>Backup</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Your own copy of everything the shop knows, saved to this device.
        </p>
      </div>

      {/* The status, and the button, in the same place. Separating them is how
          a backup screen becomes something you read rather than something you
          use. */}
      <section
        className={`overflow-hidden rounded-3xl ${HERO.bg} ${HERO.text} ring-1 ${HERO.ring}`}
      >
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-widest opacity-70">
              {HERO.eyebrow}
            </p>
            <h3 className="mt-1 font-display text-2xl font-black sm:text-3xl">
              {HERO.headline}
            </h3>
            <p className="mt-2 text-sm opacity-85">{HERO.body}</p>
            {age && (
              <p className="mt-3 text-xs opacity-60">Last download: {age.when}</p>
            )}
          </div>

          <div className="shrink-0">
            <button
              onClick={() => download("full.json")}
              disabled={busy !== null}
              className="w-full rounded-2xl bg-ink-950 px-7 py-4 text-left font-display text-lg font-black text-cream-50 shadow-lg transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 lg:w-auto"
            >
              {busy === "full.json" ? (
                <>Packing it up…</>
              ) : (
                <>
                  Download everything
                  <span className="ml-2" aria-hidden>
                    ↓
                  </span>
                </>
              )}
              <span className="mt-0.5 block text-xs font-semibold opacity-60">
                {totalRows.toLocaleString("en-PH")} rows · one .json file
              </span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {brokenTables.length > 0 && (
        <p className="rounded-2xl bg-gold-400 px-5 py-4 text-sm text-ink-950">
          <strong>Some tables couldn&apos;t be read</strong> — {brokenTables.join(", ")}.
          They&apos;ll be empty in the file rather than missing, and the file
          records which ones failed. Everything else still downloaded.
        </p>
      )}

      <section>
        <h3 className="font-display text-lg font-black text-ink-950">
          Or take one piece at a time
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Spreadsheet files, for reading rather than restoring. These open
          straight in Google Sheets or Excel.
        </p>

        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f) => {
            const rows = f.tables.reduce((sum, t) => sum + (byTable[t] ?? 0), 0);
            const empty = rows === 0;
            return (
              <li
                key={f.kind}
                className="flex flex-col rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-display text-lg font-black text-ink-950">
                    {f.label}
                  </h4>
                  <span className="shrink-0 rounded-full bg-ink-950/5 px-2.5 py-1 text-[11px] font-bold tabular-nums text-ink-800/60">
                    {rows.toLocaleString("en-PH")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-800/75">{f.what}</p>
                <p className="mt-1.5 flex-1 text-xs text-ink-800/50">{f.when}</p>

                {f.sensitive && (
                  <p className="mt-3 rounded-xl bg-brand-600/10 px-3 py-2 text-[11px] font-semibold text-brand-700">
                    Personal data — don&apos;t share this one.
                  </p>
                )}

                <button
                  onClick={() => download(f.kind)}
                  disabled={busy !== null || empty}
                  className="mt-4 rounded-xl bg-ink-950 px-4 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-950/20 disabled:text-ink-800/40"
                >
                  {busy === f.kind
                    ? "Preparing…"
                    : empty
                      ? "Nothing to export yet"
                      : "Download CSV ↓"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Folded, because it answers a question most visits don't ask — but the
          one visit that does ask it ("is my inventory really in there?")
          deserves a real answer and not a reassuring sentence. */}
      <details className="rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
        <summary className="cursor-pointer list-none rounded-3xl px-5 py-4 text-sm font-bold text-ink-950">
          What&apos;s inside the full backup
          <span className="ml-2 font-normal text-ink-800/50">
            {counts.length} tables · {totalRows.toLocaleString("en-PH")} rows
          </span>
        </summary>
        <ul className="grid gap-x-6 gap-y-1 border-t border-ink-950/10 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {counts.map((c) => (
            <li
              key={c.table}
              className="flex items-baseline justify-between gap-3 py-1 text-sm"
            >
              <span className="truncate font-mono text-xs text-ink-800/70">
                {c.table}
              </span>
              <span
                className={`shrink-0 tabular-nums ${
                  c.error
                    ? "font-bold text-brand-600"
                    : c.count === 0
                      ? "text-ink-800/30"
                      : "font-bold text-ink-950"
                }`}
              >
                {c.error ? "failed" : c.count.toLocaleString("en-PH")}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {/* Silence here is the good outcome, so it says so rather than showing
          nothing — an absent panel and a clean bill of health look identical
          otherwise. */}
      <section
        className={`rounded-3xl p-6 ring-1 ${
          health.length === 0
            ? "bg-jade-600/10 ring-jade-600/25"
            : "bg-gold-400/25 ring-gold-600/30"
        }`}
      >
        <h3 className="font-display text-lg font-black text-ink-950">
          {health.length === 0
            ? "Your data checks out"
            : `${health.length} thing${health.length === 1 ? "" : "s"} worth a look`}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          {health.length === 0
            ? "Every recipe points at something that exists, and no two dishes share a name."
            : "None of this stops the shop working — but each one makes a number somewhere quietly wrong."}
        </p>
        {health.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {health.map((h, i) => (
              <li key={i} className="text-sm text-ink-800/80">
                <span className="mr-2 rounded-full bg-ink-950/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/70">
                  {h.kind}
                </span>
                {h.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border-2 border-dashed border-ink-950/15 p-6">
        <h3 className="font-display text-lg font-black text-ink-950">
          Where to put the file
        </h3>
        <ol className="mt-3 flex flex-col gap-2 text-sm text-ink-800/75">
          <li>
            <strong className="text-ink-950">1.</strong> Upload it to Google
            Drive, or email it to yourself. Anywhere that isn&apos;t this
            device.
          </li>
          <li>
            <strong className="text-ink-950">2.</strong> Do it again after
            anything you&apos;d hate to re-enter — a new set of recipes, a price
            change across the menu.
          </li>
          <li>
            <strong className="text-ink-950">3.</strong> Keep the last few.
            Backups are most useful when you can go back to before a mistake,
            not just to yesterday.
          </li>
        </ol>
        <p className="mt-4 text-xs text-ink-800/50">
          Putting one back is below. The same thing can be done from a laptop
          with{" "}
          <code className="rounded bg-ink-950/5 px-1.5 py-0.5 font-mono">
            npm run restore your-backup.json
          </code>
          , which is worth knowing about for the case this screen is the thing
          that is broken.
        </p>
      </section>

      <RestorePanel />
    </div>
  );
}
