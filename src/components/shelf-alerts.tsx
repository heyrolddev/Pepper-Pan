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
        More was sold than the shop had recorded as made. Recount it below, or
        log the batch that was produced without being logged — until one of
        those happens, every count on this page is out by the same amount.
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
    </section>
  );
}
