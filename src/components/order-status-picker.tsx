"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ORDER_STATUSES, setOrderStatus, type OrderStatus } from "@/app/admin/orders/actions";

export function OrderStatusPicker({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: OrderStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setOrderStatus(orderId, next);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as OrderStatus)}
        className="rounded-full border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm font-bold capitalize text-ink-950 outline-none transition-colors focus:border-brand-600 disabled:opacity-60"
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span className="text-xs font-semibold text-brand-700">{error}</span>}
    </div>
  );
}
