import { formatDateTime } from "@/lib/format-date";
import type { ShelfAlert } from "@/lib/shelf-alerts";

/**
 * What the shelf said, where somebody will read it.
 *
 * The text is the database's own, written by `apply_order_stock` at the
 * moment the sale went through, and it is left alone on purpose: it names
 * the batch, says how far below zero it went and in what unit, and offers
 * the two explanations that are actually possible. Rewriting it here would
 * give the shop two versions of the same sentence, and the day they drift
 * the one on screen is the one nobody can trace.
 *
 * The two steps below the list are new, and they are there because the
 * banner used to name a problem and stop. "Recount it below" is only an
 * instruction if you already know that "below" means the shelf list on this
 * page, and that the other way out is to log a batch somebody made without
 * logging it. Both are now written where the alarm is, not somewhere the
 * reader is expected to already be.
 *
 * No dismiss button, and that is the design. The alert is news; the problem
 * it points at is the stock count directly underneath, which stays wrong
 * until somebody fixes it. A tick-off box would let the news be cleared
 * while the count is still wrong — which is how a warning turns into a
 * thing people clear rather than read. It goes when the day does.
 */
export function ShelfAlerts({ alerts }: { alerts: ShelfAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="mb-5 rounded-3xl bg-chili-600 px-5 py-4 text-cream-50 ring-1 ring-chili-700/30">
      <h2 className="font-display text-lg font-black leading-tight">
        {alerts.length === 1
          ? "A shelf stopped adding up today"
          : `${alerts.length} shelves stopped adding up today`}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-cream-50/80">
        More was sold than the shop had recorded as made. Until this is put
        right, every count on this page is out by the same amount.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="rounded-2xl bg-cream-50/12 px-4 py-2.5 text-sm leading-relaxed"
          >
            <span className="mr-2 text-xs tabular-nums text-cream-50/55">
              {formatDateTime(a.at)}
            </span>
            {a.description}
          </li>
        ))}
      </ul>

      {/* What to do, in the order worth trying. Written as two choices rather
          than a checklist because they are alternatives: one of them is what
          happened, and the shop knows which. */}
      <div className="mt-3 rounded-2xl bg-ink-950/20 px-4 py-3">
        <p className="text-xs font-black uppercase tracking-widest text-cream-50/60">
          How to put it right
        </p>
        <ol className="mt-1.5 flex flex-col gap-1.5 text-sm leading-relaxed text-cream-50/85">
          <li>
            <b>1 · Somebody made a batch without logging it?</b> Log it now —
            Inventory → the batch → <b>Make</b>. The shelf catches up and this
            clears by itself.
          </li>
          <li>
            <b>2 · No, the count was just wrong?</b> Recount the shelf named
            above and enter what is actually there — Inventory → the
            ingredient → <b>Count</b>.
          </li>
          <li className="text-cream-50/60">
            Either one fixes it. Doing neither leaves every cost and margin on
            this page wrong by the same amount, quietly.
          </li>
        </ol>
      </div>
    </section>
  );
}
