import { getPaymentSettings } from "@/lib/payments-server";
import { PaymentSettingsForm } from "@/components/payment-settings-form";

export default async function AdminPaymentsPage() {
  const settings = await getPaymentSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Payments</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Choose how customers can pay. GCash here is manual — they send the
          money in the GCash app and give you the reference number, and you
          confirm it against your own GCash records on the Orders page. No
          merchant account and no transaction fees.
        </p>
      </div>

      <PaymentSettingsForm initial={settings} />
    </div>
  );
}
