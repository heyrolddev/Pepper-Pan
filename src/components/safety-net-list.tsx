import { formatDateTime } from "@/lib/format-date";
import type { SnapshotRow } from "@/lib/safety-net";

/**
 * The copies the shop took by itself.
 *
 * A safety net nobody can see is a safety net nobody trusts, and an owner who
 * does not trust it takes a manual backup anyway — which is the behaviour this
 * was built to make unnecessary. So the list is plain: when, before what, how
 * big, and a button that hands the file over.
 *
 * Read-only on purpose. There is no delete button, because the one moment
 * somebody would reach for it is the moment they are annoyed at a mistake and
 * about to remove the only record of what things looked like before it. The
 * five most recent are kept and the rest fall off on their own.
 */
export function SafetyNetList({ snapshots }: { snapshots: SnapshotRow[] }) {
  return (
    <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10 sm:p-8">
      <h3 className="font-display text-xl font-black tracking-tight text-ink-950">
        Safety copies
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/70">
        Taken for you: one every day the shop opens, and one immediately
        before anything is overwritten or cleared. You don&apos;t have to
        remember either. The last 14 daily copies and the last 5 taken before a
        change are kept.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/55">
        These live in the same database as the shop, which is what makes them
        instant and also what limits them: they undo a bad restore or a wrong
        reset, and they cannot survive losing the database. The download above
        is the copy that can.
      </p>

      {snapshots.length === 0 ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-ink-950/15 bg-cream-50 p-5 text-sm text-ink-800/60">
          None yet. The first daily copy is taken the next time HQ is opened,
          and one is taken immediately before any restore or reset.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-50 px-4 py-3 ring-1 ring-ink-950/10"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink-950">
                  {s.reason}
                  {/* Which family, because the two are kept for different
                      lengths of time and mean different things — one is the
                      day's record, the other is the undo for one change. */}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                      s.automatic
                        ? "bg-jade-600/15 text-jade-700"
                        : "bg-gold-400/25 text-ink-800/70"
                    }`}
                  >
                    {s.automatic ? "daily" : "before a change"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-ink-800/55">
                  {formatDateTime(s.taken_at)} ·{" "}
                  <span className="tabular-nums">
                    {s.rows_included.toLocaleString()}
                  </span>{" "}
                  rows ·{" "}
                  <span className="tabular-nums">
                    {(s.bytes / 1024).toFixed(0)} KB
                  </span>
                </p>
              </div>
              <a
                href={`/admin/backup/download?file=safety-net&id=${s.id}`}
                className="shrink-0 rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-ink-800/55">
        These live in the same database they protect, so they cover a wrong
        button rather than a lost project. Keep downloading the full backup as
        well — that one is the copy that survives everything.
      </p>
    </section>
  );
}
