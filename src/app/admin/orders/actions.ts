"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders";

export async function setOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<{ error: string | null }> {
  if (!ORDER_STATUSES.includes(status)) {
    return { error: "Unknown status." };
  }

  const viewer = await getViewer();
  if (!isStaff(viewer)) return { error: "Not allowed." };

  const supabase = await createClient();
  // `.select()` matters: without it PostgREST reports success even when a
  // row-level security policy silently matched nothing.
  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "The database didn't accept that change. Re-run the latest migration in the Supabase SQL Editor.",
    };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/orders");
  return { error: null };
}
