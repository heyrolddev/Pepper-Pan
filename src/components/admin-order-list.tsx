"use client";

import { useCallback, useState } from "react";
import { alertEtaElapsed } from "@/app/admin/orders/actions";
import { OrderStatusPicker } from "@/components/order-status-picker";
import { EtaPicker } from "@/components/eta-picker";
import { AdminSearch } from "@/components/admin-search";
import { PaymentVerifier } from "@/components/payment-verifier";
import { ACTIVE_ORDER_STATUSES, STATUS_LABELS, STATUS_TONES, ORDER_STATUSES, type OrderStatus } from "@/lib/orders";
import { OrderBoard, type View } from "@/components/order-board";
import { Foldable } from "@/components/foldable";
import { moneyLine, moneyState, type PaymentMethod, type PaymentPlan, type PaymentStatus } from "@/lib/payments";
import { formatDateTimeFull } from "@/lib/format-date";
import { EtaCountdown } from "@/components/eta-countdown";

export type AdminOrder = {
  id: string;
  created_at: string;
  scheduled_for: string | null;
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
  eta_set_at: string | null;
  payment_plan: PaymentPlan;
  downpayment_amount: number;
  downpayment_confirmed_at: string | null;
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
  const money = moneyState(o);
  return (
    <div className="bg-cream-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status first, in the queue's own colour. The picker on the
                right says what you can change it to; this says what it is,
                where the eye already starts. Scanning twenty orders should
                not mean reading twenty dropdowns. */}
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                STATUS_TONES[o.status].chip
              }`}
            >
              {STATUS_LABELS[o.status]}
            </span>
            <span className="font-display text-lg font-bold text-ink-950">
              {o.contact_name || p?.full_name || "Walk-in"}
            </span>
            {/* The confirmation when completing is a moment and it can be
                clicked through. This stays until the money is settled, which
                is what actually gets it chased. */}
            {o.status === "completed" && money.balance > 0 && (
              <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-cream-50">
                ⚠ {peso(money.balance)} unpaid
              </span>
            )}
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
            {formatDateTimeFull(o.created_at)}
          </p>

          {/* An advance order that looks like a normal one gets cooked
              immediately, so this is stated loudly rather than as a detail. */}
          {o.scheduled_for && (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-gold-400 px-3 py-1 text-xs font-black text-ink-950">
              📅 For {formatDateTimeFull(o.scheduled_for)}
            </p>
          )}
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
              {peso(money.total)}
            </span>
            {/* The total alone doesn't say whether any of it arrived. Unpaid,
                half-paid and paid in full looked identical here, which is the
                one distinction the shop is actually keeping track of. */}
            <span
              className={`block text-[11px] font-bold ${
                money.settled
                  ? "text-jade-700"
                  : money.partPaid
                    ? "text-chili-700"
                    : money.awaitingCheck
                      ? "text-gold-700"
                      : "text-ink-800/55"
              }`}
            >
              {moneyLine(money)}
            </span>
            {Number(o.delivery_fee) > 0 && (
              <span className="block text-[11px] text-ink-800/55">
                {peso(Number(o.revenue))} food + {peso(Number(o.delivery_fee))} delivery
              </span>
            )}
          </span>
          {/* The ETA answers "how long until it's ready", so it retires the
              moment the answer is "it is". Setting the status to ready clears
              the stored ETA too — this just stops offering a control that can
              only produce a wrong promise. */}
          {!["ready", "out_for_delivery", "completed", "cancelled"].includes(
            o.status
          ) && (
            <span className="flex items-center gap-2">
              {o.eta_minutes != null && (
                <EtaCountdown
                  minutes={o.eta_minutes}
                  from={o.eta_set_at}
                  overdueLabel
                  // The tablet is the timer; this turns it into a buzz on the
                  // owner's phone, which is where they actually are.
                  onElapsed={() => void alertEtaElapsed(o.id)}
                />
              )}
              <EtaPicker orderId={o.id} eta={o.eta_minutes} />
            </span>
          )}
          <OrderStatusPicker
            orderId={o.id}
            status={o.status}
            fulfillment={o.fulfillment}
            money={money}
          />
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
        plan={o.payment_plan}
        total={Number(o.revenue) + Number(o.delivery_fee)}
        downpayment={Number(o.downpayment_amount)}
        downpaymentConfirmedAt={o.downpayment_confirmed_at}
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
    </div>
  );
}

/**
 * Every order, folded to one line until you want it.
 *
 * This started as a fix for Completed, which grows forever — but a lunch rush
 * has the same problem for a different reason. Eight open orders is eight full
 * cards of controls, and finding the one a customer is ringing about means
 * scrolling past seven you aren't dealing with. The line carries what you scan
 * for (who, what state, how much, whether it's late); the card carries what
 * you act on.
 *
 * Live queues start open, because during service the controls *are* the point
 * and folding them would cost a tap on every order. Closed queues start folded,
 * because nobody is going to touch them again.
 */
function OrderRow({ order: o, startOpen }: { order: AdminOrder; startOpen: boolean }) {
  const money = moneyState(o);
  const owed = money.balance > 0;
  const tone = STATUS_TONES[o.status];
  const who = o.contact_name || o.customer?.full_name || "Walk-in";

  return (
    <Foldable
      startOpen={startOpen}
      chip={tone.chip}
      rail={tone.rail}
      title={STATUS_LABELS[o.status]}
      folded={
        <>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone.chip}`}
          >
            {STATUS_LABELS[o.status]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950">
            {who}
          </span>
          {/* Two things survive the fold, because they're the two reasons to
              open a row: it's late, or it hasn't been paid for. */}
          {o.eta_minutes != null && tone.live && (
            <EtaCountdown
              minutes={o.eta_minutes}
              from={o.eta_set_at}
              overdueLabel
              className="hidden shrink-0 scale-90 sm:inline-flex"
            />
          )}
          {owed && (
            <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cream-50">
              ⚠ {peso(money.balance)}
            </span>
          )}
          <span className="hidden shrink-0 text-xs text-ink-800/50 md:block">
            {formatDateTimeFull(o.created_at)}
          </span>
          <span className="shrink-0 font-display text-sm font-black tabular-nums text-ink-950">
            {peso(money.total)}
          </span>
        </>
      }
    >
      <OrderCard order={o} />
    </Foldable>
  );
}

export function AdminOrderList({ orders }: { orders: AdminOrder[] }) {
  // "Open" is the working view during service; the per-status tabs answer a
  // specific question. Kept here rather than in the URL because it's a glance,
  // not a destination — nobody bookmarks "the cancelled ones".
  const [view, setView] = useState<View>("open");

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
        // Counts come from what the search left behind, not from every order
        // in the shop. A tab that says 40 and then shows 2 is a tab lying
        // about what clicking it does.
        const counts = { open: 0 } as Record<View, number>;
        for (const st of ORDER_STATUSES) counts[st] = 0;
        for (const o of filtered) {
          counts[o.status] += 1;
          if (ACTIVE_ORDER_STATUSES.includes(o.status)) counts.open += 1;
        }

        const live = view === "open" || STATUS_TONES[view].live;

        const shown =
          view === "open"
            ? filtered.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status))
            : filtered.filter((o) => o.status === view);

        if (query.trim() && filtered.length === 0) {
          return (
            <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              No orders match &ldquo;{query}&rdquo;.
            </p>
          );
        }

        return (
          <div className="flex flex-col gap-5">
            <OrderBoard view={view} onView={setView} counts={counts} />

            {shown.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
                {/* With a search box above, "nothing is preparing right now"
                    is a lie — plenty might be, just nothing matching what was
                    typed. Say which of the two it is. */}
                {query.trim()
                  ? `Nothing in this queue matches \u201C${query.trim()}\u201D.`
                  : view === "open"
                    ? "Nothing waiting — you're all caught up. \u{1F389}"
                    : `No orders are ${STATUS_LABELS[view].toLowerCase()} right now.`}
              </p>
            ) : (
              <ul className={`flex flex-col ${live ? "gap-4" : "gap-1.5"}`}>
                {/* Only the live queues animate. Watching forty completed
                    orders spring into place every time you open History is
                    motion for its own sake, and it costs a frame each. */}
                {shown.map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    // Live work opens to its controls; finished work doesn't.
                    startOpen={live}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </AdminSearch>
  );
}
