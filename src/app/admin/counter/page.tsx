import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CounterTill, type CounterMeal } from "@/components/counter-till";
import { shopToday } from "@/lib/format-date";
import { loadStockPicture } from "@/lib/costing-server";
import { loadModifiers } from "@/lib/modifiers-server";
import { loadNutrition } from "@/lib/nutrition-server";
import { isComplete, round } from "@/lib/nutrition";
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
    />
  );
}
