import { can, getViewer } from "@/lib/auth";
import { loadMoney } from "@/lib/money-server";
import { MoneyView } from "@/components/money-view";
import { hqTitle } from "@/lib/hq-theme";

export const dynamic = "force-dynamic";

export default async function AdminMoneyPage() {
  const viewer = await getViewer();
  if (!can(viewer, "business")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          What the shop pays out, what it&apos;s owed, and how much of your
          capital has come back is yours alone.
        </p>
      </div>
    );
  }

  const money = await loadMoney();
  return <MoneyView money={money} />;
}
