import Link from "next/link";
import { LiveOrdersBanner } from "@/components/live-orders-banner";
import { StatTile } from "@/components/stat-tile";
import { formatDateTime } from "@/lib/format-date";
import { STATUS_LABELS, STATUS_TONES, type OrderStatus } from "@/lib/orders";

export type ServiceOrder = {
  id: string;
  created_at: string;
  status: string;
  contact_name: string | null;
  scheduled_for: string | null;
};

export type ShortDish = { name: string; makeable: number };

/**
 * Today, for the people working it.
 *
 * The owner's Today is a money screen — sales, what was kept, the month
 * against the one before. None of that is a shift's business, and the owner
 * asked for it gone from the staff side.
 *
 * What replaces it is not a cut-down version of the same page. A shift's
 * "today" is a different question: what is waiting, what is on the wok, what
 * is ready to hand over, and what has run out. Those were the four things
 * somebody at the counter had to find by opening three other screens.
 */
export function StaffToday({
  orders,
  waitingLeads,
  shortDishes,
  name,
  onShift,
}: {
  orders: ServiceOrder[];
  waitingLeads: number;
  /** Dishes the shelf can no longer make, or nearly can't. */
  shortDishes: ShortDish[];
  name: string;
  onShift: boolean;
}) {
  const by = (s: string) => orders.filter((o) => o.status === s);
  const waiting = by("pending");
  const accepted = [...by("confirmed"), ...by("preparing")];
  const ready = by("ready");
  const soldOut = shortDishes.filter((d) => d.makeable <= 0);
  const nearlyOut = shortDishes.filter((d) => d.makeable > 0);

  // Everything the shop still owes someone food for, oldest first — the order
  // a queue is actually worked in.
  const queue = [...waiting, ...accepted, ...ready].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  return (
    <div className="flex flex-col gap-10">
      <LiveOrdersBanner />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-display text-2xl font-black text-ink-950">
            Hi {name.split(/\s+/)[0] || "there"}
          </h2>
          <p className="mt-1 text-sm text-ink-800/60">
            {onShift
              ? "You're clocked in. Here's what the shop owes people right now."
              : "You're not clocked in yet — the clock is at the bottom of the sidebar."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="New in"
            value={String(waiting.length)}
            detail="Nobody has accepted these yet"
            tone={waiting.length > 0 ? "alert" : "plain"}
          />
          <StatTile
            label="On the wok"
            value={String(accepted.length)}
            detail="Accepted or cooking"
          />
          <StatTile
            label="Ready to hand over"
            value={String(ready.length)}
            detail="Cooked and waiting"
            tone={ready.length > 0 ? "good" : "plain"}
          />
          <StatTile
            label="Sold out"
            value={String(soldOut.length)}
            detail={
              nearlyOut.length > 0
                ? `${nearlyOut.length} more nearly gone`
                : "Nothing has run out"
            }
            tone={soldOut.length > 0 ? "alert" : "plain"}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/counter"
            className="rounded-full bg-jade-600 px-6 py-3 text-sm font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Ring up a sale →
          </Link>
          {queue.length > 0 && (
            <Link
              href="/admin/orders"
              className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-cream-50 transition-transform hover:scale-105"
            >
              {queue.length} order{queue.length === 1 ? "" : "s"} open →
            </Link>
          )}
          {waitingLeads > 0 && (
            <Link
              href="/admin/inbox"
              className="rounded-full bg-gold-400 px-6 py-3 text-sm font-bold text-ink-950 transition-transform hover:scale-105"
            >
              💬 {waitingLeads} waiting on a reply →
            </Link>
          )}
        </div>
      </section>

      {/* The queue itself, not a link to it. Someone standing at the counter
          should not have to navigate to find out what is next. */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-black text-ink-950">
            The queue
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm font-bold text-brand-600 hover:underline"
          >
            Open the board →
          </Link>
        </div>

        {queue.length === 0 ? (
          <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            Nothing waiting. Everything that came in has been handed over.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {queue.map((o) => {
              const tone = STATUS_TONES[o.status as OrderStatus];
              return (
                <li
                  key={o.id}
                  className={`flex items-center justify-between gap-4 rounded-2xl border-l-4 bg-cream-100 px-5 py-3 ring-1 ring-ink-950/10 ${
                    tone?.rail ?? "border-ink-800"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-950">
                      {o.contact_name || "Walk-in"}
                    </span>
                    <span className="text-xs text-ink-800/55">
                      {formatDateTime(o.created_at)}
                      {o.scheduled_for && " · scheduled"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                      tone?.chip ?? "bg-ink-800 text-cream-50"
                    }`}
                  >
                    {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* What to stop promising. A dish that can't be made is worth knowing
          before somebody orders it, not after. */}
      {shortDishes.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-black text-ink-950">
            Running out
          </h2>
          <p className="mt-1 text-sm text-ink-800/60">
            Worked out from what&apos;s left on the shelf. Tell whoever does
            the buying — the counts are on the Inventory screen.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {shortDishes.map((d) => (
              <li
                key={d.name}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  d.makeable <= 0
                    ? "bg-brand-600 text-cream-50"
                    : "bg-gold-400 text-ink-950"
                }`}
              >
                {d.name}
                <span className="ml-2 tabular-nums opacity-70">
                  {d.makeable <= 0 ? "none left" : `${d.makeable} left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
