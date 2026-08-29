"use client";

import { useCallback } from "react";
import { AdminSearch } from "@/components/admin-search";
import { CustomerRow, type AdminCustomer } from "@/components/customer-row";

export function AdminCustomerList({
  customers,
  canManage,
}: {
  customers: AdminCustomer[];
  canManage: boolean;
}) {
  const searchText = useCallback(
    (c: AdminCustomer) =>
      [
        c.full_name,
        c.phone,
        c.address,
        c.is_verified ? "verified" : "unverified",
        c.is_blocked ? "blocked" : "",
      ]
        .filter(Boolean)
        .join(" "),
    []
  );

  return (
    <AdminSearch
      rows={customers}
      searchText={searchText}
      noun="customer"
      placeholder="Search name, number, address, verified…"
    >
      {(filtered, query) => {
        const blocked = filtered.filter((c) => c.is_blocked);
        const active = filtered.filter((c) => !c.is_blocked);

        if (filtered.length === 0) {
          return (
            <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
              No customers match &ldquo;{query}&rdquo;.
            </p>
          );
        }

        return (
          <div className="flex flex-col gap-8">
            {active.length > 0 && (
              <ul className="flex flex-col gap-4">
                {active.map((c) => (
                  <CustomerRow key={c.id} customer={c} canManage={canManage} />
                ))}
              </ul>
            )}

            {blocked.length > 0 && (
              <section>
                <h3 className="font-display text-xl font-black text-ink-950">
                  Blocked ({blocked.length})
                </h3>
                <ul className="mt-4 flex flex-col gap-4">
                  {blocked.map((c) => (
                    <CustomerRow key={c.id} customer={c} canManage={canManage} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </AdminSearch>
  );
}
