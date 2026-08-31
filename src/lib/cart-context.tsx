"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = { mealId: string; name: string; price: number; qty: number };

type CartContextValue = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (mealId: string) => void;
  setQty: (mealId: string, qty: number) => void;
  clear: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "pepperpan_cart";

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
        if (raw) setItems(JSON.parse(raw));
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

  function addItem(item: Omit<CartItem, "qty">, qty = 1) {
    setItems((prev) => {
      const existing = prev.find((i) => i.mealId === item.mealId);
      if (existing) {
        return prev.map((i) => (i.mealId === item.mealId ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { ...item, qty }];
    });
  }

  function removeItem(mealId: string) {
    setItems((prev) => prev.filter((i) => i.mealId !== mealId));
  }

  function setQty(mealId: string, qty: number) {
    if (qty <= 0) {
      removeItem(mealId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.mealId === mealId ? { ...i, qty } : i)));
  }

  function clear() {
    setItems([]);
  }

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
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
