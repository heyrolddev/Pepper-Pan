"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminSearch } from "@/components/admin-search";
import { setMealAvailability } from "@/app/admin/menu/actions";
import type { AdminMeal } from "@/components/meal-editor";

/**
 * The menu, for someone who may only say what has run out.
 *
 * Not the owner's editor with the fields greyed out — a form full of things
 * you can't touch invites you to try, and every attempt is a refusal to read.
 * This is a different screen with one control on it, which is the only control
 * this role has: on, or sold out.
 *
 * Prices are absent rather than shown-and-locked, deliberately. The owner
 * asked to keep them off the staff side, and a disabled input still displays
 * the number.
 */
export function MenuAvailability({ meals }: { meals: AdminMeal[] }) {
  return (
    <AdminSearch
      rows={meals}
      searchText={(m) =>
        [
          m.name,
          ...(m.categories ?? []),
          m.is_available ? "available on" : "sold out unavailable",
        ]
          .filter(Boolean)
          .join(" ")
      }
      noun="dish"
      placeholder="Search the menu…"
    >
      {(filtered, query) =>
        filtered.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {filtered.map((m) => (
              <li key={m.id}>
                <Row meal={m} />
              </li>
            ))}
          </ul>
        )
      }
    </AdminSearch>
  );
}

function Row({ meal }: { meal: AdminMeal }) {
  const router = useRouter();
  // Held locally as well as on the server so the tap lands immediately. A
  // toggle that waits for a round trip during service gets pressed twice.
  const [on, setOn] = useState(meal.is_available);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const res = await setMealAvailability(meal.id, next);
      if (res.error) {
        // Put it back. Showing it as done when the server refused is how the
        // shop keeps selling something it has already run out of.
        setOn(!next);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 transition-colors ${
        on ? "bg-cream-100 ring-ink-950/10" : "bg-brand-600/10 ring-brand-600/25"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink-950">
          {meal.name}
        </span>
        <span className="text-xs text-ink-800/50">
          {!meal.is_public
            ? "Not on the customer menu"
            : on
              ? "On the menu"
              : "Sold out — customers can't order it"}
        </span>
        {error && (
          <span className="mt-1 block text-xs font-semibold text-brand-700">
            {error}
          </span>
        )}
      </span>
      <button
        onClick={toggle}
        disabled={pending}
        aria-pressed={!on}
        className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
          on
            ? "bg-ink-950/5 text-ink-800/60 hover:bg-brand-600 hover:text-cream-50"
            : "bg-brand-600 text-cream-50 hover:bg-brand-700"
        }`}
      >
        {on ? "Mark sold out" : "Sold out"}
      </button>
    </div>
  );
}
