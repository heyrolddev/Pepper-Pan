import { createClient } from "@/lib/supabase/server";
import { getViewer, isStaff } from "@/lib/auth";
import { MenuList, type Meal } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { loadAvailability } from "@/lib/costing-server";
import type { MenuCategory } from "@/lib/categories";
import { MenuSchema } from "@/components/menu-schema";
import { SHOP, siteUrl } from "@/lib/site";
import type { Metadata } from "next";

async function getMenu(): Promise<{
  menu: Meal[] | null;
  categories: MenuCategory[];
  configured: boolean;
}> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { menu: null, categories: [], configured: false };
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

    // How many the shelf can still make. Derived, never written back to
    // `is_available` — that switch is the owner's own "we've 86'd it today",
    // and a background process overwriting it would destroy an intent the
    // system can't tell apart from its own guess.
    const makeable = await loadAvailability();

    // The shop's categories and their colours. A failure here is not a reason
    // to fail the menu: `colourOf` works out a stable colour from the name
    // when there's no row, so the worst case is the owner's chosen colours
    // being replaced by sensible ones rather than a page that won't load.
    const { data: catRows } = await supabase
      .from("menu_categories")
      .select("name, colour, sort_order")
      .order("sort_order")
      .order("name");

    const menu = (data as Meal[]).map((m) => ({
      ...m,
      avg_rating: byMeal.get(m.id) ? Number(byMeal.get(m.id)!.avg_rating) : null,
      review_count: byMeal.get(m.id)?.review_count ?? 0,
      makeable: makeable.get(m.id) ?? null,
    }));

    return { menu, categories: (catRows ?? []) as MenuCategory[], configured: true };
  } catch (err) {
    console.error("Failed to load menu:", err);
    return { menu: null, categories: [], configured: true };
  }
}

/**
 * The page a customer lands on from a search, and until now the only public
 * page with no title of its own — it inherited the site default, so a result
 * for the menu looked identical to a result for the homepage.
 *
 * The description names the dishes and the town, because that is what the
 * search actually was. Nobody types "menu"; they type "black pepper noodles
 * apalit".
 */
export const metadata: Metadata = {
  title: "Menu",
  description: `The full ${SHOP.name} menu — Taiwan-style black pepper noodles, Ji Pai chicken, rice meals and milktea, made fresh daily in ${SHOP.locality}, ${SHOP.region}. Order ahead for pickup or delivery.`,
  alternates: { canonical: `${siteUrl()}/menu` },
  openGraph: {
    title: `Menu · ${SHOP.name}`,
    description: `Taiwan-style black pepper noodles, Ji Pai chicken, rice meals and milktea in ${SHOP.locality}. Order ahead for pickup or delivery.`,
    url: `${siteUrl()}/menu`,
    type: "website",
  },
};

const emptyStateClass =
  "rounded-3xl border-2 border-dashed border-brand-300 bg-cream-100 p-8 text-center text-ink-800/80";

export default async function MenuPage() {
  const [{ menu, categories, configured }, viewer] = await Promise.all([
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
        {configured && menu && menu.length > 0 && (
          <>
            <MenuSchema meals={menu} categories={categories} />
            <MenuList meals={menu} staff={staff} known={categories} />
          </>
        )}
      </section>
    </main>
  );
}
