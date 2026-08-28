"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { placeOrder } from "@/app/checkout/actions";

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
      <p className="text-brand-800/80 dark:text-brand-100/70">
        Your cart is empty.
      </p>
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
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-brand-900 dark:text-brand-100">
        Name
        <input
          required
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          className="rounded border border-brand-300 bg-white px-4 py-2 font-normal dark:border-brand-800 dark:bg-brand-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-brand-900 dark:text-brand-100">
        Phone
        <input
          required
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className="rounded border border-brand-300 bg-white px-4 py-2 font-normal dark:border-brand-800 dark:bg-brand-900"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-brand-900 dark:text-brand-100">
        Fulfillment
        <select
          value={fulfillment}
          onChange={(e) => setFulfillment(e.target.value as "pickup" | "delivery")}
          className="rounded border border-brand-300 bg-white px-4 py-2 font-normal dark:border-brand-800 dark:bg-brand-900"
        >
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-brand-900 dark:text-brand-100">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded border border-brand-300 bg-white px-4 py-2 font-normal dark:border-brand-800 dark:bg-brand-900"
        />
      </label>

      <div className="flex items-center justify-between border-t border-brand-200/60 pt-4 text-lg font-semibold text-brand-950 dark:border-brand-800 dark:text-brand-50">
        <span>Total</span>
        <span>₱{total.toFixed(2)}</span>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-brand-900 px-6 py-3 font-medium text-brand-50 transition-colors hover:bg-brand-800 disabled:opacity-60 dark:bg-gold-400 dark:text-brand-950 dark:hover:bg-gold-300"
      >
        {submitting ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
