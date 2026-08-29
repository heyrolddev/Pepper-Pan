"use client";

import { useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { OrderStatusPicker } from "@/components/order-status-picker";
import { EtaPicker } from "@/components/eta-picker";
import { AdminSearch } from "@/components/admin-search";
import { PaymentVerifier } from "@/components/payment-verifier";
import type { OrderStatus } from "@/lib/orders";
import type { PaymentMethod, PaymentStatus } from "@/lib/payments";

export type AdminOrder = {
  id: string;
  created_at: string;
  status: OrderStatus;
  fulfillment: string;
  revenue: number;
  eta_minutes: number | null;
  cancelled_reason: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  customer_id: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_distance_km: number | null;
  delivery_fee: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  payment_receipt_url: string | null;
  lines: { qty: number; price: number; name: string }[];
  customer: {
    full_name: string | null;
    phone: string | null;
    is_verified: boolean;
    is_blocked: boolean;
  } | null;
  completedBefore: number;
};

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function OrderCard({ order: o }: { order: AdminOrder }) {
  const p = o.customer;
  return (
    <li className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold text-ink-950">
              {o.contact_name || p?.full_name || "Walk-in"}
            </span>
            {!o.customer_id && (
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-100">
                Walk-in
              </span>
            )}
            {p?.is_verified && (
              <span className="rounded-full bg-jade-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-50">
                ✓ Verified
              </span>
            )}
            {p?.is_blocked && (
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-50">
                ⚠ Blocked
              </span>
            )}
            {o.customer_id && !p?.is_verified && !p?.is_blocked && (
              <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-950">
                New customer
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-800/70">
            {o.contact_phone || p?.phone || "no number"} · {o.fulfillment} ·{" "}
            {new Date(o.created_at).toLocaleString()}
          </p>
          {o.customer_id && (
            <p className="text-xs text-ink-800/55">
              {o.completedBefore} completed order{o.completedBefore === 1 ? "" : "s"} before
              this list
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-right">
            <span className="block font-display text-xl font-black text-brand-600">
              {peso(Number(o.revenue) + Number(o.delivery_fee))}
            </span>
            {Number(o.delivery_fee) > 0 && (
              <span className="block text-[11px] text-ink-800/55">
                {peso(Number(o.revenue))} food + {peso(Number(o.delivery_fee))} delivery
              </span>
            )}
          </span>
          {!["completed", "cancelled"].includes(o.status) && (
            <EtaPicker orderId={o.id} eta={o.eta_minutes} />
          )}
          <OrderStatusPicker orderId={o.id} status={o.status} />
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-1 border-t border-ink-950/10 pt-3 text-sm">
        {o.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span className="text-ink-800">
              {l.qty} × {l.name}
            </span>
            <span className="font-semibold text-ink-950">{peso(l.qty * l.price)}</span>
          </li>
        ))}
      </ul>

      <PaymentVerifier
        orderId={o.id}
        method={o.payment_method}
        status={o.payment_status}
        reference={o.payment_reference}
        receiptUrl={o.payment_receipt_url}
        amount={Number(o.revenue) + Number(o.delivery_fee)}
      />

      {o.fulfillment === "delivery" && o.delivery_address && (
        <div className="mt-3 rounded-xl bg-gold-50 px-4 py-3 text-sm ring-1 ring-gold-400/40">
          <p className="font-bold text-ink-950">
            🛵 Deliver to
            {o.delivery_distance_km != null && (
              <span className="ml-2 font-normal text-ink-800/70">
                ~{Number(o.delivery_distance_km)} km away
              </span>
            )}
          </p>
          <p className="mt-1 text-ink-800">{o.delivery_address}</p>
          {o.delivery_lat != null && o.delivery_lng != null && (
            <a
              href={`https://www.openstreetmap.org/?mlat=${o.delivery_lat}&mlon=${o.delivery_lng}#map=17/${o.delivery_lat}/${o.delivery_lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-bold text-brand-600 hover:underline"
            >
              Open the pin in a map ↗
            </a>
          )}
        </div>
      )}

      {o.notes && (
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-3 text-sm text-ink-800">
          <span className="font-bold">Notes:</span> {o.notes}
        </p>
      )}

      {o.status === "cancelled" && o.cancelled_reason && (
        <p className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <span className="font-bold">Cancelled:</span> {o.cancelled_reason}
        </p>
      )}
    </li>
  );
}

export function AdminOrderList({ orders }: { orders: AdminOrder[] }) {
  // Everything a shop would plausibly type into the box: who ordered, their
  // number, what they ordered, the status, and the short order id.
  const searchText = useCallback(
    (o: AdminOrder) =>
      [
        o.contact_name,
        o.customer?.full_name,
        o.contact_phone,
        o.customer?.phone,
        o.status,
        o.fulfillment,
        o.notes,
        o.delivery_address,
        o.payment_method,
        o.payment_status,
        o.payment_reference,
        o.id.slice(0, 8),
        ...o.lines.map((l) => l.name),
      ]
        .filter(Boolean)
        .join(" "),
    []
  );

  return (
    <AdminSearch
      rows={orders}
      searchText={searchText}
      noun="order"
      placeholder="Search name, number, item, status…"
    >
      {(filtered, query) => {
        const open = filtered.filter((o) =>
          ["pending", "confirmed", "preparing", "ready"].includes(o.status)
        );
        const rest = filtered.filter((o) => !open.includes(o));

        if (query.trim() && filtered.length === 0) {
          return (
            <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              No orders match &ldquo;{query}&rdquo;.
            </p>
          );
        }

        return (
          <div className="flex flex-col gap-10">
            <section>
              <h2 className="font-display text-2xl font-black text-ink-950">
                Open orders{open.length > 0 && ` (${open.length})`}
              </h2>
              {open.length === 0 ? (
                <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
                  Nothing waiting — you&apos;re all caught up. 🎉
                </p>
              ) : (
                <ul className="mt-5 flex flex-col gap-4">
                  <AnimatePresence initial={false}>
                    {open.map((o) => (
                      <motion.div
                        key={o.id}
                        layout
                        initial={{ opacity: 0, y: -12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 340, damping: 30 }}
                      >
                        <OrderCard order={o} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </section>

            <section>
              <h2 className="font-display text-2xl font-black text-ink-950">History</h2>
              {rest.length === 0 ? (
                <p className="mt-4 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
                  No past orders yet.
                </p>
              ) : (
                <ul className="mt-5 flex flex-col gap-4">
                  {rest.map((o) => (
                    <OrderCard key={o.id} order={o} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      }}
    </AdminSearch>
  );
}
