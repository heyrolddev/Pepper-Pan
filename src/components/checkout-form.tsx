"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { placeOrder } from "@/app/checkout/actions";
import { MapPicker, type Pin } from "@/components/map-picker";
import { PaymentPicker } from "@/components/payment-picker";
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

export function CheckoutForm({
  defaults,
  delivery,
  payments,
}: {
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

  const blockedReason = deliveryBlocked ?? paymentBlocked;

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-10 text-center">
        <p className="font-display text-2xl font-bold text-ink-950">Your cart is empty</p>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-full bg-brand-600 px-7 py-3 font-bold text-cream-50 transition-transform hover:scale-105"
        >
          Browse the menu →
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (blockedReason) return setError(blockedReason);

    setSubmitting(true);
    setError(null);

    try {
      const result = await placeOrder({
        items: items.map((i) => ({ mealId: i.mealId, qty: i.qty })),
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
      });

      if (result.error) {
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

      {isDelivery && (
        <div className="flex flex-col gap-4 rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          <label className={labelClass}>
            Delivery address <span className="text-brand-600">*required</span>
            <textarea
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder="House no. & street, barangay, nearest landmark…"
              className={fieldClass}
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-800">
              Pin your exact location <span className="text-brand-600">*required</span>
            </p>
            <MapPicker value={pin} onChange={setPin} shop={shop} />
          </div>

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

      <button
        type="submit"
        disabled={submitting || Boolean(blockedReason)}
        className="rounded-full bg-brand-600 px-7 py-4 font-bold text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? "Placing order…" : "Place order →"}
      </button>
      <p className="text-center text-xs text-ink-800/50">
        {method === "gcash"
          ? "We'll check your GCash reference and confirm your order shortly."
          : "Cash on pickup or delivery. We'll confirm your order shortly."}
      </p>
    </form>
  );
}
