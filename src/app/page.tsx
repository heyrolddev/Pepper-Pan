import { createClient } from "@/lib/supabase/server";

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
    <div className="flex flex-1 flex-col bg-amber-50 dark:bg-neutral-950">
      <header className="border-b border-amber-200/60 dark:border-neutral-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <span className="text-xl font-semibold tracking-tight text-amber-900 dark:text-amber-100">
            Pepper Pan
          </span>
          <a
            href="#menu"
            className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
          >
            See the menu
          </a>
        </div>
      </header>

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
          {[...groups.entries()].map(([category, meals]) => (
            <div key={category} className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                {category}
              </h2>
              <ul className="flex flex-col divide-y divide-amber-200/60 dark:divide-neutral-800">
                {meals.map((meal) => (
                  <li
                    key={meal.id}
                    className="flex items-start justify-between gap-6 py-4"
                  >
                    <div>
                      <p className="font-medium text-amber-950 dark:text-amber-50">
                        {meal.name}
                      </p>
                      {meal.description && (
                        <p className="mt-1 text-sm text-amber-800/70 dark:text-amber-100/60">
                          {meal.description}
                        </p>
                      )}
                    </div>
                    <span className="whitespace-nowrap font-medium text-amber-900 dark:text-amber-100">
                      ${Number(meal.price).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-amber-200/60 py-8 text-center text-sm text-amber-700/70 dark:border-neutral-800 dark:text-amber-200/50">
        © {new Date().getFullYear()} Pepper Pan
      </footer>
    </div>
  );
}
