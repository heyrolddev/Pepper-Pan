import { createClient } from "@/lib/supabase/server";
import type { AdminMeal } from "@/components/meal-editor";
import { AdminMenuList } from "@/components/admin-menu-list";
import { NewMealForm } from "@/components/new-meal-form";

export default async function AdminMenuPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meals")
    .select("id, name, price, description, categories, image_url, is_public, is_available")
    .order("name");

  const meals = (data ?? []) as AdminMeal[];
  const hidden = meals.filter((m) => !m.is_public || !m.is_available).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black text-ink-950">
            Menu ({meals.length})
          </h2>
          <p className="mt-1 text-sm text-ink-800/60">
            {hidden} item{hidden === 1 ? "" : "s"} hidden from customers
          </p>
        </div>
        <NewMealForm />
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          Could not load the menu: {error.message}
        </p>
      )}

      <AdminMenuList meals={meals} />
    </div>
  );
}
