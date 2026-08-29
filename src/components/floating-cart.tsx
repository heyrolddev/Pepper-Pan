"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useCart } from "@/lib/cart-context";

const peso = (n: number) => "₱" + n.toFixed(2);

/**
 * A checkout bar that follows the customer around the site once they've added
 * anything, so ordering never depends on finding the cart link in the nav.
 *
 * Hidden on the pages that already *are* the checkout flow, where it would sit
 * on top of the real buttons and compete with them.
 */
export function FloatingCart() {
  const { items, count, total } = useCart();
  const pathname = usePathname();

  const onCheckoutFlow = pathname === "/cart" || pathname === "/checkout";
  const show = items.length > 0 && !onCheckoutFlow;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          // Sits above everything but below the nav's dropdowns, and clears
          // the iOS home indicator via safe-area padding.
          className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Link
            href="/checkout"
            className="mx-auto flex max-w-lg items-center gap-4 rounded-full bg-brand-600 py-3 pl-5 pr-3 shadow-2xl shadow-ink-950/40 ring-2 ring-gold-400/60 transition-transform hover:scale-[1.02]"
          >
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-950">
              <span className="text-xl">🛒</span>
              <motion.span
                key={count}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 14 }}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gold-400 text-[11px] font-black text-ink-950"
              >
                {count}
              </motion.span>
            </span>

            <span className="min-w-0 flex-1 text-cream-50">
              <span className="block text-[11px] font-bold uppercase tracking-widest text-cream-100/70">
                {count} item{count === 1 ? "" : "s"} in your cart
              </span>
              <span className="block font-display text-xl font-black leading-tight">
                {peso(total)}
              </span>
            </span>

            <span className="shrink-0 rounded-full bg-gold-400 px-5 py-3 font-display font-black text-ink-950">
              Checkout →
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
