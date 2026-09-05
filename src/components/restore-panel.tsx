"use client";

import { useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import {
  restoreFromBackup,
  type RestoreResult,
  type TableOutcome,
} from "@/app/admin/backup/actions";

/**
 * Putting a backup back, from HQ.
 *
 * This used to be a terminal command, which meant it needed a laptop, a
 * checkout of the code, and the service-role key in a local file. That is a
 * lot to have ready on the one day it matters, and the day it matters is the
 * day the data is gone.
 *
 * Three deliberate frictions, because this writes over live rows:
 *
 *   The file is read and checked in the browser first, so "that isn't a
 *   Pepper Pan backup" comes back instantly rather than after an upload.
 *
 *   Nothing is sent until a dialog says, in words, what will happen — which
 *   is not "everything is replaced". It upserts: rows in the file overwrite
 *   rows with the same id, and anything added since is left alone. People
 *   assume restore means rewind, and it does not.
 *
 *   The result is per table rather than a tick. `profiles` routinely fails on
 *   a fresh project, because its rows point at sign-ins that no longer exist,
 *   and the honest thing is to say so while the recipes and the sales history
 *   came back fine.
 */
export function RestorePanel() {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [asking, setAsking] = useState(false);
  /** What the file turned out to be, worked out before anything is uploaded. */
  const [preview, setPreview] = useState<{
    kind: "legacy" | "native";
    counts: Record<string, number>;
    dropped: string[];
    unusable: string[];
    total: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function pick(file: File | undefined) {
    setError(null);
    setResult(null);
    if (!file) return;
    // A backup of this shop is a couple of megabytes. Anything far past that
    // is not one, and reading it into memory to find that out is wasteful.
    if (file.size > 64 * 1024 * 1024) {
      setError("That file is over 64MB — that isn't a Pepper Pan backup.");
      return;
    }
    const body = await file.text();
    // Checked here so a wrong file is refused before anything is uploaded.
    const { readBackup } = await import("@/lib/restore-order");
    const parsed = readBackup(body);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    // Worked out in the browser, from the file's own table names, so the
    // owner never has to know which of the two shapes they are holding. The
    // moment they have to choose is the moment they can choose wrong.
    const { convertLegacyBackup, detectBackupKind } = await import("@/lib/legacy-import");
    const kind = detectBackupKind(parsed) === "legacy" ? "legacy" : "native";
    const counts: Record<string, number> = {};
    let dropped: string[] = [];
    let unusable: string[] = [];

    if (kind === "legacy") {
      const { report } = convertLegacyBackup(parsed);
      Object.assign(counts, report.counts);
      dropped = report.dropped;
      unusable = report.skipped;
    } else {
      for (const [table, rows] of Object.entries(parsed.data ?? {})) {
        if (Array.isArray(rows) && rows.length > 0) counts[table] = rows.length;
      }
    }

    const total = Object.values(counts).reduce((n, c) => n + c, 0);
    if (total === 0) {
      setError("That file has no records in it.");
      return;
    }

    setPreview({ kind, counts, dropped, unusable, total });
    setText(body);
    setName(file.name);
    setAsking(true);
  }

  async function confirm() {
    if (!text) return;
    setBusy(true);
    setError(null);
    const r = await restoreFromBackup(text);
    setBusy(false);
    setAsking(false);
    setText(null);
    setPreview(null);
    if (input.current) input.current.value = "";
    if ("error" in r && r.error) setError(r.error);
    else setResult(r);
  }

  const failedTables =
    result && result.error === null
      ? result.outcomes.filter((o) => o.error)
      : [];
  const rowsBack =
    result && result.error === null
      ? result.outcomes.reduce((n, o) => n + o.restored, 0)
      : 0;

  return (
    <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10 sm:p-8">
      <h3 className="font-display text-xl font-black tracking-tight text-ink-950">
        Put a backup back
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/70">
        Choose a backup file — either one downloaded from here, or one
        exported from the phone app this system replaced. It works out which
        it is by itself, shows you what it found before anything is written,
        and takes a safety copy of what is here now. Safe to run twice.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600">
          Choose backup file
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
        <span className="text-xs text-ink-800/50">
          From HQ, or from the old phone app —{" "}
          <code className="font-mono">.json</code>
        </span>
      </div>

      {error && (
        <p className="mt-4 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {result && result.error === null && (
        <div className="mt-5 rounded-2xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
          <p className="font-display text-lg font-black text-ink-950">
            {rowsBack.toLocaleString()} rows restored
            {result.exportedAt && (
              <span className="ml-2 text-sm font-semibold text-ink-800/60">
                from the backup of {result.exportedAt.slice(0, 10)}
              </span>
            )}
          </p>

          {failedTables.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-bold text-brand-600">
                {failedTables.length} table
                {failedTables.length === 1 ? "" : "s"} did not come back:
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {failedTables.map((o: TableOutcome) => (
                  <li key={o.table} className="text-sm text-ink-800/75">
                    <code className="font-mono font-bold">{o.table}</code> —{" "}
                    {o.error} ({o.restored} of {o.rows})
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-800/55">
                <code className="font-mono">profiles</code> failing here is
                normal on a fresh project: those rows point at sign-ins that
                only exist in the old one. Everything else is unaffected.
              </p>
            </div>
          )}

          {result.skipped.length > 0 && (
            <p className="mt-4 text-xs text-ink-800/55">
              Not restored, because this version doesn&apos;t know them:{" "}
              {result.skipped.join(", ")}. That means the backup is from a
              newer build than the one running.
            </p>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800/70">
              Every table
            </summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {result.outcomes.map((o) => (
                <li
                  key={o.table}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <code className="font-mono text-ink-800/75">{o.table}</code>
                  <span
                    className={`shrink-0 tabular-nums ${
                      o.error ? "text-brand-600" : "text-ink-800/55"
                    }`}
                  >
                    {o.restored}/{o.rows}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {asking && (
        <AdminDialog
          title={
            preview?.kind === "legacy"
              ? "Bring in the old app's records?"
              : "Restore this backup?"
          }
          subtitle={name}
          onClose={() => {
            if (busy) return;
            setAsking(false);
            setText(null);
            setPreview(null);
            if (input.current) input.current.value = "";
          }}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            {preview && (
              <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
                <p className="text-sm font-bold text-ink-950">
                  {preview.kind === "legacy"
                    ? "Read as a backup from the old phone app"
                    : "Read as a backup from this website"}
                </p>
                <p className="mt-1 text-xs text-ink-800/60">
                  {preview.total.toLocaleString()} records in{" "}
                  {Object.keys(preview.counts).length} tables
                </p>
                {/* The counts before the button, not after it. A decision made
                    against real numbers is a different decision from one made
                    against a filename. */}
                <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {Object.entries(preview.counts).map(([table, n]) => (
                    <li
                      key={table}
                      className="flex items-baseline justify-between gap-3 text-xs"
                    >
                      <code className="font-mono text-ink-800/70">{table}</code>
                      <span className="shrink-0 tabular-nums text-ink-800/55">
                        {n.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview?.kind === "legacy" && (
              <div className="rounded-2xl bg-gold-300/25 px-4 py-3">
                <p className="text-sm font-semibold text-ink-950">
                  Stock levels will be set to what this file says.
                </p>
                <p className="mt-1 text-sm text-ink-800/75">
                  This is not a merge of the two systems. If you have counted
                  or sold anything here since this file was exported, those
                  changes are replaced by the old app&apos;s numbers.
                </p>
                <p className="mt-2 text-sm text-ink-800/75">
                  Dishes arrive <strong>hidden</strong> from the customer menu,
                  and every order arrives marked <strong>completed</strong> —
                  so nothing lands in the live queue and nothing appears on the
                  public menu until you say so.
                </p>
              </div>
            )}

            {preview && preview.dropped.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-800/50">
                  Not carried over
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {preview.dropped.map((d) => (
                    <li key={d} className="text-xs text-ink-800/65">
                      • {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview && preview.unusable.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">
                  Skipped
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {preview.unusable.map((d) => (
                    <li key={d} className="text-xs text-ink-800/65">
                      • {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-ink-800/80">
              Rows in this file will <strong>overwrite</strong> rows with the
              same id — prices, recipes, stock levels and orders included.
            </p>
            <p className="text-sm text-ink-800/80">
              Anything added since this backup was taken stays where it is.
              This does <strong>not</strong> rewind the shop to that day; it
              puts the file&apos;s version of each row back on top.
            </p>
            <p className="rounded-xl bg-gold-300/25 px-4 py-3 text-sm font-semibold text-ink-950">
              Download a fresh backup first if there is anything here worth
              keeping — this cannot be undone.
            </p>

            <div className="mt-1 flex flex-wrap gap-3">
              <button
                onClick={confirm}
                disabled={busy}
                className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Restoring…" : "Yes, restore it"}
              </button>
              <button
                onClick={() => {
                  setAsking(false);
                  setText(null);
                  setPreview(null);
                  if (input.current) input.current.value = "";
                }}
                disabled={busy}
                className="rounded-full px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </section>
  );
}
