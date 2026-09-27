import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  optionPrice,
  variantPrice,
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
  max_qty: number;
  option_meal_id: string | null;
  option_product_id: string | null;
  meals: { price: number; is_available: boolean } | null;
};
/** One dish that is a variant of a product an option points at. */
type VariantRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  product_id: string | null;
  options: Record<string, string> | null;
  variant_sort: number | null;
};
type OptionPriceRow = { option_id: string; meal_id: string; price: number };
type AttachRow = { group_id: string; sort_order: number };

export async function loadModifiers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  /**
   * Servings the shelf can still make, per dish — `loadAvailability()`.
   *
   * Passed in rather than fetched, because every caller already has it and
   * computing it twice on one page load is the whole stock picture twice.
   *
   * A PROMISE is accepted, and that is the point: the stock picture is four
   * more tables, and awaiting it before calling this made two independent
   * reads into a queue. Handed the un-awaited promise, both sets of queries
   * are in flight at once and this waits for it only at the moment it has
   * something to do with it.
   */
  makeable?: Map<string, number> | Promise<Map<string, number>>
): Promise<ModifierBook> {
  const [groups, options, mealAttach, productAttach, variantRows, priceRows] =
    await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, helper, min_select, max_select, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("modifier_options")
      .select(
        "id, group_id, label, price_override, sort_order, max_qty, option_meal_id, option_product_id, meals:option_meal_id(price, is_available)"
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("meal_modifier_groups").select("meal_id, group_id, sort_order"),
    supabase
      .from("product_modifier_groups")
      .select("product_id, group_id, sort_order"),
    /**
     * Every dish that belongs to a product, and every per-size override.
     *
     * Fetched unconditionally rather than after reading which options are
     * sized: knowing that needs the options back first, so making it wait
     * would turn one round trip into two on every menu render. Both are small
     * — a shop has tens of variants, not thousands.
     */
    supabase
      .from("meals")
      .select("id, name, price, is_available, product_id, options, variant_sort")
      .not("product_id", "is", null)
      .order("variant_sort"),
    supabase.from("modifier_option_prices").select("option_id, meal_id, price"),
  ]);

  const failure =
    groups.error ?? options.error ?? mealAttach.error ?? productAttach.error;
  if (failure) {
    console.error(
      `[modifiers] add-ons unreadable, so nothing is offered with any dish: ${failure.message}`
    );
    return { ...EMPTY, error: failure.message };
  }

  // Only now, with the add-on queries already answered.
  const stock = await makeable;

  /** The dishes of each product, in the order their sizes are offered. */
  const variantsOfProduct = new Map<string, VariantRow[]>();
  for (const v of (variantRows.data ?? []) as VariantRow[]) {
    if (!v.product_id) continue;
    const list = variantsOfProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsOfProduct.set(v.product_id, list);
  }

  /** option → dish → what that size costs on this option. */
  const overrideFor = new Map<string, number>();
  for (const r of (priceRows.data ?? []) as OptionPriceRow[]) {
    overrideFor.set(`${r.option_id}|${r.meal_id}`, Number(r.price));
  }

  /**
   * What the size chip says.
   *
   * The variant's own axis values — {"Size":"22oz"} gives "22oz" — because
   * that is what the menu already calls it and a second name for the same
   * thing is a second thing to keep in step. A dish with no axes at all falls
   * back to its name, which is at least true.
   */
  const sizeLabel = (v: VariantRow): string => {
    const values = Object.values(v.options ?? {}).filter(Boolean);
    return values.length > 0 ? values.join(" · ") : v.name;
  };

  const optionsByGroup = new Map<string, ModifierOption[]>();
  for (const o of (options.data ?? []) as unknown as OptionRow[]) {
    const list = optionsByGroup.get(o.group_id) ?? [];

    /* A sized option: its sizes are the product's own variants.

       Read, never copied. A drink sold both on the menu and as a combo add-on
       has its sizes written down once, so the day a third size is added the
       two cannot disagree about what is on offer. */
    const variants = o.option_product_id
      ? (variantsOfProduct.get(o.option_product_id) ?? []).map((v) => ({
          mealId: v.id,
          label: sizeLabel(v),
          /* The axis values, not just the label they join into.
             "Iced · 22oz" is one string for a receipt; this is the thing the
             picker takes apart, so a drink that comes Hot or Iced AND in
             three sizes is two rows of chips rather than six combinations
             the customer has to read through. */
          options: { ...(v.options ?? {}) },
          price: variantPrice(
            overrideFor.get(`${o.id}|${v.id}`) ?? null,
            o.price_override,
            v.price
          ),
          makeable: stock?.get(v.id) ?? null,
          available: v.is_available !== false,
          sort: v.variant_sort ?? 0,
        }))
      : undefined;

    list.push({
      id: o.id,
      label: o.label,
      mealId: o.option_meal_id,
      ...(variants && variants.length > 0 ? { variants } : {}),
      price: optionPrice(o.price_override, o.meals?.price ?? null),
      // Null, not zero, when there is no recipe: zero means "can't make any"
      // and would take a perfectly sellable add-on off the menu.
      makeable: o.option_meal_id ? (stock?.get(o.option_meal_id) ?? null) : null,
      available: o.meals?.is_available !== false,
      // 1 unless the owner said otherwise, which is every option that
      // existed before 0050 — a tick, exactly as it was.
      maxQty: Math.max(1, Number(o.max_qty) || 1),
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
