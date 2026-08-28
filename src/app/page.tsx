import { createClient } from "@/lib/supabase/server";
import { MenuList } from "@/components/menu-list";

type Meal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
};

async function getMenu(): Promise<{ menu: Meal[] | null; configured: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { menu: null, configured: false };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("meals")
      .select("id, name, price, description, categories")
      .eq("is_public", true)
      .eq("is_available", true)
      .order("name");

    if (error) throw error;
    return { menu: data as Meal[], configured: true };
  } catch (err) {
    console.error("Failed to load menu:", err);
    return { menu: null, configured: true };
  }
}

export default async function Home() {
  const { menu, configured } = await getMenu();

  const groups = new Map<string, Meal[]>();
  for (const meal of menu ?? []) {
    const category = meal.categories[0] || "Menu";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(meal);
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <section className="flex flex-col gap-4 pb-16">
        <h1 className="text-4xl font-semibold tracking-tight text-amber-950 dark:text-amber-50 sm:text-5xl">
          Fresh bakes, made daily.
        </h1>
        <p className="max-w-xl text-lg text-amber-800/80 dark:text-amber-100/70">
          Order ahead for pickup or delivery — everything on the menu is
          baked in-house, same day.
        </p>
      </section>

      <section id="menu" className="flex scroll-mt-16 flex-col gap-10">
        {!configured && (
          <p className="rounded-lg border border-dashed border-amber-300 bg-white/60 p-6 text-amber-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-amber-200">
            Menu setup in progress — connect Supabase (see{" "}
            <code>.env.example</code>) to show live items here.
          </p>
        )}
        {configured && groups.size === 0 && (
          <p className="rounded-lg border border-dashed border-amber-300 bg-white/60 p-6 text-amber-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-amber-200">
            Nothing on the menu yet — add meals in Supabase to have them
            show up here.
          </p>
        )}
        <MenuList groups={[...groups.entries()]} />
      </section>
    </main>
  );
}
