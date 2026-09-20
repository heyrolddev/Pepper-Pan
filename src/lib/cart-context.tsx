"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cartKey, extrasTotal, type ChosenExtra } from "@/lib/modifiers";

/**
 * A line in the basket.
 *
 * `key` rather than `mealId` is what identifies it, and that change is the
 * whole reason this file moved. The cart merged on the dish, which was right
 * while a dish was the only thing a customer could choose — and became wrong
 * the moment they could add extra rice to one of them. Merging on the dish
 * would have turned "with extra rice" and "without" into quantity 2 of
 * whichever was tapped first: the wrong money charged and the wrong food
 * cooked, with nothing on screen to say so.
 */
export type CartItem = {
  /** The dish plus everything added to it — see `cartKey`. */
  key: string;
  mealId: string;
  name: string;
  /** The dish's own price. The add-ons carry theirs. */
  price: number;
  extras: ChosenExtra[];
  qty: number;
};

/** What one of this line costs, add-ons included. */
export const lineUnitPrice = (item: CartItem) =>
  (Number(item.price) || 0) + extrasTotal(item.extras ?? []);

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty" | "key">, qty?: number) => void;
  removeItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "pepperpan_cart";

/**
 * A cart saved before add-ons existed has no `key` and no `extras`.
 *
 * It is sitting in real browsers right now, and the alternative to reading it
 * is a customer who comes back to an empty basket the day this ships. Given a
 * shape rather than discarded: no extras, and a key that is just the dish,
 * which is exactly what the old merge rule meant.
 */
function reviveCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const i = row as Partial<CartItem>;
    if (typeof i.mealId !== "string" || typeof i.name !== "string") continue;
    const price = Number(i.price);
    const qty = Number(i.qty);
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) continue;
    const extras = Array.isArray(i.extras) ? (i.extras as ChosenExtra[]) : [];
    out.push({
      key: typeof i.key === "string" && i.key ? i.key : cartKey(i.mealId, extras),
      mealId: i.mealId,
      name: i.name,
      price,
      extras,
      qty,
    });
  }
  return out;
}

export function CartProvider({
  children,
  staff = false,
}: {
  children: ReactNode;
  /** Staff can't check out, so a cart of theirs is a cart nobody can empty. */
  staff?: boolean;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // One-time hydration from localStorage, which doesn't exist during SSR
    // and so can't be read during the initial render.
    try {
      // Staff can no longer add to a cart, but one added *before* that was
      // true is still sitting in their browser — a count in a header they
      // have no way to clear, because the page that would clear it now
      // redirects them to HQ. Emptying it on the way in is the only place
      // left that can.
      if (staff) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        const raw = localStorage.getItem(STORAGE_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (raw) setItems(reviveCart(JSON.parse(raw)));
      }
    } catch {
      // ignore malformed/unavailable storage
    }
    setHydrated(true);
  }, [staff]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage write failures (private browsing, quota, etc.)
    }
  }, [items, hydrated]);

  function addItem(item: Omit<CartItem, "qty" | "key">, qty = 1) {
    const key = cartKey(item.mealId, item.extras ?? []);
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, extras: item.extras ?? [], key, qty }];
    });
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function setQty(key: string, qty: number) {
    if (qty <= 0) {
      removeItem(key);
      return;
    }
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function clear() {
    setItems([]);
  }

  const total = items.reduce((sum, i) => sum + lineUnitPrice(i) * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, setQty, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
