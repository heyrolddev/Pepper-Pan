import { NotAllowed } from "@/components/not-allowed";
import { ActivityLog } from "@/components/activity-log";
import { ACTIVITY_CATEGORIES, loadActivity } from "@/lib/activity-server";
import { can, getViewer } from "@/lib/auth";
import { hqTitle } from "@/lib/hq-theme";

export const dynamic = "force-dynamic";

export default async function AdminHistoryPage() {
  const viewer = await getViewer();
  // The whole shop in one list: what was sold, what it cost, who was on, what
  // was repriced. That is the business's diary, so it stays with the people
  // who answer for the business.
  if (!can(viewer, "business")) {
    return <NotAllowed>The shop&apos;s history is the owner&apos;s and the manager&apos;s.</NotAllowed>;
  }

  const { rows, error } = await loadActivity({ limit: 300 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>History</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Everything the shop has done, in the order it happened — a restock, a
          price change, a cancelled order, a shift clocking in, money moved.
          The newest three are here; open the rest when you&apos;re looking for
          something in particular.
        </p>
      </div>

      <ActivityLog
        rows={rows}
        categories={ACTIVITY_CATEGORIES}
        error={error}
      />
    </div>
  );
}
