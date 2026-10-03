"use client";

import { useState, useTransition } from "react";
import { setMealOfferedAt } from "@/app/admin/menu/branch-actions";
import { type Branch } from "@/lib/branches";

/**
 * Which branches offer this dish.
 *
 * Chips rather than a dropdown: the set is small, and "is this on at the
 * booth" should be readable without opening anything. A dish offered
 * nowhere is drawn as such rather than hidden — it is a real state, it
 * happens the moment somebody unticks the last branch, and a dish that
 * silently disappears from every menu is the worst way to find out.
 */
export function OfferedAt({
  mealId,
  branches,
  offered,
}: {
  mealId: string;
  branches: Branch[];
  offered: string[];
}) {
  const [on, setOn] = useState<string[]>(offered);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(branchId: string) {
    const next = on.includes(branchId);
    // Moved locally first so the tap lands during service; put back below
    // if the server refuses, because a chip showing a branch that is not
    // actually selling the dish is how an order gets taken for nothing.
    setOn((cur) => (next ? cur.filter((b) => b !== branchId) : [...cur, branchId]));
    setError(null);
    startTransition(async () => {
      const res = await setMealOfferedAt({ mealId, branchId, offered: !next });
      if (res.error) {
        setOn((cur) => (next ? [...cur, branchId] : cur.filter((b) => b !== branchId)));
        setError(res.error);
      }
    });
  }

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1">
      {branches.map((b) => {
        const active = on.includes(b.id);
        return (
          <button
            key={b.id}
            onClick={toggle.bind(null, b.id)}
            disabled={pending}
            aria-pressed={active}
            title={active ? `Offered at ${b.name}` : `Not offered at ${b.name}`}
            className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
              active
                ? "bg-ink-950 text-cream-50"
                : "bg-ink-950/[0.06] text-ink-800/45 line-through"
            }`}
          >
            {b.isMain ? "Apalit" : b.name.replace(/^Pepper Pan Express\s*—\s*/, "")}
          </button>
        );
      })}
      {on.length === 0 && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-brand-700">
          On no menu
        </span>
      )}
      {error && (
        <span className="w-full text-xs font-semibold text-brand-700">{error}</span>
      )}
    </span>
  );
}
