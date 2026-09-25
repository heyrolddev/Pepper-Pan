"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setShowNutrition } from "@/app/admin/menu/actions";

/**
 * The master switch for calories on the customer menu.
 *
 * Says what is actually true underneath rather than just on/off. A shop that
 * has filled in three ingredients out of forty turns this on and sees
 * nothing change, because a dish only shows a figure once EVERY ingredient in
 * its recipe has one — and without the count beside the switch that reads as
 * a broken toggle rather than as work still to do.
 */
export function NutritionSwitch({
  on,
  ready,
  total,
}: {
  on: boolean;
  /** Dishes with a complete figure. */
  ready: number;
  /** Dishes on the menu. */
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const flip = () =>
    start(async () => {
      const r = await setShowNutrition(!on);
      if (r.error) return setError(r.error);
      setError(null);
      router.refresh();
    });

  return (
    <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-base font-black text-ink-950">
            Calories on the menu
          </p>
          <p className="mt-0.5 text-sm text-ink-800/60">
            {ready === 0
              ? "No dish has a complete figure yet. Fill in what's in each ingredient under Inventory — a dish stays blank until everything in its recipe is filled in."
              : `${ready} of ${total} dishes have a complete figure. The rest stay blank rather than showing a total that's too low.`}
          </p>
        </div>
        <button
          onClick={flip}
          disabled={pending}
          role="switch"
          aria-checked={on}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors disabled:opacity-50 ${
            on ? "bg-jade-600 text-cream-50" : "bg-ink-950/10 text-ink-800"
          }`}
        >
          {on ? "✓ Showing" : "Hidden"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-brand-700">{error}</p>}
    </div>
  );
}
