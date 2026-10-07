import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { listBranches } from "@/lib/branches-server";
import { visibleBranches } from "@/lib/branches";
import { summariseBranch, type BranchSale, type BranchSummary } from "@/lib/branch-summary";
import { BranchesView } from "@/components/branches-view";
import { shopDay, shopToday } from "@/lib/format-date";

// Takings move with every sale. A cached comparison is last hour's answer.
export const dynamic = "force-dynamic";

/** A week, and the week before it for the comparison. */
const WINDOW_DAYS = 7;

export default async function AdminBranchesPage() {
  const viewer = await getViewer();
  // Takings, so the same capability that guards the dashboard and analytics.
  if (!can(viewer, "business")) return null;

  const to = shopToday();
  const from = shopDay(-(WINDOW_DAYS - 1));
  const prevFrom = shopDay(-(WINDOW_DAYS * 2 - 1));

  const branches = visibleBranches(await listBranches(), {
    branchId: viewer?.profile?.branch_id ?? null,
  });

  /* Two windows in one read, and deliberately NOT scoped by branch: this is
     the one page whose job is to show every branch at once. Anyone without
     `business` never reaches it, and a pinned viewer only ever sees their own
     branch in the list above, so the rows they get back are their own. */
  const { data } = await createAdminClient()
    .from("orders")
    .select("branch_id, date, revenue, status, voided_at")
    .gte("date", prevFrom)
    .lte("date", to);

  const sales: BranchSale[] = ((data ?? []) as Record<string, unknown>[]).map((o) => ({
    branchId: String(o.branch_id ?? "main"),
    date: String(o.date),
    revenue: Number(o.revenue) || 0,
    // A void is `status = 'cancelled'` underneath, so one test covers both.
    cancelled: o.status === "cancelled",
  }));

  const summaries: Record<string, BranchSummary> = {};
  for (const b of branches) {
    summaries[b.id] = summariseBranch(sales, b.id, from, to, prevFrom);
  }

  return (
    <BranchesView
      branches={branches}
      summaries={summaries}
      windowLabel={`the last ${WINDOW_DAYS} days`}
    />
  );
}
