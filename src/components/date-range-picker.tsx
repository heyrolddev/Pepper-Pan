"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The window the dashboard's sales figure covers.
 *
 * Kept in the URL rather than component state, so a range the owner is
 * looking at survives a refresh and can be bookmarked or sent to someone —
 * "last month's numbers" becomes a link.
 */

const day = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Shop-timezone today, so a late-evening session doesn't jump a day. */
function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function monthStart(offsetMonths = 0): { from: string; to: string } {
  const now = new Date(todayInManila() + "T00:00:00Z");
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1)
  );
  const end =
    offsetMonths === 0
      ? new Date(todayInManila() + "T00:00:00Z")
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 0));
  return { from: iso(start), to: iso(end) };
}

function lastDays(n: number): { from: string; to: string } {
  const to = new Date(todayInManila() + "T00:00:00Z");
  return { from: iso(new Date(to.getTime() - (n - 1) * day)), to: iso(to) };
}

export function DateRangePicker({
  from,
  to,
  isDefault,
}: {
  from: string;
  to: string;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function apply(nextFrom: string, nextTo: string) {
    setStart(nextFrom);
    setEnd(nextTo);
    router.push(`/admin?from=${nextFrom}&to=${nextTo}`);
  }

  const presets: { label: string; range: () => { from: string; to: string } }[] = [
    { label: "This month", range: () => monthStart(0) },
    { label: "Last month", range: () => monthStart(-1) },
    { label: "Last 7 days", range: () => lastDays(7) },
    { label: "Last 30 days", range: () => lastDays(30) },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-ink-800/55">
        From
        <input
          type="date"
          value={start}
          max={end}
          onChange={(e) => setStart(e.target.value)}
          className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink-950 outline-none focus:border-brand-600"
        />
      </label>

      <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-ink-800/55">
        To
        <input
          type="date"
          value={end}
          min={start}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink-950 outline-none focus:border-brand-600"
        />
      </label>

      <button
        onClick={() => apply(start, end)}
        className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600"
      >
        Show
      </button>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              const r = p.range();
              apply(r.from, r.to);
            }}
            className="rounded-full bg-cream-50 px-3 py-1.5 text-xs font-bold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-gold-400 hover:text-ink-950"
          >
            {p.label}
          </button>
        ))}
      </div>

      {!isDefault && (
        <button
          onClick={() => router.push("/admin")}
          className="text-xs font-bold text-brand-700 hover:underline"
        >
          Back to this month
        </button>
      )}
    </div>
  );
}
