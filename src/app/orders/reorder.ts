"use server";

import { createClient } from "@/lib/supabase/server";
import { cartKey, optionPrice, type ChosenExtra } from "@/lib/modifiers";

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
 *
 * The add-ons get the same treatment, and needed a bit more of it. The
 * receipt holds a snapshot — "Coke, ₱0" — precisely so it can never be
 * rewritten; but a snapshot is a record of last Tuesday, not an offer. So an
 * extra is re-checked against the option as it stands today, and re-priced
 * from it. An option that has since been switched off, or whose dish is gone,
 * is named in `skipped` next to the dishes, because "my extra rice quietly
 * vanished" and "the rice meal quietly vanished" are the same surprise at
 * the same till.
 */

export type ReorderItem = {
  mealId: string;
  name: string;
  price: number;
  qty: number;
  extras: ChosenExtra[];
};

export type ReorderResult =
  | {
      ok: true;
      items: ReorderItem[];
      /** What we couldn't add, by name, so the customer hears about it. */
      skipped: string[];
    }
  | { ok: false; error: string };

type ExtraRow = {
  option_id: string | null;
  label: string;
  meal_id: string | null;
};
type Line = {
  meal_id: string | null;
  qty: number;
  meals: { name: string } | null;
  order_line_extras: ExtraRow[] | null;
};

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
    .select(
      "id, order_lines(meal_id, qty, meals(name), order_line_extras(option_id, label, meal_id))"
    )
    .eq("id", orderId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "We couldn't find that order." };

  const lines = ((order.order_lines ?? []) as unknown as Line[]).filter(
    (l) => l.meal_id
  );
  if (lines.length === 0) {
    return { ok: false, error: "That order has nothing to repeat." };
  }

  /**
   * The same dish on two lines is one line again — but only when the add-ons
   * match. A plain rice meal and one with extra rice were two lines when they
   * were ordered and have to stay two, or the reorder quietly serves two of
   * whichever came first.
   */
  const wanted = new Map<
    string,
    { mealId: string; qty: number; optionIds: string[] }
  >();
  const oldNames = new Map<string, string>();

  for (const l of lines) {
    const mealId = l.meal_id!;
    const optionIds = (l.order_line_extras ?? [])
      .map((e) => e.option_id)
      .filter((id): id is string => !!id)
      .sort();
    const key = cartKey(mealId, optionIds.map((id) => ({ optionId: id }) as ChosenExtra));
    const at = wanted.get(key);
    if (at) at.qty += Number(l.qty) || 0;
    else wanted.set(key, { mealId, qty: Number(l.qty) || 0, optionIds });
    if (l.meals?.name) oldNames.set(mealId, l.meals.name);
    for (const e of l.order_line_extras ?? []) {
      if (e.option_id) oldNames.set(e.option_id, e.label);
    }
  }

  const mealIds = [...new Set([...wanted.values()].map((w) => w.mealId))];
  const optionIds = [...new Set([...wanted.values()].flatMap((w) => w.optionIds))];

  const [{ data: meals, error: mealsError }, { data: options }] = await Promise.all([
    supabase
      .from("meals")
      .select("id, name, price, is_public, is_available")
      .in("id", mealIds),
    optionIds.length > 0
      ? supabase
          .from("modifier_options")
          .select(
            "id, group_id, label, price_override, is_active, option_meal_id, modifier_groups(is_active), meals:option_meal_id(price, is_available)"
          )
          .in("id", optionIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

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

  type OptionRow = {
    id: string;
    group_id: string;
    label: string;
    price_override: number | null;
    is_active: boolean;
    option_meal_id: string | null;
    modifier_groups: { is_active: boolean } | null;
    meals: { price: number; is_available: boolean } | null;
  };
  const liveOptions = new Map(
    ((options ?? []) as unknown as OptionRow[])
      .filter(
        (o) =>
          o.is_active &&
          o.modifier_groups?.is_active !== false &&
          o.option_meal_id &&
          o.meals?.is_available !== false
      )
      .map((o) => [o.id, o])
  );

  const items: ReorderItem[] = [];
  const skipped: string[] = [];

  for (const { mealId, qty, optionIds: ids } of wanted.values()) {
    const meal = live.get(mealId);
    if (!meal) {
      // Named from the old order when the dish is gone entirely — "one item"
      // tells the customer nothing they can act on.
      skipped.push(oldNames.get(mealId) ?? "an item");
      continue;
    }

    const extras: ChosenExtra[] = [];
    for (const id of ids) {
      const o = liveOptions.get(id);
      if (!o) {
        skipped.push(oldNames.get(id) ?? "an add-on");
        continue;
      }
      extras.push({
        optionId: o.id,
        groupId: o.group_id,
        label: o.label,
        // Re-priced from today's menu, the same as the dish itself.
        price: optionPrice(o.price_override, o.meals?.price ?? null),
        mealId: o.option_meal_id,
      });
    }

    items.push({ mealId, name: meal.name, price: Number(meal.price), qty, extras });
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

  return { ok: true, items, skipped: [...new Set(skipped)] };
}
