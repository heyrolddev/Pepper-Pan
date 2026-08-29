"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomerFlags } from "@/app/admin/customers/actions";
import { formatDate } from "@/lib/format-date";

export type AdminCustomer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  created_at: string;
  orderCount: number;
  completedCount: number;
  totalSpent: number;
};

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CustomerRow({
  customer,
  canManage,
}: {
  customer: AdminCustomer;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(flags: { isVerified?: boolean; isBlocked?: boolean }) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setCustomerFlags(customer.id, flags);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update this customer.");
      }
    });
  }

  return (
    <li className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold text-ink-950">
              {customer.full_name || "No name given"}
            </span>
            {customer.is_verified && (
              <span className="rounded-full bg-jade-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-50">
                ✓ Verified
              </span>
            )}
            {customer.is_blocked && (
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cream-50">
                ⚠ Blocked
              </span>
            )}
            {!customer.full_name || !customer.phone ? (
              <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-950">
                Incomplete details
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-ink-800/70">
            {customer.phone || "no number"} · joined{" "}
            {formatDate(customer.created_at)}
          </p>
          {customer.address && (
            <p className="mt-0.5 text-sm text-ink-800/55">{customer.address}</p>
          )}
          <p className="mt-1 text-xs font-semibold text-ink-800/70">
            {customer.orderCount} order{customer.orderCount === 1 ? "" : "s"} ·{" "}
            {customer.completedCount} completed · {peso(customer.totalSpent)} spent
          </p>
        </div>

        {canManage && (
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => update({ isVerified: !customer.is_verified })}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                  customer.is_verified
                    ? "bg-ink-950/10 text-ink-800"
                    : "bg-jade-600 text-cream-50"
                }`}
              >
                {customer.is_verified ? "Un-verify" : "Verify"}
              </button>
              <button
                disabled={pending}
                onClick={() => update({ isBlocked: !customer.is_blocked })}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                  customer.is_blocked
                    ? "bg-ink-950/10 text-ink-800"
                    : "bg-brand-600 text-cream-50"
                }`}
              >
                {customer.is_blocked ? "Unblock" : "Block"}
              </button>
            </div>
            {error && (
              <span className="text-xs font-semibold text-brand-700">{error}</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
