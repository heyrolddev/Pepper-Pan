import { NotAllowed } from "@/components/not-allowed";
import { can, getViewer } from "@/lib/auth";
import { getDeliverySettings } from "@/lib/delivery-server";
import { DeliverySettingsForm } from "@/components/delivery-settings-form";

export default async function AdminDeliveryPage() {
  const viewer = await getViewer();
  // Hidden from the sidebar too, but hiding a link is not a permission:
  // a bookmark reaches this page all the same.
  if (!can(viewer, "settings")) {
    return <NotAllowed>Delivery fees and the area covered are the owner&apos;s to set.</NotAllowed>;
  }

  const settings = await getDeliverySettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Delivery</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Set where you deliver from and what it costs. Customers see the fee
          before they order, and it&apos;s recalculated on the server when they
          check out — so the figure charged is always yours, not the
          browser&apos;s.
        </p>
      </div>

      <DeliverySettingsForm initial={settings} />
    </div>
  );
}
