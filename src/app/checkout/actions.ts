"use server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_DELIVERY, quoteDelivery, type DeliverySettings } from "@/lib/delivery";
import { DEFAULT_PAYMENTS, type PaymentMethod, type PaymentSettings } from "@/lib/payments";

type PlaceOrderInput = {
  items: { mealId: string; qty: number }[];
  contactName: string;
  contactPhone: string;
  fulfillment: "pickup" | "delivery";
  notes: string;
  deliveryAddress?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
};

/** A phone we could actually ring: PH mobile/landline digits, lenient on format. */
function isUsablePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export async function placeOrder(
  input: PlaceOrderInput
): Promise<{ error: string | null }> {
  if (input.items.length === 0) {
    return { error: "Your cart is empty." };
  }
  if (!input.contactName.trim()) {
    return { error: "Please enter your name." };
  }
  if (!isUsablePhone(input.contactPhone)) {
    return { error: "Please enter a working mobile number so we can reach you." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You need to sign in first." };
  }

  // RLS also rejects orders from blocked accounts; checking here just turns
  // that into a message the customer can actually understand.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_blocked")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.is_blocked) {
    return {
      error:
        "Ordering is paused on this account. Please contact us at +63 947 353 3060.",
    };
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

  const subtotal = input.items.reduce(
    (sum, i) => sum + priceById.get(i.mealId)! * i.qty,
    0
  );

  // --- Delivery ----------------------------------------------------------
  // The fee is recomputed here from the shop's own settings. Whatever the
  // browser thought the fee was is discarded.
  let deliveryFee = 0;
  let distanceKm: number | null = null;
  let address: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  if (input.fulfillment === "delivery") {
    address = (input.deliveryAddress ?? "").trim();
    if (address.length < 10) {
      return {
        error:
          "Please give a complete delivery address — house/street, barangay and a landmark.",
      };
    }

    lat = typeof input.deliveryLat === "number" ? input.deliveryLat : null;
    lng = typeof input.deliveryLng === "number" ? input.deliveryLng : null;
    if (
      lat === null ||
      lng === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return { error: "Please drop the pin on the map so the rider can find you." };
    }

    const { data: settingsRow } = await supabase
      .from("delivery_settings")
      .select(
        "is_enabled, shop_lat, shop_lng, base_fee, base_km, per_km_fee, min_fee, max_km, free_over, notice"
      )
      .eq("id", 1)
      .maybeSingle();

    const settings = (settingsRow as DeliverySettings) ?? DEFAULT_DELIVERY;
    const quote = quoteDelivery(settings, lat, lng, subtotal);
    if (!quote.ok) return { error: quote.reason };

    deliveryFee = quote.fee;
    distanceKm = quote.km;
  }

  // --- Payment ------------------------------------------------------------
  // Which methods exist is the shop's decision, so it's re-checked here: a
  // client can't pick a method the shop has switched off.
  const { data: paymentRow } = await supabase
    .from("payment_settings")
    .select("cod_enabled, gcash_enabled, gcash_name, gcash_number, gcash_qr_url, instructions")
    .eq("id", 1)
    .maybeSingle();
  const paymentSettings = (paymentRow as PaymentSettings) ?? DEFAULT_PAYMENTS;

  const method: PaymentMethod = input.paymentMethod === "gcash" ? "gcash" : "cod";
  if (method === "gcash" && !paymentSettings.gcash_enabled) {
    return { error: "GCash isn't available right now — please choose cash." };
  }
  if (method === "cod" && !paymentSettings.cod_enabled) {
    return { error: "Cash isn't available right now — please pay with GCash." };
  }

  const reference = (input.paymentReference ?? "").trim();
  if (method === "gcash" && reference.length < 4) {
    return { error: "Enter the GCash reference number from your receipt." };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      fulfillment: input.fulfillment,
      payment_method: method,
      // A GCash order arrives claiming to be paid; it stays "submitted" until
      // staff match the reference against their own GCash records.
      payment_status: method === "gcash" ? "submitted" : "unpaid",
      payment_reference: method === "gcash" ? reference : null,
      contact_name: input.contactName.trim(),
      contact_phone: input.contactPhone.trim(),
      notes: input.notes.trim() || null,
      // `revenue` stays the food subtotal; the fee is its own column.
      revenue: subtotal,
      delivery_address: address,
      delivery_lat: lat,
      delivery_lng: lng,
      delivery_distance_km: distanceKm,
      delivery_fee: deliveryFee,
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
