"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { cartQuantityProblem } from "@/lib/orders";
import { recordOrderCost, loadAvailability } from "@/lib/costing-server";
import { loadModifiers } from "@/lib/modifiers-server";
import { groupsFor, resolveChoice, type ChosenExtra } from "@/lib/modifiers";

type PlaceOrderInput = {
  // `name` is the browser's copy, used only to name a sold-out dish back to
  // the same customer. Prices and availability always come from the database.
  //
  // `options` is the same principle one level down: which add-ons were
  // ticked and how many of each, and nothing about what they are called or
  // what they cost. Both of those are re-read here — see `resolveChoice`.
  items: {
    mealId: string;
    qty: number;
    name?: string;
    options?: { id: string; qty: number }[];
  }[];
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
  // Before anything else, and before a single database round trip: the
  // quantity is a number the browser chose, and every figure downstream —
  // the subtotal, the stock check, the takings — is computed from it.
  const badQuantity = cartQuantityProblem(input.items);
  if (badQuantity) return { error: badQuantity };
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
    .select("is_blocked, role")
    .eq("id", user.id)
    .maybeSingle();

  // The shop can't be its own customer.
  //
  // Every owner order lands in the same queue the kitchen works from, counts
  // toward the day's takings and shows up in analytics — so a few taps while
  // testing quietly become sales the shop never made, and figures the owner
  // will later believe. The buttons are hidden and the pages redirect, but
  // this is the guard that holds: a hidden button is still a form that can be
  // submitted, and only the server decides what gets written.
  if (profile?.role === "owner" || profile?.role === "staff") {
    return {
      error:
        "You're signed in as shop staff, so this account can't place orders — they'd land in your own kitchen queue and count as sales. Sign in with a customer account to test ordering.",
    };
  }

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
    .select("id, name, price, product_id")
    .in("id", mealIds);
  if (mealsError || !meals) {
    return { error: "Could not verify menu prices." };
  }

  const priceById = new Map(meals.map((m) => [m.id, Number(m.price)]));
  const nameById = new Map(meals.map((m) => [m.id, m.name as string]));
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

  // --- Add-ons -----------------------------------------------------------
  // Priced, checked against what that dish actually offers, and refused
  // rather than repaired. A cart lives in localStorage; the only thing it is
  // trusted for here is which ids were ticked.
  const productById = new Map(
    (meals as { id: string; product_id: string | null }[]).map((m) => [
      m.id,
      m.product_id,
    ])
  );
  const wantsAddOns = input.items.some((i) => (i.options ?? []).length > 0);
  const addOns = wantsAddOns
    ? await loadModifiers(supabase)
    : { byMeal: new Map(), byProduct: new Map(), all: [], error: null };
  if (wantsAddOns && addOns.error) {
    return {
      error:
        "We can't read the add-ons right now, so we'd rather not guess at your order. Please try again in a moment.",
    };
  }

  /** How one cart line is told from another, including the quantities. */
  const signature = (i: PlaceOrderInput["items"][number]) =>
    i.mealId + "|" + (i.options ?? []).map((o) => `${o.id}:${o.qty}`).join("+");

  const extrasFor = new Map<string, ChosenExtra[]>();
  for (const item of input.items) {
    const picks = item.options ?? [];
    if (picks.length === 0) continue;
    const groups = groupsFor(
      item.mealId,
      productById.get(item.mealId) ?? null,
      addOns.byMeal,
      addOns.byProduct
    );
    const { extras, problem } = resolveChoice(
      groups,
      picks,
      nameById.get(item.mealId) ?? "your order"
    );
    if (problem) return { error: problem };
    extrasFor.set(signature(item), extras);
  }
  const extrasOfItem = (i: PlaceOrderInput["items"][number]) =>
    extrasFor.get(signature(i)) ?? [];

  const subtotal = input.items.reduce(
    (sum, i) =>
      sum +
      (priceById.get(i.mealId)! +
        extrasOfItem(i).reduce((n, e) => n + e.price * e.qty, 0)) *
        i.qty,
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
    // Either proof, not both — the same rule as the general check above.
    //
    // This said `!reference` and nothing else, which meant a customer who
    // attached a screenshot of the GCash receipt was still refused and told
    // to type a reference number. They had already given the proof; the form
    // was asking for it twice and only counting one.
    if (reference.length < 4 && !receiptFile) {
      return {
        error:
          "Add your GCash reference number or a screenshot of the receipt so we can confirm the booking — either one is fine.",
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

  // Can the kitchen actually make this? Checked here, on the server, because
  // the menu greying a button out is a courtesy and not a control: a stale
  // tab, a back button or a crafted request all reach this line with a dish
  // whose ingredients ran out ten minutes ago. Selling food that cannot be
  // cooked costs a refund and a customer.
  const makeable = await loadAvailability();

  /**
   * How many of each dish this order needs — the dishes ordered AND the
   * dishes added to them, because an add-on IS a dish and draws the same
   * stock. Summed across lines first: three separate lines each asking for
   * one extra rice is three portions of rice, and checking them one at a time
   * would wave all three through while one is left.
   */
  const needed = new Map<string, number>();
  const labelOf = new Map<string, string>();
  for (const i of input.items) {
    needed.set(i.mealId, (needed.get(i.mealId) ?? 0) + i.qty);
    labelOf.set(i.mealId, nameById.get(i.mealId) ?? "an item");
    for (const e of extrasOfItem(i)) {
      if (!e.mealId) continue;
      // Two extra rice on a line of three is six portions.
      needed.set(e.mealId, (needed.get(e.mealId) ?? 0) + i.qty * e.qty);
      labelOf.set(e.mealId, e.label);
    }
  }
  const short = [...needed].filter(([mealId, qty]) => {
    const n = makeable.get(mealId);
    return n !== undefined && n < qty;
  });
  if (short.length > 0) {
    const names = short.map(([mealId]) => labelOf.get(mealId) ?? "an item").join(", ");
    return {
      error: `Sorry — we've just run out of ${names}. Take it out of your cart and the rest can go through.`,
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

  /**
   * `price_at_sale` stays the DISH's price, with the add-ons on their own
   * rows underneath. Folding them in would make a line read "Pork Solo Rice
   * ₱135" where the menu says ₱120 — a receipt that looks like a price rise
   * and a best-seller report that can no longer tell what a rice meal costs.
   * The ids come back so the extras know which line they belong to.
   */
  const { data: insertedLines, error: linesError } = await supabase
    .from("order_lines")
    .insert(
      input.items.map((i) => ({
        order_id: order.id,
        meal_id: i.mealId,
        qty: i.qty,
        price_at_sale: priceById.get(i.mealId)!,
      }))
    )
    .select("id");
  if (linesError) {
    return { error: linesError.message };
  }

  // Positional, and safe to be: PostgREST returns inserted rows in the order
  // they were sent. Guarded anyway — a line count that doesn't match would
  // otherwise attach somebody's extra rice to the wrong dish.
  const lineIds = (insertedLines ?? []).map((l) => l.id as number);
  if (lineIds.length === input.items.length) {
    const extraRows = input.items.flatMap((item, at) =>
      extrasOfItem(item).map((e) => ({
        order_line_id: lineIds[at],
        option_id: e.optionId,
        meal_id: e.mealId,
        label: e.label,
        // Per one, the same rule as `order_lines.price_at_sale`. The quantity
        // multiplies it, here and in `order_requirements`.
        price_at_sale: e.price,
        qty: e.qty,
      }))
    );
    if (extraRows.length > 0) {
      const { error: extrasError } = await supabase
        .from("order_line_extras")
        .insert(extraRows);
      // Not survivable, unlike a slow notification: `revenue` already
      // includes those add-ons, so leaving the order would charge for a drink
      // the kitchen was never told to pour. It goes back rather than out
      // half-written.
      //
      // Through the admin client, because the customer's own cannot do it:
      // `staff_delete_orders` is the only DELETE policy on `orders`, so the
      // obvious `supabase.from("orders").delete()` here would have returned
      // success, removed nothing, and left exactly the half-written order
      // this branch exists to prevent.
      if (extrasError) {
        const { error: rollbackError } = await createAdminClient()
          .from("orders")
          .delete()
          .eq("id", order.id);
        if (rollbackError) {
          console.error(
            `[checkout] order ${order.id} kept its lines but lost its add-ons, and could not be rolled back: ${rollbackError.message}`
          );
        }
        return {
          error:
            "We couldn't save your add-ons, so nothing was ordered. Please try again.",
        };
      }
    }
  }

  // What the order cost to make, priced now. Awaited before the notification
  // so a sale is never left uncosted by a slow push; it swallows its own
  // failures, so it can't cost a placed order either.
  await recordOrderCost(order.id);

  // Ring the shop's phones. Awaited rather than fired and forgotten: on
  // serverless the function can be frozen the moment the response returns,
  // which would drop a dangling promise silently. It swallows its own
  // failures, so a notification problem can never cost a placed order.
  await notifyNewOrder(order.id);

  return { error: null };
}
