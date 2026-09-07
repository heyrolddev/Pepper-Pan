import { AdminOrderList } from "@/components/admin-order-list";
import { LiveOrdersBanner } from "@/components/live-orders-banner";
import { BOARD_LIMIT, loadBoardOrders } from "@/lib/orders-admin-server";
import { hqTitle } from "@/lib/hq-theme";

// Every figure here is live; nothing about an order board should be cached.
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { orders, total, error } = await loadBoardOrders();

  // A failed query used to render as "no orders yet", which is the worst
  // possible lie for this screen to tell.
  if (error !== null) {
    return (
      <div className="rounded-3xl bg-brand-50 p-8 ring-1 ring-brand-600/25">
        <h2 className={hqTitle}>Couldn&apos;t load your orders</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-800/75">
          This is a database error, not an empty shop — your orders are safe. If
          the message below mentions a column that doesn&apos;t exist, a
          migration hasn&apos;t been run yet. Run any missing files from{" "}
          <code className="rounded bg-cream-100 px-1">supabase/migrations/</code>{" "}
          in the Supabase SQL Editor, in number order.
        </p>
        <p className="mt-4 rounded-2xl bg-cream-50 px-4 py-3 font-mono text-xs text-brand-700">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <LiveOrdersBanner />
      <AdminOrderList orders={orders} loaded={BOARD_LIMIT} total={total} />
    </div>
  );
}
