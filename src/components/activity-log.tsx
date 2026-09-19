"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { formatDateTimeFull } from "@/lib/format-date";
import { CATEGORY_LABEL, type Activity } from "@/lib/activity";
import { loadMoreActivity } from "@/app/admin/history/actions";

/**
 * Everything the shop has done.
 *
 * `activity_log` has been written to from a dozen places since the first
 * migration and read by nothing. Every restock, price change, cancellation,
 * clock-in and peso moved has been carefully described in a sentence and
 * filed where nobody could see it.
 *
 * The risk with finally showing it is that it becomes a wall. A shop does
 * forty things on a normal day, so an un-collapsed list is a screen nobody
 * scrolls twice. So: three lines, folded by day, and a date range for the one
 * time somebody actually needs to go looking — which is always a specific
 * question ("what happened to the chicken on Tuesday"), never browsing.
 */

const TONE: Record<string, string> = {
  orders: "bg-brand-600 text-cream-50",
  inventory: "bg-jade-600 text-cream-50",
  movement: "bg-gold-400 text-ink-950",
  menu: "bg-chili-600 text-cream-50",
  money: "bg-ink-950 text-gold-400",
  staff: "bg-ink-800 text-cream-50",
  settings: "bg-ink-950/10 text-ink-800",
};

const SHOWN = 3;

export function ActivityLog({
  rows,
  categories,
  error,
}: {
  rows: Activity[];
  categories: readonly string[];
  error: string | null;
}) {
  const [all, setAll] = useState(false);
  const [found, setFound] = useState<Activity[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [busy, startBusy] = useTransition();

  function look() {
    startBusy(async () => {
      const r = await loadMoreActivity({ from, to, category });
      setFound(r.rows);
    });
  }

  if (error) {
    return (
      <p className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-cream-50">
        {error}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
        Nothing recorded yet. Every restock, price change, sale and shift will
        turn up here as it happens.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {rows.slice(0, SHOWN).map((r) => (
          <Line key={r.id} row={r} />
        ))}
      </ul>

      <button
        onClick={() => setAll(true)}
        className="self-start rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
      >
        See everything →
      </button>

      {all && (
        <AdminDialog
          title="Everything that happened"
          subtitle="Newest first, grouped by day. Narrow it down if you're looking for something in particular."
          onClose={() => setAll(false)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="From">
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className={boxClass}
                  />
                </Field>
                <Field label="To">
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className={boxClass}
                  />
                </Field>
              </div>

              <p className="mb-2 mt-3 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
                Kind
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Chip on={category === ""} onClick={() => setCategory("")}>
                  Everything
                </Chip>
                {categories.map((c) => (
                  <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                    {CATEGORY_LABEL[c] ?? c}
                  </Chip>
                ))}
              </div>

              <button
                onClick={look}
                disabled={busy}
                className="mt-3 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Looking…" : "Look"}
              </button>
            </div>

            <Grouped rows={found ?? rows} />
          </div>
        </AdminDialog>
      )}
    </div>
  );
}

/**
 * Folded by day.
 *
 * A flat list of four hundred sentences is a wall; the same list with today
 * open and the rest shut is something a person can actually use, because the
 * question is nearly always "what happened on that day".
 */
function Grouped({ rows }: { rows: Activity[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-50 p-6 text-sm text-ink-800/70">
        Nothing in that window.
      </p>
    );
  }

  const byDay = new Map<string, Activity[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const days = [...byDay.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="max-h-[50vh] overflow-y-auto">
      <div className="flex flex-col gap-2">
        {days.map((day, i) => (
          <details
            key={day}
            // The newest day open, the rest shut. Somebody opening this
            // screen almost always wants today, and making them tap for it
            // is a tap for the common case to save one for the rare one.
            open={i === 0}
            className="group rounded-2xl bg-cream-100 ring-1 ring-ink-950/10"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="text-sm font-black text-ink-800/40 transition-transform group-open:rotate-90"
              >
                ▸
              </span>
              <span className="flex-1 text-sm font-bold text-ink-950">{day}</span>
              <span className="rounded-full bg-ink-950/8 px-2 py-0.5 text-[11px] font-black tabular-nums text-ink-800/60">
                {byDay.get(day)!.length}
              </span>
            </summary>
            <ul className="flex flex-col gap-1.5 px-3 pb-3">
              {byDay.get(day)!.map((r) => (
                <Line key={r.id} row={r} />
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}

function Line({ row }: { row: Activity }) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-cream-50 px-4 py-2.5 ring-1 ring-ink-950/10">
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
          TONE[row.category ?? ""] ?? "bg-ink-950/10 text-ink-800"
        }`}
      >
        {CATEGORY_LABEL[row.category ?? ""] ?? row.category ?? "System"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-relaxed text-ink-950">
          {row.description}
        </span>
        <span className="text-xs text-ink-800/50">
          {formatDateTimeFull(row.at)}
          {row.who && <> · {row.who}</>}
        </span>
      </span>
    </li>
  );
}

const boxClass =
  "w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        on ? "bg-ink-950 text-gold-400" : "bg-ink-950/5 text-ink-800/65 hover:bg-ink-950/10"
      }`}
    >
      {children}
    </button>
  );
}
