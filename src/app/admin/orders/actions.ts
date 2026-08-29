"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

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
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) return { error: error.message };

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  revalidatePath("/orders");
  return { error: null };
}
