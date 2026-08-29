"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { cancelMyOrder, submitPayment, updateMyOrder } from "@/app/orders/actions";
import { ClockIcon, LiveDotIcon } from "@/components/icons";
import { OrderReviewPanel, type ReviewableItem } from "@/components/order-review-panel";
import { formatDateTime } from "@/lib/format-date";
import {
  METHOD_LABEL,
  STATUS_LABEL,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentStatus,
} from "@/lib/payments";

export type TrackedLine = {
  id: number;
  qty: number;
  price_at_sale: number;
  name: string;
};

export type TrackedOrder = {
  id: string;
  created_at: string;
  status: string;
  fulfillment: string;
  revenue: number;
  eta_minutes: number | null;
  cancelled_reason: string | null;
  delivery_address: string | null;
  delivery_fee: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  payment_plan: PaymentPlan;
  downpayment_amount: number;
  downpayment_confirmed_at: string | null;
  reviewable: ReviewableItem[];
  lines: TrackedLine[];
};

/** The happy path, in order. `cancelled` deliberately sits outside it. */
const STEPS = ["pending", "confirmed", "preparing", "ready", "completed"] as const;

const STEP_COPY: Record<string, { label: string; blurb: string }> = {
  pending: { label: "Placed", blurb: "We've got your order — waiting for the shop to confirm." },
  confirmed: { label: "Confirmed", blurb: "Confirmed! It's queued for the kitchen." },
  preparing: { label: "Cooking", blurb: "Your food is on the pan right now. 🔥" },
  ready: { label: "Ready", blurb: "Ready for pickup / out for delivery." },
  completed: { label: "Done", blurb: "Enjoy! Salamat sa order. 🧡" },
};

const peso = (n: number) => "₱" + Number(n).toFixed(2);

function StatusRail({ status }: { status: string }) {
  const current = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const done = i <= current;
        const active = i === current;
        return (
          <div key={step} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i === 0 ? "bg-transparent" : done ? "bg-jade-600" : "bg-ink-950/12"
                }`}
              />
              <motion.span
                animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                transition={active ? { repeat: Infinity, duration: 2 } : undefined}
                className={`mx-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors ${
                  done ? "bg-jade-600" : "bg-ink-950/12"
                }`}
              >
                {done && <span className="h-1.5 w-1.5 rounded-full bg-cream-50" />}
              </motion.span>
              <span
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i === STEPS.length - 1
                    ? "bg-transparent"
                    : i < current
                      ? "bg-jade-600"
                      : "bg-ink-950/12"
                }`}
              />
            </div>
            <span
              className={`text-center text-[10px] font-bold uppercase tracking-wide sm:text-[11px] ${
                done ? "text-ink-950" : "text-ink-800/40"
              }`}
            >
              {STEP_COPY[step].label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({ order }: { order: TrackedOrder }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [qtys, setQtys] = useState<Record<number, number>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, l.qty]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [reference, setReference] = useState(order.payment_reference ?? "");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function handleSubmitPayment() {
    setPayBusy(true);
    setPayError(null);
    const fd = new FormData();
    fd.set("orderId", order.id);
    fd.set("reference", reference);
    if (receipt) fd.set("receipt", receipt);
    try {
      const res = await submitPayment(fd);
      if (res.error) return setPayError(res.error);
      setPayOpen(false);
      setReceipt(null);
      router.refresh();
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Could not send that payment detail.");
    } finally {
      setPayBusy(false);
    }
  }

  const cancelled = order.status === "cancelled";
  const editable = order.status === "pending";
  const balanceDue = Math.max(
    0,
    order.revenue + Number(order.delivery_fee) - order.downpayment_amount
  );
  const draftTotal = order.lines.reduce(
    (s, l) => s + (qtys[l.id] ?? l.qty) * Number(l.price_at_sale),
    0
  );

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await cancelMyOrder(order.id, "Cancelled from my orders page");
      if (res.error) return setError(res.error);
      setConfirmCancel(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel that order.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    setBusy(true);
    setError(null);
    try {
      const res = await updateMyOrder(
        order.id,
        order.lines.map((l) => ({ lineId: l.id, qty: qtys[l.id] ?? l.qty }))
      );
      if (res.error) return setError(res.error);
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that order.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`overflow-hidden rounded-3xl ring-1 transition-opacity ${
        cancelled ? "bg-cream-100/60 ring-ink-950/10" : "bg-cream-100 ring-ink-950/10"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/10 px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-ink-950">
            {formatDateTime(order.created_at)}
          </p>
          <p className="text-xs capitalize text-ink-800/60">
            {order.fulfillment} · #{order.id.slice(0, 8)}
          </p>
        </div>

        {cancelled ? (
          <span className="rounded-full bg-ink-800 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cream-100">
            Cancelled
          </span>
        ) : (
          order.eta_minutes != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400 px-3 py-1.5 text-xs font-bold text-ink-950">
              <ClockIcon className="h-3.5 w-3.5" />
              Ready in ~{order.eta_minutes} min
            </span>
          )
        )}
      </div>

      {!cancelled && (
        <div className="px-6 py-5">
          <StatusRail status={order.status} />
          <p className="mt-4 text-center text-sm font-semibold text-ink-800">
            {STEP_COPY[order.status]?.blurb ?? ""}
          </p>
        </div>
      )}

      {cancelled && order.cancelled_reason && (
        <p className="px-6 py-4 text-sm text-ink-800/70">{order.cancelled_reason}</p>
      )}

      <ul className="flex flex-col gap-2 border-t border-ink-950/10 px-6 py-4 text-sm">
        {order.lines.map((l) => {
          const qty = qtys[l.id] ?? l.qty;
          return (
            <li key={l.id} className="flex items-center justify-between gap-4">
              <span className={`text-ink-800 ${editing && qty === 0 ? "line-through opacity-50" : ""}`}>
                {l.name}
              </span>

              {editing ? (
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Fewer ${l.name}`}
                    onClick={() => setQtys((q) => ({ ...q, [l.id]: Math.max(0, qty - 1) }))}
                    className="grid h-7 w-7 place-items-center rounded-full bg-ink-950/10 font-bold text-ink-950 hover:bg-ink-950/20"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold text-ink-950">{qty}</span>
                  <button
                    type="button"
                    aria-label={`More ${l.name}`}
                    onClick={() => setQtys((q) => ({ ...q, [l.id]: Math.min(99, qty + 1) }))}
                    className="grid h-7 w-7 place-items-center rounded-full bg-ink-950/10 font-bold text-ink-950 hover:bg-ink-950/20"
                  >
                    +
                  </button>
                </span>
              ) : (
                <span className="shrink-0 font-semibold text-ink-950">
                  {l.qty} × {peso(l.price_at_sale)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {order.delivery_address && (
        <p className="border-t border-ink-950/10 px-6 py-3 text-sm text-ink-800/70">
          🛵 Delivering to {order.delivery_address}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-ink-950/10 px-6 py-4">
        {Number(order.delivery_fee) > 0 && (
          <>
            <div className="flex justify-between text-sm text-ink-800/70">
              <span>Food</span>
              <span>{peso(editing ? draftTotal : order.revenue)}</span>
            </div>
            <div className="flex justify-between text-sm text-ink-800/70">
              <span>Delivery</span>
              <span>{peso(order.delivery_fee)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-ink-950">Total</span>
          <span className="font-display text-lg font-black text-brand-600">
            {peso((editing ? draftTotal : order.revenue) + Number(order.delivery_fee))}
          </span>
        </div>
      </div>

      {/* Payment */}
      {!cancelled && (
        <div className="border-t border-ink-950/10 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-800/70">
              {METHOD_LABEL[order.payment_method] ?? "Cash"}
              {order.payment_reference && (
                <span className="ml-2 font-mono text-xs text-ink-800/50">
                  {order.payment_reference}
                </span>
              )}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                STATUS_LABEL[order.payment_status]?.tone === "good"
                  ? "bg-jade-700 text-cream-50"
                  : STATUS_LABEL[order.payment_status]?.tone === "wait"
                    ? "bg-gold-400 text-ink-950"
                    : STATUS_LABEL[order.payment_status]?.tone === "part"
                      ? "bg-chili-600 text-cream-50"
                      : "bg-ink-950/10 text-ink-800"
              }`}
            >
              {STATUS_LABEL[order.payment_status]?.customer ?? order.payment_status}
            </span>
          </div>

          {/* A down payment has three states that must never look alike:
              sent-but-unchecked, confirmed by the shop, and settled. Amounts
              are derived from the current total, so an edited order never
              leaves a stale figure on screen. */}
          {order.payment_plan === "downpayment" && (
            <>
              {order.payment_status === "submitted" && (
                <p className="mt-2 rounded-xl bg-gold-50 px-4 py-2.5 text-xs font-semibold text-ink-950 ring-1 ring-gold-400/50">
                  ⏳ You sent {peso(order.downpayment_amount)} — waiting for the
                  shop to confirm it.
                </p>
              )}

              {order.payment_status === "partial" && (
                <div className="mt-2 rounded-xl bg-jade-50 px-4 py-2.5 text-xs ring-1 ring-jade-600/40">
                  <p className="font-bold text-jade-700">
                    ✓ Down payment of {peso(order.downpayment_amount)} confirmed
                    by the shop
                    {order.downpayment_confirmed_at && (
                      <span className="font-normal text-ink-800/60">
                        {" "}
                        ·{" "}
                        {formatDateTime(order.downpayment_confirmed_at)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-semibold text-ink-950">
                    {peso(balanceDue)} still to pay in cash on handover.
                  </p>
                </div>
              )}

              {order.payment_status === "paid" && (
                <p className="mt-2 rounded-xl bg-jade-50 px-4 py-2.5 text-xs font-bold text-jade-700 ring-1 ring-jade-600/40">
                  ✓ Fully paid — {peso(order.downpayment_amount)} down payment +{" "}
                  {peso(balanceDue)} balance.
                </p>
              )}

              {order.payment_status === "unpaid" && (
                <p className="mt-2 rounded-xl bg-cream-50 px-4 py-2.5 text-xs font-semibold text-ink-800 ring-1 ring-ink-950/10">
                  {peso(order.downpayment_amount)} down payment ·{" "}
                  {peso(balanceDue)} on handover.
                </p>
              )}
            </>
          )}

          {/* Only correctable while the shop hasn't confirmed the money.
              Once it's 'partial' or 'paid' the reference is the shop's
              record — re-submitting would knock a confirmed payment back to
              "needs checking", which the database also refuses. */}
          {order.payment_method === "gcash" &&
            !["partial", "paid"].includes(order.payment_status) && (
            <div className="mt-3">
              {payOpen ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="GCash reference number"
                    className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm outline-none focus:border-brand-600"
                  />
                  <label className="text-xs font-semibold text-ink-800/70">
                    Receipt screenshot (optional)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-xs"
                    />
                  </label>
                  {payError && (
                    <p className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                      {payError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitPayment}
                      disabled={payBusy}
                      className="rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-cream-50 disabled:opacity-60"
                    >
                      {payBusy ? "Sending…" : "Send to the shop"}
                    </button>
                    <button
                      onClick={() => {
                        setPayOpen(false);
                        setPayError(null);
                      }}
                      className="rounded-full px-4 py-2 text-xs font-bold text-ink-800 hover:text-brand-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setPayOpen(true)}
                  className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
                >
                  {order.payment_reference ? "Update payment details" : "Add payment details"}
                </button>
                )}
              </div>
            )}
        </div>
      )}

      {order.status === "completed" && order.reviewable.length > 0 && (
        <OrderReviewPanel items={order.reviewable} />
      )}

      {error && (
        <p className="mx-6 mb-4 rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      {editable && (
        <div className="flex flex-wrap gap-2 border-t border-ink-950/10 px-6 py-4">
          {editing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={busy}
                className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setQtys(Object.fromEntries(order.lines.map((l) => [l.id, l.qty])));
                  setError(null);
                }}
                className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
              >
                Cancel edit
              </button>
            </>
          ) : confirmCancel ? (
            <>
              <span className="w-full text-sm font-semibold text-ink-800">
                Cancel this order for good?
              </span>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 disabled:opacity-60"
              >
                {busy ? "Cancelling…" : "Yes, cancel it"}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
              >
                Keep it
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded-full bg-ink-950 px-5 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600"
              >
                Edit order
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                className="rounded-full px-5 py-2 text-sm font-bold text-ink-800 hover:text-brand-600"
              >
                Cancel order
              </button>
              <span className="self-center text-xs text-ink-800/55">
                You can change this until the shop confirms it.
              </span>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function OrderTracker({
  orders,
  customerId,
}: {
  orders: TrackedOrder[];
  customerId: string;
}) {
  const { connected } = useOrderRealtime({ customerId });

  const active = orders.filter((o) => !["completed", "cancelled"].includes(o.status));
  const past = orders.filter((o) => ["completed", "cancelled"].includes(o.status));

  return (
    <div className="flex flex-col gap-10">
      {active.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-black text-ink-950">
              Happening now
            </h2>
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                connected ? "bg-jade-700 text-cream-50" : "bg-ink-950/10 text-ink-800"
              }`}
            >
              <LiveDotIcon className={`h-2 w-2 ${connected ? "animate-pulse" : "opacity-50"}`} />
              {connected ? "Live" : "Connecting…"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-800/60">
            This updates by itself — no need to refresh.
          </p>
          <ul className="mt-5 flex flex-col gap-5">
            <AnimatePresence initial={false}>
              {active.map((o) => (
                <motion.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <OrderCard order={o} />
                </motion.div>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-black text-ink-950">History</h2>
          <ul className="mt-5 flex flex-col gap-5">
            {past.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
