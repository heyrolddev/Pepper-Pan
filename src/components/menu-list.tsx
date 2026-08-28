"use client";

import { useCart } from "@/lib/cart-context";

type Meal = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  categories: string[];
};

export function MenuList({ groups }: { groups: [string, Meal[]][] }) {
  const { addItem } = useCart();

  return (
    <>
      {groups.map(([category, meals]) => (
        <div key={category} className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {category}
          </h2>
          <ul className="flex flex-col divide-y divide-amber-200/60 dark:divide-neutral-800">
            {meals.map((meal) => (
              <li
                key={meal.id}
                className="flex items-center justify-between gap-6 py-4"
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
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap font-medium text-amber-900 dark:text-amber-100">
                    ${Number(meal.price).toFixed(2)}
                  </span>
                  <button
                    onClick={() =>
                      addItem({ mealId: meal.id, name: meal.name, price: Number(meal.price) })
                    }
                    className="whitespace-nowrap rounded-full bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 transition-colors hover:bg-amber-800 dark:bg-amber-100 dark:text-amber-950 dark:hover:bg-amber-200"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
