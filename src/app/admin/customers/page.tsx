import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import type { AdminCustomer } from "@/components/customer-row";
import { AdminCustomerList } from "@/components/admin-customer-list";
import { hqTitle } from "@/lib/hq-theme";

type StatRow = {
  customer_id: string;
  order_count: number;
  completed_count: number;
  total_spent: number;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  is_verified: boolean;
  is_blocked: boolean;
  created_at: string;
};

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const viewer = await getViewer();
  const canManage = can(viewer, "business");

  // One row per customer, grouped by the database.
  //
  // This used to fetch EVERY order the shop had ever taken — no date filter,
  // no limit — and add them up here. That is a few hundred rows in the first
  // months and tens of thousands in a couple of years, re-read and re-summed
  // on every visit to this screen. `customer_order_stats` (migration 0041)
  // does the grouping in Postgres, where it belongs.
  const [{ data: profileRows }, { data: statRows, error: statsError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, address, is_verified, is_blocked, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false }),
    supabase
      .from("customer_order_stats")
      .select("customer_id, order_count, completed_count, total_spent"),
  ]);

  const stats = new Map(
    ((statRows ?? []) as StatRow[]).map((s) => [s.customer_id, s])
  );

  const customers: AdminCustomer[] = ((profileRows ?? []) as ProfileRow[]).map((p) => {
    const s = stats.get(p.id);
    return {
      ...p,
      orderCount: s?.order_count ?? 0,
      completedCount: s?.completed_count ?? 0,
      totalSpent: Number(s?.total_spent ?? 0),
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className={hqTitle}>
          Customers ({customers.length})
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Verify the regulars you trust, and block accounts that place fake
          orders — blocked accounts are stopped from checking out, both in the
          app and at the database level.
        </p>
        {statsError && (
          <p className="mt-3 rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
            Order counts and totals aren&apos;t showing — run migration 0041 in
            the Supabase SQL Editor. Everything else on this page is correct.
          </p>
        )}
        {!canManage && (
          <p className="mt-3 rounded-2xl bg-gold-400 px-5 py-3 text-sm font-semibold text-ink-950">
            Only the shop owner can verify or block customers.
          </p>
        )}
      </div>

      {customers.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
          No customer accounts yet.
        </p>
      ) : (
        <AdminCustomerList customers={customers} canManage={canManage} />
      )}
    </div>
  );
}
