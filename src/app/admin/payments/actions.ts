"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";

const BLOCKED_MESSAGE =
  "The database didn't accept that change. Run migration 0006 in the Supabase SQL Editor, then try again.";

function revalidatePayments() {
  revalidatePath("/admin/payments");
  revalidatePath("/checkout");
  revalidatePath("/orders");
}

export async function savePaymentSettings(input: {
  codEnabled: boolean;
  gcashEnabled: boolean;
  gcashName: string;
  gcashNumber: string;
  instructions: string;
  downpaymentEnabled: boolean;
  downpaymentPercent: number;
}): Promise<{ error: string | null }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  if (!input.codEnabled && !input.gcashEnabled) {
    return { error: "Keep at least one payment method switched on." };
  }
  if (input.gcashEnabled && !input.gcashNumber.trim()) {
    return { error: "Add the GCash number customers should send money to." };
  }
  if (input.gcashEnabled && !input.gcashName.trim()) {
    return {
      error: "Add the GCash account name, so customers know the payment reached you.",
    };
  }

  // The database also constrains this, but rejecting it here gives the owner
  // a sentence instead of a raw constraint error.
  if (
    input.downpaymentEnabled &&
    (!Number.isFinite(input.downpaymentPercent) ||
      input.downpaymentPercent < 1 ||
      input.downpaymentPercent > 99)
  ) {
    return { error: "The down payment must be between 1% and 99% of the total." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_settings")
    .update({
      cod_enabled: input.codEnabled,
      downpayment_enabled: input.downpaymentEnabled,
      downpayment_percent: input.downpaymentEnabled ? input.downpaymentPercent : 50,
      gcash_enabled: input.gcashEnabled,
      gcash_name: input.gcashName.trim() || null,
      gcash_number: input.gcashNumber.trim() || null,
      instructions: input.instructions.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidatePayments();
  return { error: null };
}

export async function uploadGcashQr(
  formData: FormData
): Promise<{ error: string | null; url?: string }> {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const checked = validateImage(formData.get("file"));
  if ("error" in checked) return { error: checked.error };

  const uploaded = await uploadImage(
    checked.file,
    `payments/gcash-qr-${Date.now()}.${extensionFor(checked.file.type)}`
  );
  if ("error" in uploaded) return { error: uploaded.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_settings")
    .update({ gcash_qr_url: uploaded.url })
    .eq("id", 1)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: BLOCKED_MESSAGE };

  revalidatePayments();
  return { error: null, url: uploaded.url };
}
