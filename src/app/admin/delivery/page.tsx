import { getDeliverySettings } from "@/lib/delivery-server";
import { DeliverySettingsForm } from "@/components/delivery-settings-form";

export default async function AdminDeliveryPage() {
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
