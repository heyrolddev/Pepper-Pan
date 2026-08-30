"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { placeOrder } from "@/app/checkout/actions";
import { MapPicker, type Pin } from "@/components/map-picker";
import { PaymentPicker } from "@/components/payment-picker";
import { AddressField } from "@/components/address-field";
import { OrderTiming } from "@/components/order-timing";
import { formatDateTimeFull } from "@/lib/format-date";
import { EmptyPan, EmptyState } from "@/components/spot-art";
import {
  canScheduleFor,
  parseManilaLocal,
  type Closure,
  type DayHours,
  type OpenState,
  type ShopSettings,
} from "@/lib/hours";
import { quoteDelivery, type DeliverySettings } from "@/lib/delivery";
import {
  amountDueNow,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentSettings,
} from "@/lib/payments";

const fieldClass =
  "rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";
const labelClass =
  "flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800";

const peso = (n: number) => "₱" + n.toFixed(2);

export type CheckoutSchedule = {
  hours: DayHours[];
  closures: Closure[];
  settings: ShopSettings;
  state: OpenState;
  configured: boolean;
};

export function CheckoutForm({
  defaults,
  delivery,
  payments,
  schedule,
}: {
  schedule: CheckoutSchedule;
  defaults: {
    name: string;
    phone: string;
    address: string;
    lat: number | null;
    lng: number | null;
  };
  delivery: DeliverySettings;
  payments: PaymentSettings;
}) {
  const { items, total, clear } = useCart();
  const router = useRouter();

  // Only offered when a pin was saved alongside it — an address with no pin
  // can't answer "where does the rider go", which is the whole point.
  const savedAddress =
    defaults.address.trim() && defaults.lat != null && defaults.lng != null
      ? { address: defaults.address.trim(), lat: defaults.lat, lng: defaults.lng }
      : null;

  const [contactName, setContactName] = useState(defaults.name);
  const [contactPhone, setContactPhone] = useState(defaults.phone);
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState(defaults.address);
  const [pin, setPin] = useState<Pin | null>(
    defaults.lat != null && defaults.lng != null
      ? { lat: defaults.lat, lng: defaults.lng }
      : null
  );
  const [notes, setNotes] = useState("");
  // Null means "as soon as you can" — what most orders are. A date means the
  // customer booked it for later, which is the only way to order while the
  // shop is shut.
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  // Set when what they typed and where the pin sits look like different
  // places — a warning, never a block: the customer knows their own street
  // better than a geocoder does.
  const [pinWarning, setPinWarning] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(
    payments.cod_enabled ? "cod" : "gcash"
  );
  const [plan, setPlan] = useState<PaymentPlan>("full");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shop = { lat: delivery.shop_lat, lng: delivery.shop_lng };

  // Preview only — the server recomputes this and stores its own figure.
  const usingSaved =
    !!savedAddress &&
    address.trim() === savedAddress.address &&
    !!pin &&
    Math.abs(pin.lat - savedAddress.lat) < 1e-6 &&
    Math.abs(pin.lng - savedAddress.lng) < 1e-6;

  const quote = useMemo(
    () => (pin ? quoteDelivery(delivery, pin.lat, pin.lng, total) : null),
    [pin, delivery, total]
  );

  const isDelivery = fulfillment === "delivery";
  const fee = isDelivery && quote?.ok ? quote.fee : 0;
  const grandTotal = total + fee;

  const deliveryBlocked = isDelivery
    ? !address.trim() || address.trim().length < 10
      ? "Enter your complete address (house/street, barangay, landmark)."
      : !pin
        ? "Drop the pin on the map so the rider can find you."
        : quote && !quote.ok
          ? quote.reason
          : null
    : null;

  // Either proof satisfies the shop; the server and database enforce the
  // same rule, so this only saves a round trip.
  const paymentBlocked =
    method === "gcash" && reference.trim().length < 4 && !receipt
      ? "Add your GCash reference number or a screenshot of the receipt."
      : null;

  // Closed doesn't mean "no orders" — it means "not for right now". Booking
  // ahead is exactly the order a shut shop still wants.
  const mustSchedule = schedule.configured && !schedule.state.isOpen;
  const scheduleCheck =
    scheduledFor && schedule.configured
      ? canScheduleFor(
          parseManilaLocal(scheduledFor),
          schedule.hours,
          schedule.closures,
          schedule.settings
        )
      : null;

  const timingBlocked =
    mustSchedule && !scheduledFor
      ? schedule.settings.accepting_orders
        ? "We're closed right now — pick a time to collect or be delivered, and we'll have it ready."
        : (schedule.settings.paused_message?.trim() ??
          "We've paused orders for now — please check back a little later.")
      : scheduleCheck && !scheduleCheck.ok
        ? scheduleCheck.reason
        : null;

  const blockedReason = timingBlocked ?? deliveryBlocked ?? paymentBlocked;

  if (items.length === 0) {
    return (
      <EmptyState
        art={<EmptyPan className="h-full w-full" />}
        title="Your cart is empty"
        action={
          <Link
            href="/menu"
            className="mt-2 inline-block rounded-full bg-brand-600 px-7 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Browse the menu →
          </Link>
        }
      >
        There&apos;s nothing to check out yet.
      </EmptyState>
    );
  }

  /**
   * Does the typed address point anywhere near the pin?
   *
   * Best-effort and advisory. Geocoders are wrong about Philippine barangay
   * addresses often enough that blocking on this would cost real orders — so
   * a mismatch warns and the customer decides.
   */
  async function checkPinMatchesAddress(): Promise<string | null> {
    if (!isDelivery || !pin || address.trim().length < 10) return null;
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const body = (await res.json()) as { hits?: { lat: number; lng: number }[] };
      const hit = body.hits?.[0];
      if (!hit) return null;

      // Rough great-circle distance; precision beyond a kilometre is noise here.
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(hit.lat - pin.lat);
      const dLng = toRad(hit.lng - pin.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(pin.lat)) * Math.cos(toRad(hit.lat)) * Math.sin(dLng / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (km < 3) return null;
      return `Your pin is about ${Math.round(km)} km from the address you typed. The rider goes to the pin — please check it's on the right spot, or fix the address.`;
    } catch {
      // No answer from the geocoder is not evidence of a mismatch.
      return null;
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (blockedReason) return setError(blockedReason);

    // Two gates before an order is placed: does the pin agree with the
    // address, and has the customer seen exactly what they're ordering.
    if (!confirming) {
      setError(null);
      setSubmitting(true);
      const warning = await checkPinMatchesAddress();
      setSubmitting(false);
      setPinWarning(warning);
      setConfirming(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await placeOrder({
        items: items.map((i) => ({ mealId: i.mealId, qty: i.qty, name: i.name })),
        contactName,
        contactPhone,
        fulfillment,
        notes,
        deliveryAddress: isDelivery ? address : undefined,
        deliveryLat: isDelivery ? (pin?.lat ?? null) : null,
        deliveryLng: isDelivery ? (pin?.lng ?? null) : null,
        paymentMethod: method,
        paymentPlan: method === "gcash" ? plan : "full",
        paymentReference: method === "gcash" ? reference : undefined,
        paymentReceipt: method === "gcash" ? receipt : null,
        scheduledFor,
      });

      if (result.error) {
        setConfirming(false);
        setError(result.error);
        return;
      }
      clear();
      router.push("/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place your order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Order summary */}
      <div className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-800/60">
          Your order
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {items.map((item) => (
            <li key={item.mealId} className="flex justify-between gap-4">
              <span className="text-ink-800">
                {item.qty} × {item.name}
              </span>
              <span className="shrink-0 font-semibold text-ink-950">
                {peso(item.price * item.qty)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <label className={labelClass}>
        Name
        <input
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Juan dela Cruz"
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Mobile number <span className="text-brand-600">*required</span>
        <input
          required
          inputMode="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="09XX XXX XXXX"
          className={fieldClass}
        />
        <span className="text-[11px] font-medium normal-case tracking-normal text-ink-800/50">
          We&apos;ll call or text this number to confirm your order.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-800">
          Fulfillment
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(["pickup", "delivery"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={option === "delivery" && !delivery.is_enabled}
              onClick={() => setFulfillment(option)}
              className={`rounded-2xl border-2 px-4 py-3 font-bold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                fulfillment === option
                  ? "border-brand-600 bg-brand-600 text-cream-50"
                  : "border-ink-950/15 bg-cream-100 text-ink-800 hover:border-brand-600"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {!delivery.is_enabled && (
          <p className="text-xs font-semibold text-brand-700">
            Delivery is paused right now — pickup only.
          </p>
        )}
      </fieldset>

      {schedule.configured && (
        <OrderTiming
          state={schedule.state}
          settings={schedule.settings}
          hours={schedule.hours}
          closures={schedule.closures}
          value={scheduledFor}
          onChange={setScheduledFor}
          mustSchedule={mustSchedule}
        />
      )}

      {isDelivery && (
        <div className="flex flex-col gap-4 rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          {/* One tap for the address they already saved — the common case,
              and the one most likely to be typed wrong from memory. */}
          {savedAddress && (
            <button
              type="button"
              onClick={() => {
                setAddress(savedAddress.address);
                setPin({ lat: savedAddress.lat, lng: savedAddress.lng });
                setPinWarning(null);
              }}
              className={`flex items-start gap-3 rounded-2xl p-4 text-left ring-2 transition-colors ${
                usingSaved
                  ? "bg-jade-50 ring-jade-600"
                  : "bg-cream-50 ring-ink-950/10 hover:ring-brand-600"
              }`}
            >
              <span className="mt-0.5 text-lg">📍</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-widest text-ink-800/55">
                  {usingSaved ? "Using your saved address" : "Use my saved address"}
                </span>
                <span className="mt-0.5 block text-sm font-semibold text-ink-950">
                  {savedAddress.address}
                </span>
              </span>
              {usingSaved && (
                <span className="shrink-0 text-sm font-black text-jade-700">✓</span>
              )}
            </button>
          )}

          <AddressField
            required
            value={address}
            onChange={(next) => {
              setAddress(next);
              setPinWarning(null);
            }}
            onPick={(picked) => {
              setPin(picked);
              setPinWarning(null);
            }}
          />

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-800">
              Pin your exact location <span className="text-brand-600">*required</span>
            </p>
            <MapPicker
              value={pin}
              onChange={(next) => {
                setPin(next);
                setPinWarning(null);
              }}
              shop={shop}
            />
          </div>

          {pinWarning && (
            <p className="rounded-2xl bg-gold-50 px-5 py-3 text-sm font-semibold text-ink-800 ring-1 ring-gold-400/60">
              ⚠︎ {pinWarning}
            </p>
          )}

          {quote && (
            <div
              className={`rounded-2xl px-5 py-3 text-sm font-semibold ${
                quote.ok
                  ? "bg-jade-50 text-jade-700"
                  : "bg-brand-50 text-brand-700"
              }`}
            >
              {quote.ok ? (
                quote.waived ? (
                  <>
                    ~{quote.km} km away · <strong>Free delivery</strong> on orders over{" "}
                    {peso(Number(delivery.free_over))} 🎉
                  </>
                ) : (
                  <>
                    ~{quote.km} km away · delivery fee <strong>{peso(quote.fee)}</strong>
                  </>
                )
              ) : (
                quote.reason
              )}
            </div>
          )}

          {delivery.notice && (
            <p className="text-xs text-ink-800/60">{delivery.notice}</p>
          )}
        </div>
      )}

      <PaymentPicker
        settings={payments}
        method={method}
        onMethodChange={setMethod}
        plan={plan}
        onPlanChange={setPlan}
        reference={reference}
        onReferenceChange={setReference}
        receipt={receipt}
        onReceiptChange={setReceipt}
        total={grandTotal}
      />

      <label className={labelClass}>
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Extra spicy, no onions, call when outside…"
          className={fieldClass}
        />
      </label>

      <div className="flex flex-col gap-2 rounded-3xl bg-ink-950 px-6 py-5 text-cream-50">
        <div className="flex items-center justify-between text-sm text-cream-100/70">
          <span>Food</span>
          <span>{peso(total)}</span>
        </div>
        {isDelivery && (
          <div className="flex items-center justify-between text-sm text-cream-100/70">
            <span>Delivery{quote?.ok ? ` (~${quote.km} km)` : ""}</span>
            <span>{quote?.ok ? (fee === 0 ? "Free" : peso(fee)) : "—"}</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-cream-50/15 pt-3">
          <span className="font-display text-lg font-bold">Total</span>
          <span className="font-display text-2xl font-black text-gold-400">
            {peso(grandTotal)}
          </span>
        </div>
        {method === "gcash" && plan === "downpayment" && payments.downpayment_enabled && (
          <div className="mt-1 flex items-center justify-between border-t border-cream-50/15 pt-3 text-sm">
            <span className="text-cream-100/70">
              Send now ({payments.downpayment_percent}%)
            </span>
            <span className="font-bold text-cream-50">
              {peso(amountDueNow(grandTotal, "downpayment", payments.downpayment_percent))}
              <span className="ml-2 font-normal text-cream-100/60">
                · {peso(grandTotal - amountDueNow(grandTotal, "downpayment", payments.downpayment_percent))} on handover
              </span>
            </span>
          </div>
        )}
      </div>

      {(error || blockedReason) && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error ?? blockedReason}
        </p>
      )}

      {/* The last look before money moves: everything they're about to buy,
          where it's going, and what it costs — on one screen, so a wrong
          address or a stray extra item is caught here rather than by a rider
          standing outside the wrong house. */}
      {confirming && (
        <div className="flex flex-col gap-4 rounded-3xl bg-gold-50 p-6 ring-2 ring-gold-400">
          <div>
            <p className="font-display text-xl font-black text-ink-950">
              Does this look right?
            </p>
            <p className="mt-0.5 text-sm text-ink-800/70">
              Have one last look before we start cooking.
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {items.map((i) => (
              <li
                key={i.mealId}
                className="flex items-center justify-between gap-3 rounded-xl bg-cream-50 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate font-semibold text-ink-950">
                  {i.qty}× {i.name}
                </span>
                <span className="shrink-0 font-mono text-ink-800/70">
                  {peso(i.price * i.qty)}
                </span>
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-cream-50 px-4 py-3">
            <p className="flex items-center justify-between text-sm">
              <span className="text-ink-800/70">Total to pay</span>
              <span className="font-display text-xl font-black text-ink-950">
                {peso(grandTotal)}
              </span>
            </p>
          </div>

          <div className="rounded-xl bg-cream-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
              When
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-950">
              {scheduledFor
                ? formatDateTimeFull(parseManilaLocal(scheduledFor))
                : "As soon as you can"}
            </p>
          </div>

          <div className="rounded-xl bg-cream-50 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
              {isDelivery ? "Delivering to" : "Picking up"}
            </p>
            {isDelivery ? (
              <>
                <p className="mt-1 text-sm font-semibold text-ink-950">{address}</p>
                {/* Coordinates mean nothing to a customer — what they need
                    to know is that the rider has a spot to go to, and how
                    far it is. */}
                {pin && (
                  <p className="mt-1 text-[11px] font-semibold text-jade-700">
                    ✓ Pin dropped
                    {quote?.ok ? ` · about ${quote.km} km from the stall` : ""}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm font-semibold text-ink-950">
                In front of Palengkeni, beside Osave — Apalit
              </p>
            )}
            <p className="mt-2 text-sm text-ink-800/70">
              {contactName} · {contactPhone}
            </p>
          </div>

          {pinWarning && (
            <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
              ⚠︎ {pinWarning}
            </p>
          )}

          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="self-start text-sm font-bold text-ink-800 hover:text-brand-600"
          >
            ← Let me fix something
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || Boolean(blockedReason)}
        className={`rounded-full px-7 py-4 font-bold transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100 ${
          confirming
            ? "bg-jade-600 text-cream-50"
            : "bg-brand-600 text-cream-50"
        }`}
      >
        {submitting
          ? confirming
            ? "Placing order…"
            : "Checking…"
          : confirming
            ? "Yes, place my order →"
            : "Review my order →"}
      </button>
      <p className="text-center text-xs text-ink-800/50">
        {method === "gcash"
          ? "We'll check your GCash reference and confirm your order shortly."
          : "Cash on pickup or delivery. We'll confirm your order shortly."}
      </p>
    </form>
  );
}
