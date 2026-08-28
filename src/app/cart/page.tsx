"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export default function CartPage() {
  const { items, setQty, removeItem, total } = useCart();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-brand-950 dark:text-brand-50">
        Your cart
      </h1>

      {items.length === 0 ? (
        <p className="text-brand-800/80 dark:text-brand-100/70">
          Your cart is empty.{" "}
          <Link href="/#menu" className="font-medium underline">
            Browse the menu
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-brand-200/60 dark:divide-brand-800">
            {items.map((item) => (
              <li
                key={item.mealId}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium text-brand-950 dark:text-brand-50">
                    {item.name}
                  </p>
                  <p className="text-sm text-brand-800/70 dark:text-brand-100/60">
                    ${item.price.toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => setQty(item.mealId, Number(e.target.value))}
                    className="w-16 rounded border border-brand-300 bg-white px-2 py-1 text-center dark:border-brand-800 dark:bg-brand-900"
                  />
                  <span className="w-20 text-right font-medium text-brand-900 dark:text-brand-100">
                    ${(item.price * item.qty).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeItem(item.mealId)}
                    className="text-sm text-brand-700 hover:underline dark:text-brand-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-brand-200/60 py-6 dark:border-brand-800">
            <span className="text-lg font-semibold text-brand-950 dark:text-brand-50">
              Total
            </span>
            <span className="text-lg font-semibold text-brand-950 dark:text-brand-50">
              ${total.toFixed(2)}
            </span>
          </div>

          <Link
            href="/checkout"
            className="inline-block rounded-full bg-brand-900 px-6 py-3 font-medium text-brand-50 transition-colors hover:bg-brand-800 dark:bg-brand-100 dark:text-brand-950 dark:hover:bg-brand-200"
          >
            Checkout
          </Link>
        </>
      )}
    </main>
  );
}
