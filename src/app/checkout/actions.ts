"use server";

import { createClient } from "@/lib/supabase/server";

type PlaceOrderInput = {
  items: { mealId: string; qty: number }[];
  contactName: string;
  contactPhone: string;
  fulfillment: "pickup" | "delivery";
  notes: string;
};

export async function placeOrder(
  input: PlaceOrderInput
): Promise<{ error: string | null }> {
  if (input.items.length === 0) {
    return { error: "Your cart is empty." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You need to sign in first." };
  }

  // Re-fetch current prices server-side rather than trusting client-supplied
  // totals, since the cart lives in the browser (localStorage).
  const mealIds = input.items.map((i) => i.mealId);
  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, price")
    .in("id", mealIds);
  if (mealsError || !meals) {
    return { error: "Could not verify menu prices." };
  }

  const priceById = new Map(meals.map((m) => [m.id, Number(m.price)]));
  for (const item of input.items) {
    if (!priceById.has(item.mealId)) {
      return { error: "One of the items in your cart is no longer available." };
    }
  }

  const revenue = input.items.reduce(
    (sum, i) => sum + priceById.get(i.mealId)! * i.qty,
    0
  );

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      fulfillment: input.fulfillment,
      payment_method: "cod",
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      notes: input.notes || null,
      revenue,
    })
    .select("id")
    .single();
  if (orderError || !order) {
    return { error: orderError?.message ?? "Could not place order." };
  }

  const { error: linesError } = await supabase.from("order_lines").insert(
    input.items.map((i) => ({
      order_id: order.id,
      meal_id: i.mealId,
      qty: i.qty,
      price_at_sale: priceById.get(i.mealId)!,
    }))
  );
  if (linesError) {
    return { error: linesError.message };
  }

  return { error: null };
}
