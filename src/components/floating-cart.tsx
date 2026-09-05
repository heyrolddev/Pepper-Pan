"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AdminDialog } from "@/components/admin-dialog";
import { useCart } from "@/lib/cart-context";

const peso = (n: number) => "₱" + n.toFixed(2);

/**
 * The bar that follows a customer around once they've added something, and
 * the review it now opens.
 *
 * It used to link straight to checkout, which put the first chance to fix a
 * mistake on the page that asks for an address and a payment method. Ordering
 * from a menu is fast and a little careless — a double tap adds two, a
 * changed mind leaves something behind — so the tap that used to commit now
 * opens the order instead: change the numbers, take something out, then
 * confirm.
 *
 * A sheet rather than a trip to /cart, and that is the point of it. The
 * customer is halfway down the menu; sending them to another page loses their
 * place and makes "actually, add one more" a navigation problem. This opens
 * over the menu and closes back onto the same scroll position.
 *
 * The full /cart page still exists and still works — the nav's cart link goes
 * there. Both edit the same cart through the same three functions, so they
 * cannot disagree about what is in it.
 */
export function FloatingCart({ staff = false }: { staff?: boolean }) {
  const { items, count, total, setQty, removeItem } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);

  const onCheckoutFlow = pathname === "/cart" || pathname === "/checkout";
  // Staff can't order at all, so a bar inviting them to check out is a button
  // that leads to a refusal.
  const show = items.length > 0 && !onCheckoutFlow && !staff;

  // Emptying the last line closes the sheet by itself. A review of nothing is
  // a dialog asking to be dismissed, and the bar behind it has gone too.
  //
  // Derived rather than pushed into state by an effect: the React Compiler
  // rejects setState in an effect and is right to — the sheet being open is
  // not an independent fact, it is "the customer asked for it AND there is
  // something to look at", and writing it as one expression means the two can
  // never disagree.
  const reviewOpen = reviewing && items.length > 0;

  return (
    <>
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
            <button
              onClick={() => setReviewing(true)}
              aria-haspopup="dialog"
              className="mx-auto flex w-full max-w-lg items-center gap-4 rounded-full bg-brand-600 py-3 pl-5 pr-3 text-left shadow-2xl shadow-ink-950/40 ring-2 ring-gold-400/60 transition-transform hover:scale-[1.02]"
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

              {/* Says what the tap does. It used to say "Checkout →" and then
                  go straight there; now it opens the order, and the label has
                  to agree with that or the arrow is a small lie. */}
              <span className="shrink-0 rounded-full bg-gold-400 px-5 py-3 font-display font-black text-ink-950">
                Review
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {reviewOpen && (
        <AdminDialog
          title="Your order"
          subtitle="Change anything before you check out."
          onClose={() => setReviewing(false)}
        >
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li
                  key={item.mealId}
                  className="flex flex-col gap-2.5 rounded-2xl bg-cream-100 p-3"
                >
                  {/* Two rows, not one. Written as a single row first, and a
                      look at it on a 390px phone showed the dish names cut to
                      "X…" and "G…" — the stepper, the line total and Remove
                      are all fixed-width, so the only thing left to give was
                      the name, which is the one part that has to be readable
                      for a review to be a review. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 font-bold leading-snug text-ink-950">
                      {item.name}
                    </p>
                    <p className="shrink-0 font-display text-lg font-black tabular-nums text-ink-950">
                      {peso(item.price * item.qty)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Finger-sized, because this is the control the whole
                        change exists for and it is used on a phone. */}
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-cream-50 p-1 ring-1 ring-ink-950/10">
                      <button
                        onClick={() => setQty(item.mealId, item.qty - 1)}
                        aria-label={`One less ${item.name}`}
                        className="grid h-9 w-9 place-items-center rounded-full text-lg font-black text-ink-800 transition-colors hover:bg-ink-950 hover:text-cream-50"
                      >
                        −
                      </button>
                      <span
                        aria-live="polite"
                        className="w-6 text-center font-display text-lg font-black tabular-nums text-ink-950"
                      >
                        {item.qty}
                      </span>
                      <button
                        onClick={() => setQty(item.mealId, item.qty + 1)}
                        aria-label={`One more ${item.name}`}
                        className="grid h-9 w-9 place-items-center rounded-full text-lg font-black text-ink-800 transition-colors hover:bg-brand-600 hover:text-cream-50"
                      >
                        +
                      </button>
                    </div>

                    <span className="text-xs text-ink-800/55">
                      {peso(item.price)} each
                    </span>

                    <button
                      onClick={() => removeItem(item.mealId)}
                      aria-label={`Remove ${item.name}`}
                      className="ml-auto shrink-0 rounded-full px-2 py-1 text-xs font-bold text-ink-800/45 transition-colors hover:text-brand-600"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t-2 border-ink-950/10 pt-4">
              <span className="font-bold text-ink-800/70">
                {count} item{count === 1 ? "" : "s"}
              </span>
              <span className="font-display text-2xl font-black text-ink-950">
                {peso(total)}
              </span>
            </div>

            <p className="text-xs text-ink-800/55">
              Delivery fee, if any, is worked out at checkout once we know
              where it&apos;s going.
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {/* Closing lands back on the same scroll position in the menu,
                  which is the whole reason this is a sheet. */}
              <button
                onClick={() => setReviewing(false)}
                className="rounded-full px-5 py-3 font-bold text-ink-800/70 transition-colors hover:bg-cream-100 hover:text-ink-950 sm:flex-1"
              >
                Add more
              </button>
              <button
                onClick={() => {
                  setReviewing(false);
                  router.push("/checkout");
                }}
                className="rounded-full bg-brand-600 px-5 py-3 font-display text-lg font-black text-cream-50 transition-colors hover:bg-brand-700 sm:flex-[2]"
              >
                Confirm — {peso(total)}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
