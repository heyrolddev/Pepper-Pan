"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { placeOrder } from "@/app/checkout/actions";

const fieldClass =
  "rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";
const labelClass =
  "flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800";

export function CheckoutForm() {
  const { items, total, clear } = useCart();
  const router = useRouter();

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-10 text-center">
        <p className="font-display text-2xl font-bold text-ink-950">
          Your cart is empty
        </p>
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
    setSubmitting(true);
    setError(null);

    const result = await placeOrder({
      items: items.map((i) => ({ mealId: i.mealId, qty: i.qty })),
      contactName,
      contactPhone,
      fulfillment,
      notes,
    });

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    clear();
    router.push("/orders");
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
                ₱{(item.price * item.qty).toFixed(2)}
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
        Phone
        <input
          required
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="09XX XXX XXXX"
          className={fieldClass}
        />
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
              onClick={() => setFulfillment(option)}
              className={`rounded-2xl border-2 px-4 py-3 font-bold capitalize transition-colors ${
                fulfillment === option
                  ? "border-brand-600 bg-brand-600 text-cream-50"
                  : "border-ink-950/15 bg-cream-100 text-ink-800 hover:border-brand-600"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <label className={labelClass}>
        Notes {fulfillment === "delivery" ? "(include your address)" : "(optional)"}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={
            fulfillment === "delivery"
              ? "Delivery address, landmarks, special requests…"
              : "Any special requests?"
          }
          className={fieldClass}
        />
      </label>

      <div className="flex items-center justify-between rounded-3xl bg-ink-950 px-6 py-5 text-cream-50">
        <span className="font-display text-lg font-bold">Total</span>
        <span className="font-display text-2xl font-black text-gold-400">
          ₱{total.toFixed(2)}
        </span>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-brand-600 px-7 py-4 font-bold text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
      >
        {submitting ? "Placing order…" : "Place order →"}
      </button>
      <p className="text-center text-xs text-ink-800/50">
        Cash on pickup or delivery. We&apos;ll confirm your order shortly.
      </p>
    </form>
  );
}
