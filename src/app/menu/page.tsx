import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { MenuList, type Meal } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";

async function getMenu(): Promise<{ menu: Meal[] | null; configured: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { menu: null, configured: false };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("meals")
      .select("id, name, price, description, categories, image_url")
      .eq("is_public", true)
      .eq("is_available", true)
      .order("name");

    if (error) throw error;

    // Ratings come from their own view; a menu with no reviews yet simply
    // renders without stars rather than failing.
    const { data: ratings } = await supabase
      .from("meal_ratings")
      .select("meal_id, avg_rating, review_count");

    const byMeal = new Map(
      ((ratings ?? []) as { meal_id: string; avg_rating: number; review_count: number }[]).map(
        (r) => [r.meal_id, r]
      )
    );

    const menu = (data as Meal[]).map((m) => ({
      ...m,
      avg_rating: byMeal.get(m.id) ? Number(byMeal.get(m.id)!.avg_rating) : null,
      review_count: byMeal.get(m.id)?.review_count ?? 0,
    }));

    return { menu, configured: true };
  } catch (err) {
    console.error("Failed to load menu:", err);
    return { menu: null, configured: true };
  }
}

const emptyStateClass =
  "rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80";

export default async function MenuPage() {
  const [{ menu, configured }, viewer] = await Promise.all([
    getMenu(),
    getViewer(),
  ]);
  const staff = isStaff(viewer);

  return (
    <main className="flex-1">
      {/* Compact, and with no scrolling banner under it. Both were earning
          their keep on the homepage, where the job is to make someone hungry.
          Here the customer is already hungry — they opened the menu — and
          every pixel above the first photo is a pixel of food they can't see
          yet. */}
      <PageHeader
        compact
        eyebrow="Fresh daily"
        title="The Menu"
        subtitle="Order ahead for pickup or delivery — everything made in-house, same day."
      />

      <section className="mx-auto max-w-6xl px-6 pb-14 pt-6">
        {!configured && (
          <p className={emptyStateClass}>
            Menu setup in progress — connect Supabase (see{" "}
            <code>.env.example</code>) to show live items here.
          </p>
        )}
        {configured && (!menu || menu.length === 0) && (
          <p className={emptyStateClass}>
            Nothing on the menu yet — add meals in Supabase to have them show
            up here.
          </p>
        )}
        {configured && menu && menu.length > 0 && <MenuList meals={menu} staff={staff} />}
      </section>
    </main>
  );
}
