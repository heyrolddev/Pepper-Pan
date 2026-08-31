import { createClient } from "@/lib/supabase/server";
import { getPaymentSettings } from "@/lib/payments-server";
import { PaymentSettingsForm } from "@/components/payment-settings-form";
import { PaymentLedger, type LedgerRow } from "@/components/payment-ledger";
import { PaymentsTabs } from "@/components/payments-tabs";
import { moneyState } from "@/lib/payments";

const COLUMNS =
  "id, created_at, status, contact_name, contact_phone, revenue, delivery_fee, payment_method, payment_status, payment_plan, payment_reference, payment_receipt_url, downpayment_amount, downpayment_confirmed_at";

async function getLedger(): Promise<{ rows: LedgerRow[]; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(300);

    // Saying "no payments" when the query failed is the same lie the Orders
    // page used to tell, and here it would read as "nobody owes you anything".
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as unknown as LedgerRow[], error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function AdminPaymentsPage() {
  const [settings, { rows, error }] = await Promise.all([
    getPaymentSettings(),
    getLedger(),
  ]);

  const waiting = rows.filter(
    (r) => r.payment_status === "submitted" && r.status !== "cancelled"
  ).length;

  const owed = rows.reduce((sum, r) => sum + moneyState(r).balance, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Payments</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          GCash here is manual — customers send the money in the GCash app and
          give you the reference number, and you confirm it against your own
          records. No merchant account and no transaction fees.
        </p>
        {owed > 0 && (
          <p className="mt-3 inline-block rounded-full bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 ring-1 ring-brand-600/25">
            ₱{owed.toLocaleString("en-PH", { maximumFractionDigits: 0 })} still
            owed across {rows.filter((r) => moneyState(r).balance > 0).length}{" "}
            order
            {rows.filter((r) => moneyState(r).balance > 0).length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-3xl bg-brand-50 p-6 ring-2 ring-brand-600/40">
          <p className="font-display text-lg font-black text-brand-700">
            Couldn&apos;t load the payment list
          </p>
          <p className="mt-2 text-sm text-ink-800/70">
            This is a database error, not an empty ledger — nobody&apos;s
            payment record has been lost. Your settings below still work.
          </p>
          <p className="mt-3 rounded-xl bg-cream-50 px-4 py-3 font-mono text-xs text-ink-800/70">
            {error}
          </p>
        </div>
      )}

      <PaymentsTabs
        waiting={waiting}
        ledger={<PaymentLedger rows={rows} />}
        settings={<PaymentSettingsForm initial={settings} />}
      />
    </div>
  );
}
