import { getViewer, isStaff } from "@/lib/auth";
import { listBranches } from "@/lib/branches-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CounterTill, type CounterMeal } from "@/components/counter-till";
import { shopToday } from "@/lib/format-date";
import { loadStockPicture } from "@/lib/costing-server";
import { loadModifiers } from "@/lib/modifiers-server";
import { loadNutrition } from "@/lib/nutrition-server";
import { isComplete, round } from "@/lib/nutrition";
import type { Promo } from "@/lib/promos";

/** The promo row as the database hands it over. */
type PromoDbRow = {
  id: string;
  code: string | null;
  label: string;
  kind: string;
  value: number;
  scope: string;
  meal_id: string | null;
  min_spend: number;
  max_discount: number | null;
  max_uses: number | null;
  max_per_customer: number | null;
  starts_on: string | null;
  ends_on: string | null;
  online: boolean;
};
import { groupsFor } from "@/lib/modifiers";
import type { MenuCategory } from "@/lib/categories";

// The menu can be 86'd mid-service from the Menu screen; a cached till would
// go on selling what the kitchen just ran out of.
export const dynamic = "force-dynamic";

export default async function AdminCounterPage() {
  const viewer = await getViewer();
  if (!isStaff(viewer)) return null; // the layout already redirected

  const supabase = createAdminClient();
  const [{ data: meals, error }, { data: today }, { data: catRows }] = await Promise.all([
    supabase
      .from("meals")
      .select(
        "id, name, price, categories, is_public, is_available, product_id, code"
      )
      .order("name"),
    // What this till has already taken today, so whoever is on the counter can
    // see their own shift adding up rather than having to leave for the
    // dashboard and come back.
    supabase
      .from("orders")
      .select("revenue")
      .eq("tag", "walk-in")
      .eq("date", shopToday())
      .neq("status", "cancelled"),
    supabase
      .from("menu_categories")
      .select("name, colour, sort_order")
      .order("sort_order")
      .order("name"),
  ]);
  const categories = (catRows ?? []) as MenuCategory[];

  const { makeable, limits } = await loadStockPicture();

  /**
   * What each dish works out to, and whether the shop shows it at all.
   *
   * The receipt is customer-facing, so it obeys the same switch the menu
   * does — a shop that has deliberately kept calories off the menu must not
   * find them on the paper. Read here rather than in the component because
   * the till is a browser and this is a fact about the shop.
   *
   * Every dish, not just the ones on the tiles: an add-on's dish is usually
   * hidden from the menu, and without it the figure on a meal with a drink
   * in it would be wrong by the drink.
   */
  const [inside, { data: settingsRow }] = await Promise.all([
    loadNutrition(),
    supabase.from("settings").select("show_nutrition").eq("id", 1).maybeSingle(),
  ]);
  /**
   * The discounts a cashier may apply, as the owner defined them.
   *
   * Filtered to what is usable RIGHT NOW at the counter: running, in its
   * date window, and allowed here. The server checks every one of those
   * again when the sale is rung up — this is so the till does not show a
   * chip that refuses itself the moment it is tapped.
   *
   * Never a box to type an amount into. A till that takes a number off
   * whoever is standing at it is a till that leaks money.
   */
  const onDay = shopToday();
  const { data: promoRows } = await supabase
    .from("promos")
    .select(
      "id, code, label, kind, value, scope, meal_id, min_spend, max_discount, max_uses, max_per_customer, starts_on, ends_on, online, at_counter, is_active"
    )
    .eq("is_active", true)
    .eq("at_counter", true)
    .order("label");

  const counterPromos: Promo[] = ((promoRows ?? []) as PromoDbRow[])
    .filter(
      (p) =>
        (!p.starts_on || p.starts_on <= onDay) &&
        (!p.ends_on || p.ends_on >= onDay) &&
        /* A walk-in is not being delivered, so a delivery code can never
           apply here. Filtered out rather than shown and refused — and it
           also removes a trap: the mapping below used to read "anything
           that is not meal is order", which would have turned a code meant
           for the padala into one that comes off the FOOD. */
        p.scope !== "delivery"
    )
    .map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
      kind: p.kind === "amount" ? "amount" : "percent",
      value: Number(p.value),
      // Delivery is filtered out above, so the two remaining values are the
      // only ones this can be. Written out rather than inferred.
      scope: p.scope === "meal" ? "meal" : "order",
      mealId: p.meal_id,
      minSpend: Number(p.min_spend) || 0,
      maxDiscount: p.max_discount === null ? null : Number(p.max_discount),
      maxUses: p.max_uses === null ? null : Number(p.max_uses),
      maxPerCustomer:
        p.max_per_customer === null ? null : Number(p.max_per_customer),
      startsOn: p.starts_on,
      endsOn: p.ends_on,
      online: p.online !== false,
      atCounter: true,
      isActive: true,
    }));

  const nutritionByMeal = Object.fromEntries(
    [...inside.entries()]
      .filter(([, d]) => isComplete(d))
      .map(([id, d]) => [id, round(d.per)])
  );
  // The same add-ons the website offers, read the same way. A drink the
  // customer can pick online and not at the stall is the kind of difference
  // that only ever surfaces as an argument at the counter.
  const addOns = await loadModifiers(supabase, makeable);

  const rows: CounterMeal[] = ((meals ?? []) as (CounterMeal & {
    product_id: string | null;
  })[])
    .map((m) => ({
      ...m,
      makeable: makeable.get(m.id) ?? null,
      // Why, not just how many. A cashier with a customer in front of them
      // needs to know what to go and fetch or cook.
      limits: limits.get(m.id) ?? [],
      // The kitchen's own shorthand, printed on the receipt so the cook can
      // read a ticket without reading every name to the end.
      code: m.code ?? null,
      groups: groupsFor(m.id, m.product_id, addOns.byMeal, addOns.byProduct),
    }))
    .filter(
    // Sold out is sold out at the counter too — the whole point of 86ing
    // something is that nobody sells it. Hidden-from-the-website dishes stay,
    // because "not on the website" is often exactly the counter-only item.
    (m) => m.is_available
  );

  const takenToday = ((today ?? []) as { revenue: number }[]).reduce(
    (sum, o) => sum + (Number(o.revenue) || 0),
    0
  );
  const salesToday = (today ?? []).length;

  // The places this till could be selling for. Two rows; read once here
  // rather than inside the client component, which has no database.
  const branches = await listBranches();

  return (
    <CounterTill
      known={categories}
      meals={rows}
      loadError={error?.message ?? null}
      takenToday={takenToday}
      salesToday={salesToday}
      staffName={viewer!.profile?.full_name?.trim() || viewer!.email}
      nutritionByMeal={nutritionByMeal}
      showNutrition={settingsRow?.show_nutrition === true}
      promos={counterPromos}
      branches={branches}
      pinnedBranch={viewer!.profile?.branch_id ?? null}
    />
  );
}
