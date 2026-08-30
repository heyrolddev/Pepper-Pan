"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { reorder } from "@/app/orders/reorder";

/**
 * One tap to order the same thing again.
 *
 * The cart is replaced rather than added to. Someone pressing this has decided
 * what they want; quietly merging it with whatever they were browsing an hour
 * ago produces a basket nobody asked for, and the total is the first thing
 * they'd notice was wrong.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const { items: cartItems, clear, addItem } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);

    const result = await reorder(orderId);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    clear();
    for (const item of result.items) {
      addItem(
        { mealId: item.mealId, name: item.name, price: item.price },
        item.qty
      );
    }

    // Said on the cart page rather than here, because that's where they're
    // about to look for the missing dish.
    const note =
      result.skipped.length > 0
        ? `?missing=${encodeURIComponent(result.skipped.join(", "))}`
        : "";
    router.push(`/cart${note}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={busy}
        title={
          cartItems.length > 0
            ? "This replaces what's in your cart"
            : "Add these items to your cart again"
        }
        className="rounded-full bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 transition-transform hover:scale-105 disabled:opacity-60"
      >
        {busy ? "Adding…" : "Order this again →"}
      </button>
      {error && (
        <p className="text-sm font-semibold text-brand-700">{error}</p>
      )}
    </div>
  );
}
