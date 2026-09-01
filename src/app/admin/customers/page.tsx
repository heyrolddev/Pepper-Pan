import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import type { AdminCustomer } from "@/components/customer-row";
import { AdminCustomerList } from "@/components/admin-customer-list";

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

  const [{ data: profileRows }, { data: orderRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, address, is_verified, is_blocked, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false }),
    supabase.from("orders").select("customer_id, status, revenue").not("customer_id", "is", null),
  ]);

  const stats = new Map<string, { orders: number; completed: number; spent: number }>();
  for (const o of (orderRows ?? []) as {
    customer_id: string;
    status: string;
    revenue: number;
  }[]) {
    const cur = stats.get(o.customer_id) ?? { orders: 0, completed: 0, spent: 0 };
    cur.orders += 1;
    if (o.status === "completed") {
      cur.completed += 1;
      cur.spent += Number(o.revenue || 0);
    }
    stats.set(o.customer_id, cur);
  }

  const customers: AdminCustomer[] = ((profileRows ?? []) as ProfileRow[]).map((p) => {
    const s = stats.get(p.id) ?? { orders: 0, completed: 0, spent: 0 };
    return {
      ...p,
      orderCount: s.orders,
      completedCount: s.completed,
      totalSpent: s.spent,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">
          Customers ({customers.length})
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Verify the regulars you trust, and block accounts that place fake
          orders — blocked accounts are stopped from checking out, both in the
          app and at the database level.
        </p>
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
