"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOrderStatus } from "@/app/admin/orders/actions";
import { STATUS_LABELS, statusesFor, type OrderStatus } from "@/lib/orders";
import { moneyLine, type MoneyState } from "@/lib/payments";

export function OrderStatusPicker({
  orderId,
  status,
  fulfillment,
  money,
}: {
  orderId: string;
  status: OrderStatus;
  /** Pickup orders never go "on the way", so that step isn't offered. */
  fulfillment: string;
  /** What's been paid, so completing an unpaid order can ask first. */
  money?: MoneyState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);

  /**
   * Completing an order that still owes money is the one status change worth
   * interrupting. It's the moment the food leaves the shop's hands, and after
   * it the order drops off the open queue — so an unpaid balance stops being
   * something anyone is looking at. Asking here costs a tap; not asking costs
   * the price of the meal.
   *
   * It asks rather than refuses: a customer handing over cash at the counter
   * is normal, and the shop is right to complete that order. It just has to be
   * a decision instead of an accident.
   */
  function attempt(next: OrderStatus) {
    if (next === "completed" && money && money.balance > 0) {
      setConfirming(next);
      return;
    }
    change(next);
  }

  function change(next: OrderStatus) {
    setConfirming(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await setOrderStatus(orderId, next);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update the status.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => attempt(e.target.value as OrderStatus)}
        className="rounded-full border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm font-bold text-ink-950 outline-none transition-colors focus:border-brand-600 disabled:opacity-60"
      >
        {statusesFor(fulfillment).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs font-semibold text-brand-700">{error}</span>}

      {confirming && money && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] grid place-items-center p-4"
        >
          <button
            aria-label="Cancel"
            onClick={() => setConfirming(null)}
            className="absolute inset-0 bg-ink-950/70"
          />
          <div className="relative w-full max-w-sm rounded-3xl bg-cream-50 p-6 text-left shadow-2xl ring-1 ring-ink-950/10">
            <p className="font-display text-2xl font-black text-ink-950">
              This one still owes money
            </p>
            <p className="mt-3 rounded-2xl bg-brand-50 px-4 py-3 font-bold text-brand-700">
              {moneyLine(money)}
            </p>
            <p className="mt-3 text-sm text-ink-800/70">
              Completing it takes the order off your open list. If they paid
              cash at the counter, mark it paid first so your figures are
              right.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-full px-5 py-3 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950"
              >
                Go back
              </button>
              <button
                onClick={() => change(confirming)}
                autoFocus
                className="rounded-full bg-brand-600 px-6 py-3 text-sm font-black text-cream-50 transition-transform hover:scale-[1.02]"
              >
                Complete anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
