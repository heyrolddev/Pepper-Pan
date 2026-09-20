import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  optionPrice,
  type ModifierGroup,
  type ModifierOption,
} from "@/lib/modifiers";

/**
 * The add-ons, read once, for whoever needs them.
 *
 * Four tables and a join to `meals`, and three screens want the same answer:
 * the customer's menu, the counter, and the owner's editor. Three copies of
 * this query is three places to forget the `is_active` on the group the day a
 * fourth screen matters — and the failure is the quiet kind, an add-on the
 * owner switched off still being sold on one page.
 *
 * ── Why this never throws ────────────────────────────────────────────────
 *
 * It is called from the menu, which has to render. A shop with a broken
 * add-ons table should sell rice meals without add-ons, not show a customer
 * an error page — so a failure is logged, loudly enough to find, and comes
 * back as "no add-ons". That is the same rule `menu_products` learned the
 * hard way: silent was the problem, absent was survivable.
 */

export type ModifierBook = {
  /** Groups attached to one dish. */
  byMeal: Map<string, ModifierGroup[]>;
  /** Groups attached to a whole menu card — the common case. */
  byProduct: Map<string, ModifierGroup[]>;
  /** Every live group, in the owner's order. For the editor and the counter. */
  all: ModifierGroup[];
  error: string | null;
};

const EMPTY: ModifierBook = {
  byMeal: new Map(),
  byProduct: new Map(),
  all: [],
  error: null,
};

type GroupRow = {
  id: string;
  name: string;
  helper: string | null;
  min_select: number;
  max_select: number;
  sort_order: number;
};
type OptionRow = {
  id: string;
  group_id: string;
  label: string;
  price_override: number | null;
  sort_order: number;
  option_meal_id: string | null;
  meals: { price: number; is_available: boolean } | null;
};
type AttachRow = { group_id: string; sort_order: number };

export async function loadModifiers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  /**
   * Servings the shelf can still make, per dish — `loadAvailability()`. Passed
   * in rather than fetched, because every caller already has it and computing
   * it twice on one page load is the whole stock picture twice.
   */
  makeable?: Map<string, number>
): Promise<ModifierBook> {
  const [groups, options, mealAttach, productAttach] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, helper, min_select, max_select, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("modifier_options")
      .select(
        "id, group_id, label, price_override, sort_order, option_meal_id, meals:option_meal_id(price, is_available)"
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("meal_modifier_groups").select("meal_id, group_id, sort_order"),
    supabase
      .from("product_modifier_groups")
      .select("product_id, group_id, sort_order"),
  ]);

  const failure =
    groups.error ?? options.error ?? mealAttach.error ?? productAttach.error;
  if (failure) {
    console.error(
      `[modifiers] add-ons unreadable, so nothing is offered with any dish: ${failure.message}`
    );
    return { ...EMPTY, error: failure.message };
  }

  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const o of (options.data ?? []) as unknown as OptionRow[]) {
    const list = optionsByGroup.get(o.group_id) ?? [];
    list.push({
      id: o.id,
      label: o.label,
      mealId: o.option_meal_id,
      price: optionPrice(o.price_override, o.meals?.price ?? null),
      // Null, not zero, when there is no recipe: zero means "can't make any"
      // and would take a perfectly sellable add-on off the menu.
      makeable: o.option_meal_id ? (makeable?.get(o.option_meal_id) ?? null) : null,
      available: o.meals?.is_available !== false,
      sort: o.sort_order ?? 0,
    });
    optionsByGroup.set(o.group_id, list);
  }

  const all: ModifierGroup[] = ((groups.data ?? []) as GroupRow[]).map((g) => ({
    id: g.id,
    name: g.name,
    helper: g.helper,
    min: g.min_select ?? 0,
    max: g.max_select ?? 1,
    sort: g.sort_order ?? 0,
    options: optionsByGroup.get(g.id) ?? [],
  }));
  const byId = new Map(all.map((g) => [g.id, g]));

  /** Attachments pointing at a group that has been switched off are dropped. */
  function index<T extends AttachRow>(rows: T[], key: keyof T) {
    const out = new Map<string, ModifierGroup[]>();
    for (const r of [...rows].sort((a, b) => a.sort_order - b.sort_order)) {
      const g = byId.get(r.group_id);
      if (!g) continue;
      const owner = String(r[key]);
      out.set(owner, [...(out.get(owner) ?? []), g]);
    }
    return out;
  }

  return {
    byMeal: index(
      (mealAttach.data ?? []) as (AttachRow & { meal_id: string })[],
      "meal_id"
    ),
    byProduct: index(
      (productAttach.data ?? []) as (AttachRow & { product_id: string })[],
      "product_id"
    ),
    all,
    error: null,
  };
}
