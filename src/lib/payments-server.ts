import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAYMENTS, type PaymentSettings } from "@/lib/payments";

const COLUMNS =
  "cod_enabled, gcash_enabled, gcash_name, gcash_number, gcash_qr_url, instructions";

/**
 * Reads the shop's payment settings, falling back to cash-only so checkout
 * still works on a database where migration 0006 hasn't been run yet.
 */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("payment_settings")
      .select(COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (!data) return DEFAULT_PAYMENTS;

    const row = data as Record<string, unknown>;
    return {
      cod_enabled: Boolean(row.cod_enabled),
      gcash_enabled: Boolean(row.gcash_enabled),
      gcash_name: (row.gcash_name as string | null) ?? null,
      gcash_number: (row.gcash_number as string | null) ?? null,
      gcash_qr_url: (row.gcash_qr_url as string | null) ?? null,
      instructions: (row.instructions as string | null) ?? null,
    };
  } catch {
    return DEFAULT_PAYMENTS;
  }
}
