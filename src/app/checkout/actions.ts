"use server";

import { createClient } from "@/lib/supabase/server";
import { getSchedule } from "@/lib/hours-server";
import { canScheduleFor, parseManilaLocal } from "@/lib/hours";
import { extensionFor, uploadImage, validateImage } from "@/lib/storage";
import { DEFAULT_DELIVERY, quoteDelivery, type DeliverySettings } from "@/lib/delivery";
import {
  amountDueNow,
  DEFAULT_PAYMENTS,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentSettings,
} from "@/lib/payments";
import { notifyNewOrder } from "@/lib/notify";

type PlaceOrderInput = {
  // `name` is the browser's copy, used only to name a sold-out dish back to
  // the same customer. Prices and availability always come from the database.
  items: { mealId: string; qty: number; name?: string }[];
  /**
   * Manila wall-clock, as a `datetime-local` value ("2026-09-01T18:30").
   * Null means "as soon as you can".
   */
  scheduledFor?: string | null;
  contactName: string;
  contactPhone: string;
  fulfillment: "pickup" | "delivery";
  notes: string;
  deliveryAddress?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  paymentMethod?: PaymentMethod;
  paymentPlan?: PaymentPlan;
  paymentReference?: string;
  // Server Actions can carry a File directly, so the screenshot travels with
  // the rest of the order rather than needing a second round trip.
  paymentReceipt?: File | null;
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
    .select("id, name, price")
    .in("id", mealIds);
  if (mealsError || !meals) {
    return { error: "Could not verify menu prices." };
  }

  const priceById = new Map(meals.map((m) => [m.id, Number(m.price)]));
  // Name the dish. "One of the items in your cart" makes the customer open
  // every line to work out which — and a sold-out dish is annoying enough
  // without a guessing game on top.
  const soldOut = input.items
    .filter((item) => !priceById.has(item.mealId))
    .map((item) => item.name?.trim())
    .filter(Boolean) as string[];
  for (const item of input.items) {
    if (!priceById.has(item.mealId)) {
      return {
        error:
          soldOut.length > 0
            ? `${soldOut.join(" and ")} just sold out — please remove it from your cart and try again.`
            : "One of the items in your cart just sold out. Please review your cart and try again.",
      };
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
    .select(
      "cod_enabled, gcash_enabled, gcash_name, gcash_number, gcash_qr_url, instructions, downpayment_enabled, downpayment_percent"
    )
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
  const receiptFile =
    input.paymentReceipt instanceof File && input.paymentReceipt.size > 0
      ? input.paymentReceipt
      : null;

  // Either proof is accepted; the same rule is enforced again in the database.
  if (method === "gcash" && reference.length < 4 && !receiptFile) {
    return {
      error:
        "Add your GCash reference number or a screenshot of the receipt — either one is fine.",
    };
  }

  let receiptUrl: string | null = null;
  if (receiptFile) {
    const checked = validateImage(receiptFile);
    if ("error" in checked) return { error: checked.error };
    const uploaded = await uploadImage(
      checked.file,
      `receipts/${user.id}-${Date.now()}.${extensionFor(checked.file.type)}`
    );
    if ("error" in uploaded) return { error: uploaded.error };
    receiptUrl = uploaded.url;
  }

  // A part-payment is only allowed when the shop offers one, and the amount
  // is computed here from the shop's own percentage — the browser never gets
  // to say how little counts as a down payment.
  const wantsDownpayment = method === "gcash" && input.paymentPlan === "downpayment";
  if (wantsDownpayment && !paymentSettings.downpayment_enabled) {
    return { error: "Part payment isn't available right now — please pay in full." };
  }
  const plan: PaymentPlan = wantsDownpayment ? "downpayment" : "full";
  const orderTotal = subtotal + deliveryFee;
  const downpaymentAmount =
    plan === "downpayment"
      ? amountDueNow(orderTotal, "downpayment", Number(paymentSettings.downpayment_percent))
      : 0;

  // --- when the order is for ------------------------------------------------
  // Re-checked here rather than trusted: the browser decides what to show, the
  // server decides what the shop is committed to cooking.
  const schedule = await getSchedule();
  let scheduledAt: string | null = null;

  if (input.scheduledFor) {
    // Read as the shop's wall clock — the same conversion the picker uses,
    // so the browser and the server can never disagree about what 6pm meant.
    const when = parseManilaLocal(input.scheduledFor);
    const verdict = canScheduleFor(
      when,
      schedule.hours,
      schedule.closures,
      schedule.settings
    );
    if (!verdict.ok) return { error: verdict.reason };
    scheduledAt = when.toISOString();

    // Order-ahead has to be paid for. A same-day order the customer never
    // collects costs the shop one meal it can still sell to the next person
    // in the queue; a scheduled one costs ingredients bought and prep time
    // set aside for a slot nobody turns up to. Paying — in full or as a down
    // payment — is what makes the booking real.
    //
    // Checked on the server, where the money is: the form can hide the cash
    // option, but the form is not what decides.
    if (method !== "gcash") {
      return {
        error: paymentSettings.gcash_enabled
          ? "Ordering ahead has to be paid for — choose GCash to pay in full or leave a down payment."
          : "We can't take orders ahead just now. Please order when we're open.",
      };
    }
    if (!reference) {
      return {
        error: "Add your GCash reference number so we can confirm the booking.",
      };
    }
  } else if (schedule.configured && !schedule.state.isOpen) {
    return {
      error: schedule.settings.accepting_orders
        ? `${schedule.state.reason ?? "We're closed right now."} You can still order ahead — pick a time at checkout.`
        : (schedule.settings.paused_message?.trim() ??
          "We've paused orders for now — please check back a little later."),
    };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: user.id,
      scheduled_for: scheduledAt,
      fulfillment: input.fulfillment,
      payment_method: method,
      // A GCash order arrives claiming to be paid; it stays "submitted" until
      // staff match the reference against their own GCash records.
      payment_status: method === "gcash" ? "submitted" : "unpaid",
      payment_reference: method === "gcash" && reference ? reference : null,
      payment_receipt_url: receiptUrl,
      payment_plan: plan,
      downpayment_amount: downpaymentAmount,
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

  // Ring the shop's phones. Awaited rather than fired and forgotten: on
  // serverless the function can be frozen the moment the response returns,
  // which would drop a dangling promise silently. It swallows its own
  // failures, so a notification problem can never cost a placed order.
  await notifyNewOrder(order.id);

  return { error: null };
}
