"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * "Order this again."
 *
 * A stall lives on regulars, and a regular orders the same thing. Making them
 * rebuild that order dish by dish every week is the single most expensive
 * friction on the site — so this rebuilds it for them in one tap.
 *
 * What it deliberately does *not* do is trust the old order. Prices move and
 * dishes sell out, so the cart is rebuilt from what the menu says right now,
 * and anything that's gone is named rather than silently dropped. A customer
 * who reaches checkout and finds a different total than they expected is a
 * customer who stops trusting the number on the screen.
 */

export type ReorderResult =
  | {
      ok: true;
      items: { mealId: string; name: string; price: number; qty: number }[];
      /** Dishes we couldn't add, by name, so the customer hears about it. */
      skipped: string[];
    }
  | { ok: false; error: string };

export async function reorder(orderId: string): Promise<ReorderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You need to sign in first." };

  // Scoped to this customer's own order — RLS enforces the same thing, but
  // being explicit means a mistake here fails closed rather than leaking.
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_lines(meal_id, qty, meals(name))")
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "We couldn't find that order." };

  type Line = { meal_id: string | null; qty: number; meals: { name: string } | null };
  const lines = ((order.order_lines ?? []) as unknown as Line[]).filter(
    (l) => l.meal_id
  );
  if (lines.length === 0) {
    return { ok: false, error: "That order has nothing to repeat." };
  }

  // Ordering the same dish on two lines should come back as one line.
  const wanted = new Map<string, number>();
  const oldNames = new Map<string, string>();
  for (const l of lines) {
    const id = l.meal_id!;
    wanted.set(id, (wanted.get(id) ?? 0) + l.qty);
    if (l.meals?.name) oldNames.set(id, l.meals.name);
  }

  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("id, name, price, is_public, is_available")
    .in("id", [...wanted.keys()]);

  if (mealsError) return { ok: false, error: mealsError.message };

  const live = new Map(
    ((meals ?? []) as {
      id: string;
      name: string;
      price: number;
      is_public: boolean;
      is_available: boolean;
    }[])
      .filter((m) => m.is_public && m.is_available)
      .map((m) => [m.id, m])
  );

  const items: { mealId: string; name: string; price: number; qty: number }[] = [];
  const skipped: string[] = [];

  for (const [mealId, qty] of wanted) {
    const meal = live.get(mealId);
    if (!meal) {
      // Named from the old order when the dish is gone entirely — "one item"
      // tells the customer nothing they can act on.
      skipped.push(oldNames.get(mealId) ?? "an item");
      continue;
    }
    items.push({ mealId, name: meal.name, price: Number(meal.price), qty });
  }

  if (items.length === 0) {
    return {
      ok: false,
      error:
        skipped.length === 1
          ? `${skipped[0]} isn't on the menu right now.`
          : "Nothing from that order is on the menu right now.",
    };
  }

  return { ok: true, items, skipped };
}
