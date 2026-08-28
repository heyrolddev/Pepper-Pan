"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export default function CartPage() {
  const { items, setQty, removeItem, total } = useCart();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-amber-950 dark:text-amber-50">
        Your cart
      </h1>

      {items.length === 0 ? (
        <p className="text-amber-800/80 dark:text-amber-100/70">
          Your cart is empty.{" "}
          <Link href="/#menu" className="font-medium underline">
            Browse the menu
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-amber-200/60 dark:divide-neutral-800">
            {items.map((item) => (
              <li
                key={item.mealId}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium text-amber-950 dark:text-amber-50">
                    {item.name}
                  </p>
                  <p className="text-sm text-amber-800/70 dark:text-amber-100/60">
                    ${item.price.toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => setQty(item.mealId, Number(e.target.value))}
                    className="w-16 rounded border border-amber-300 bg-white px-2 py-1 text-center dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <span className="w-20 text-right font-medium text-amber-900 dark:text-amber-100">
                    ${(item.price * item.qty).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeItem(item.mealId)}
                    className="text-sm text-amber-700 hover:underline dark:text-amber-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-amber-200/60 py-6 dark:border-neutral-800">
            <span className="text-lg font-semibold text-amber-950 dark:text-amber-50">
              Total
            </span>
            <span className="text-lg font-semibold text-amber-950 dark:text-amber-50">
              ${total.toFixed(2)}
            </span>
          </div>

          <Link
            href="/checkout"
            className="inline-block rounded-full bg-amber-900 px-6 py-3 font-medium text-amber-50 transition-colors hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            Checkout
          </Link>
        </>
      )}
    </main>
  );
}
