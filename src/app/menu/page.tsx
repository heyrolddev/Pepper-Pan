import { createClient } from "@/lib/supabase/server";
import { MenuList, type Meal } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { Marquee } from "@/components/marquee";

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
  const { menu, configured } = await getMenu();

  return (
    <main className="flex-1">
      <PageHeader
        eyebrow="Fresh daily"
        title="The Menu"
        subtitle="Order ahead for pickup or delivery — everything is made in-house, same day."
      />

      <Marquee
        className="border-b-4 border-ink-950 bg-gold-400 py-3 font-display text-lg font-black uppercase tracking-tight text-ink-950"
        trackClassName="marquee-track--fast"
        items={["Noodles", "Rice Meals", "Ji Pai", "Milktea", "Burgers", "Dim Sum"]}
        separator="🌶"
      />

      <section className="mx-auto max-w-6xl px-6 py-14">
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
        {configured && menu && menu.length > 0 && <MenuList meals={menu} />}
      </section>
    </main>
  );
}
