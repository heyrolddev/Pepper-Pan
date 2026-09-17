"use client";

import Link from "next/link";
import { Foldable } from "@/components/foldable";
import { peso } from "@/lib/costing";
import { formatDateTimeFull } from "@/lib/format-date";
import { STATUS_LABELS, STATUS_TONES, type OrderStatus } from "@/lib/orders";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/payments";

/**
 * The last few orders, each one openable.
 *
 * It was a flat list: name, time, status, amount. Four facts, and the two the
 * owner actually asks about — what was kept on it, and whether it has been
 * paid for — were not among them. Following a name to the orders board to
 * find out is a page load for a question the dashboard already had the answer
 * to in its own query.
 *
 * So the same row folds open. Closed, it reads exactly as it did. Open, it
 * says what the ingredients cost, what was left, how it was paid and how it
 * was collected. `Foldable` is the accordion the orders board and the
 * payments ledger already use — one behaviour, one look, and the coloured
 * rail down the left means a column of these reads as a queue without
 * anything being opened at all.
 */

export type RecentOrder = {
  id: string;
  created_at: string;
  status: string;
  fulfillment: string;
  revenue: number;
  cogs: number;
  delivery_fee: number | null;
  payment_status: string;
  payment_method: string;
  contact_name: string | null;
};

const FULFILMENT: Record<string, string> = {
  delivery: "Delivery",
  dine_in: "Dine in",
  pickup: "Pick-up",
};

const PAID: Record<string, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "text-jade-700" },
  partial: { label: "Part paid", tone: "text-chili-700" },
  submitted: { label: "Waiting to be checked", tone: "text-gold-700" },
  unpaid: { label: "Unpaid", tone: "text-brand-700" },
  refunded: { label: "Refunded", tone: "text-ink-800/55" },
};

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  if (orders.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
        No orders yet.
      </p>
    );
  }

  return (
    <ul className="mt-5 flex flex-col gap-2">
      {orders.map((o) => {
        const status = o.status as OrderStatus;
        const tone = STATUS_TONES[status] ?? STATUS_TONES.pending;
        const who = o.contact_name || "Walk-in";
        const revenue = Number(o.revenue) || 0;
        const cogs = Number(o.cogs) || 0;
        // An order with no recipe behind it carries no cost, and saying it
        // kept everything would be a lie the owner might act on.
        const costed = revenue > 0 && cogs > 0;
        const paid = PAID[o.payment_status] ?? PAID.unpaid;

        return (
          <Foldable
            key={o.id}
            chip={tone.chip}
            rail={tone.rail}
            title={STATUS_LABELS[status] ?? o.status}
            folded={
              <>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone.chip}`}
                >
                  {STATUS_LABELS[status] ?? o.status}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink-950">
                    {who}
                  </span>
                  <span className="text-xs text-ink-800/55">
                    {formatDateTimeFull(o.created_at)}
                  </span>
                </span>
                <span className="shrink-0 font-display font-black tabular-nums text-ink-950">
                  {peso(revenue, 0)}
                </span>
              </>
            }
          >
            <div className="bg-cream-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink-950">{who}</p>
                  <p className="mt-1 text-sm text-ink-800/60">
                    #{o.id.slice(0, 8)} · {FULFILMENT[o.fulfillment] ?? o.fulfillment} ·{" "}
                    {METHOD_LABEL[o.payment_method as PaymentMethod] ?? o.payment_method}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-bold ${paid.tone}`}>
                  {paid.label}
                </span>
              </div>

              {/* The half a flat row could never show: what this one order
                  actually left behind. */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <Cell label="Took" value={peso(revenue, 0)} />
                <Cell
                  label="Ingredients"
                  value={costed ? peso(cogs, 0) : "—"}
                  muted={!costed}
                />
                <Cell
                  label="Kept"
                  value={costed ? peso(revenue - cogs, 0) : "Not costed"}
                  muted={!costed}
                  good={costed}
                />
              </div>

              {Number(o.delivery_fee) > 0 && (
                <p className="mt-3 text-xs text-ink-800/55">
                  Plus {peso(Number(o.delivery_fee), 0)} delivery, which goes
                  straight back out to the rider — it is not in the figures
                  above.
                </p>
              )}
              {!costed && (
                <p className="mt-3 text-xs text-ink-800/55">
                  No recipe behind this one, so what it kept is unknown. Give
                  the dish a recipe on <strong>Dish costs</strong> and future
                  orders of it will carry a cost.
                </p>
              )}

              <Link
                href="/admin/orders"
                className="mt-4 inline-block text-sm font-bold text-brand-600 hover:underline"
              >
                Open on the orders board →
              </Link>
            </div>
          </Foldable>
        );
      })}
    </ul>
  );
}

function Cell({
  label,
  value,
  muted,
  good,
}: {
  label: string;
  value: string;
  muted?: boolean;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl bg-cream-50 px-3 py-2.5 ring-1 ring-ink-950/10">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display text-base font-black tabular-nums ${
          muted ? "text-ink-800/45" : good ? "text-jade-700" : "text-ink-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
