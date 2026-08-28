import { createClient } from "@/lib/supabase/server";
import { MenuList, type Meal } from "@/components/menu-list";

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
    return { menu: data as Meal[], configured: true };
  } catch (err) {
    console.error("Failed to load menu:", err);
    return { menu: null, configured: true };
  }
}

export default async function Home() {
  const { menu, configured } = await getMenu();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <section className="flex flex-col gap-4 pb-16">
        <h1 className="text-4xl font-semibold tracking-tight text-brand-950 dark:text-brand-50 sm:text-5xl">
          Taiwanese bites & milktea, made fresh daily.
        </h1>
        <p className="max-w-xl text-lg text-brand-800/80 dark:text-brand-100/70">
          Order ahead for pickup or delivery — everything on the menu is
          made in-house, same day.
        </p>
      </section>

      <section id="menu" className="scroll-mt-16">
        {!configured && (
          <p className="rounded-lg border border-dashed border-brand-300 bg-white/60 p-6 text-brand-700 dark:border-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
            Menu setup in progress — connect Supabase (see{" "}
            <code>.env.example</code>) to show live items here.
          </p>
        )}
        {configured && (!menu || menu.length === 0) && (
          <p className="rounded-lg border border-dashed border-brand-300 bg-white/60 p-6 text-brand-700 dark:border-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
            Nothing on the menu yet — add meals in Supabase to have them
            show up here.
          </p>
        )}
        {configured && menu && menu.length > 0 && <MenuList meals={menu} />}
      </section>
    </main>
  );
}
