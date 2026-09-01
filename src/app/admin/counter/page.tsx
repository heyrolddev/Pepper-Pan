import { getViewer, isStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CounterTill, type CounterMeal } from "@/components/counter-till";
import { shopToday } from "@/lib/format-date";
import { loadAvailability } from "@/lib/costing-server";
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
      .select("id, name, price, categories, is_public, is_available")
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

  const makeable = await loadAvailability();
  const rows: CounterMeal[] = ((meals ?? []) as CounterMeal[])
    .map((m) => ({ ...m, makeable: makeable.get(m.id) ?? null }))
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
    />
  );
}
