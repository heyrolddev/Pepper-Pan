"use client";

import { useEffect, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import { ingredientHistory } from "@/app/admin/inventory/actions";
import {
  movesSummary,
  type IngredientMove,
} from "@/lib/ingredient-history";

/**
 * Everything that moved one ingredient, and what moved it.
 *
 * The shop reported this screen as not working, and it was not: it searched
 * the activity log for the ingredient's NAME, so sales — which write to
 * `consumption_log` and name no ingredient anywhere — never appeared at all.
 * Renaming an ingredient erased its past, and "Pork" showed "Pork Belly"'s
 * movements as though they were its own.
 *
 * Now it reads the three ledgers that record movement, by id. Which means
 * the list is longer and needs more shape than a flat run of lines: a
 * headline that says what the period came to, days as headings, and the
 * direction readable without stopping to parse a sign.
 */

/** One tone per kind of movement, so the column scans without being read. */
const TONE: Record<IngredientMove["source"], string> = {
  purchase: "bg-jade-600/12 text-jade-800 ring-jade-600/20",
  sale: "bg-ink-950/6 text-ink-800/80 ring-ink-950/10",
  batch: "bg-gold-400/25 text-ink-900 ring-gold-500/30",
  internal: "bg-brand-600/10 text-brand-700 ring-brand-600/20",
  waste: "bg-chili-600/12 text-chili-800 ring-chili-600/25",
  count: "bg-ink-950/6 text-ink-800/70 ring-ink-950/10",
  other: "bg-ink-950/6 text-ink-800/70 ring-ink-950/10",
};

const LABEL: Record<IngredientMove["source"], string> = {
  purchase: "Delivery",
  sale: "Sale",
  batch: "Batch",
  internal: "Internal",
  waste: "Waste",
  count: "Count",
  other: "Moved",
};

/** A quantity a person reads, not a float. */
function amount(qty: number, unit: string): string {
  const n = Math.round(qty * 1000) / 1000;
  return `${n.toLocaleString("en-PH")} ${unit}`;
}

export function IngredientHistoryDialog({
  row,
  onClose,
}: {
  row: { id: string; name: string; stock: number; unit: string };
  onClose: () => void;
}) {
  const [moves, setMoves] = useState<IngredientMove[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    ingredientHistory(row.id).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setMoves(r.moves);
    });
    return () => {
      alive = false;
    };
  }, [row.id]);

  const summary = moves ? movesSummary(moves) : null;

  // Grouped by day, because a busy Saturday is thirty lines and an
  // undifferentiated run of thirty lines is a wall.
  const days: { date: string; moves: IngredientMove[] }[] = [];
  for (const m of moves ?? []) {
    const last = days[days.length - 1];
    if (last && last.date === m.date) last.moves.push(m);
    else days.push({ date: m.date, moves: [m] });
  }

  return (
    <AdminDialog
      title={row.name}
      subtitle={`${amount(row.stock, row.unit)} on hand — here's everything that moved it.`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        {/* The headline, counted from the very rows listed below rather than
            queried separately — two queries for one figure is how a total
            comes to disagree with the lines under it. */}
        {summary && moves && moves.length > 0 && (
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Came in" value={amount(summary.inQty, row.unit)} tone="good" />
            <Stat label="Went out" value={amount(summary.outQty, row.unit)} />
            <Stat
              label="Spent on it"
              value={summary.spent > 0 ? peso(summary.spent, 0) : "—"}
            />
          </dl>
        )}

        {moves === null ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-800/60">
            Looking…
          </p>
        ) : moves.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm leading-relaxed text-ink-800/70">
            Nothing has moved this one yet. A delivery, a sale, a batch made
            from it, a staff meal or a count will all turn up here — whichever
            it was, and whether it happened online or at the counter.
          </p>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
            {days.map((day) => (
              <section key={day.date}>
                <h4 className="sticky top-0 z-10 -mx-1 bg-cream-50/95 px-1 pb-1.5 text-[11px] font-black uppercase tracking-widest text-ink-800/45 backdrop-blur">
                  {formatDate(day.date)}
                </h4>
                <ul className="flex flex-col gap-1.5">
                  {day.moves.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-3 rounded-xl bg-cream-100 px-3.5 py-2.5"
                    >
                      <span className="min-w-0">
                        <span
                          className={`mr-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${TONE[m.source]}`}
                        >
                          {LABEL[m.source]}
                        </span>
                        <span className="text-sm text-ink-800/80">{m.note}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {/* The sign carries the direction, and the colour
                            carries it again — a minus on a small screen at
                            the end of a shift is easy to miss. */}
                        <span
                          className={`block font-display text-sm font-black tabular-nums ${
                            m.kind === "in" ? "text-jade-700" : "text-ink-950"
                          }`}
                        >
                          {m.kind === "in" ? "+" : "−"}
                          {amount(m.qty, row.unit)}
                        </span>
                        {m.cost !== null && (
                          <span className="block text-[11px] tabular-nums text-ink-800/45">
                            {peso(m.cost, 0)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-xl bg-cream-100 px-3 py-2">
      <dt className="text-[10px] font-black uppercase tracking-widest text-ink-800/45">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-display text-sm font-black tabular-nums ${
          tone === "good" ? "text-jade-700" : "text-ink-950"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
