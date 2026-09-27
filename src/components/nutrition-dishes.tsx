"use client";

import { useMemo, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import type { DishStatus, Rollout } from "@/lib/nutrition-rollout";

/**
 * Which dishes have a calorie count, and what is stopping the rest.
 *
 * "1 of 55 dishes have a complete figure" is a true sentence that leaves the
 * owner with nothing to do. Which one? And which of the other fifty-four is
 * closest — because that is the one worth ten minutes, and the difference
 * between a dish missing one ingredient and a dish missing six is the whole
 * decision.
 *
 * Three groups, because they need three different actions and lumping them
 * together is how "54 not showing" becomes a wall instead of a list:
 *
 *   SHOWING     nothing to do; here so the owner can check the number looks
 *               sane before fifty-four more join it.
 *   BLANK       missing ingredients, NAMED, fewest first. The list is the
 *               work, in the order worth doing it.
 *   NO RECIPE   nothing to compute from. Not a nutrition problem at all —
 *               a dish with no recipe also books no cost and never goes
 *               sold out, which is a bigger thing and belongs in Dish costs.
 *
 * Searchable because fifty-five is past the number anybody scans, and the
 * search runs over the missing ingredients too: type "garlic" and see every
 * dish it is holding up.
 */

type Tab = "blank" | "ready" | "none";

export function NutritionDishes({
  rollout,
  label = "See which dishes",
}: {
  rollout: Rollout;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("blank");
  const [q, setQ] = useState("");

  const groups: Record<Tab, { title: string; rows: DishStatus[] }> = useMemo(
    () => ({
      blank: { title: "Blank", rows: rollout.blocked },
      ready: { title: "Showing", rows: rollout.ready },
      none: { title: "No recipe", rows: rollout.noRecipe },
    }),
    [rollout]
  );

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = groups[tab].rows;
    if (!needle) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) ||
        // The missing lines too, so "garlic" finds everything it blocks.
        d.missing.some((m) => m.toLowerCase().includes(needle))
    );
  }, [groups, tab, needle]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // Open on whichever group has something worth looking at. A dialog
          // that opens on an empty tab reads as broken.
          setTab(
            rollout.blocked.length > 0
              ? "blank"
              : rollout.ready.length > 0
                ? "ready"
                : "none"
          );
          setOpen(true);
        }}
        className="shrink-0 rounded-full bg-ink-950/5 px-3.5 py-1.5 text-xs font-bold text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
      >
        {label} →
      </button>

      {open && (
        <AdminDialog
          wide
          title="Calories, dish by dish"
          subtitle="A dish shows a figure only once every ingredient in its recipe has one — including the ones inside its batches."
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["blank", "ready", "none"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    tab === t
                      ? t === "ready"
                        ? "bg-jade-600 text-cream-50"
                        : "bg-ink-950 text-cream-50"
                      : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                  }`}
                >
                  {groups[t].title}
                  <span className="ml-1.5 tabular-nums opacity-70">
                    {groups[t].rows.length}
                  </span>
                </button>
              ))}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a dish, or an ingredient…"
                aria-label="Search a dish, or an ingredient"
                className="ml-auto min-w-0 flex-1 rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-1.5 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600 sm:flex-none sm:w-56"
              />
            </div>

            {/* What this group MEANS, once, rather than a note on every row. */}
            <p className="text-xs leading-relaxed text-ink-800/55">
              {tab === "blank" &&
                "Closest to done at the top. The chips are what each one is still waiting for — fill those in under Inventory and the dish goes live on its own."}
              {tab === "ready" &&
                "These are what a customer sees right now, if the switch is on."}
              {tab === "none" &&
                "No recipe at all, so there is nothing to work a figure out from. That also means they book no cost and never go sold out — worth fixing in Dish costs for reasons bigger than calories."}
            </p>

            <div className="max-h-[52vh] overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-ink-950/15 p-5 text-center text-sm text-ink-800/55">
                  {needle
                    ? `Nothing here matches “${q.trim()}”.`
                    : "Nothing in this group."}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {rows.map((d) => (
                    <li
                      key={d.mealId}
                      className="rounded-xl bg-cream-100 px-3.5 py-2.5 ring-1 ring-ink-950/[0.07]"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 truncate text-sm font-bold text-ink-950">
                          {d.name}
                          {/* So "54 blank" is not read as 54 things a
                              customer is looking at. A hidden dish still
                              needs its figures — it is charged for and it
                              comes off the shelf — it is just not what
                              anybody reads a calorie count on. */}
                          {d.hidden && (
                            <span className="ml-1.5 whitespace-nowrap align-middle text-[9px] font-black uppercase tracking-wide text-ink-800/40">
                              not on the menu
                            </span>
                          )}
                        </span>
                        {tab === "ready" ? (
                          <span className="shrink-0 font-display text-sm font-black tabular-nums text-jade-700">
                            {d.kcal.toLocaleString("en-PH")} kcal
                            {/* Said, because it changes what the number
                                means: a typed figure is the owner's claim,
                                not the recipe's arithmetic. */}
                            {d.manual && (
                              <span className="ml-1.5 rounded-full bg-ink-950/[0.07] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-ink-800/60">
                                typed by hand
                              </span>
                            )}
                          </span>
                        ) : tab === "blank" ? (
                          <span className="shrink-0 text-[11px] font-black uppercase tracking-wide text-ink-800/45">
                            {d.missing.length} to go
                          </span>
                        ) : null}
                      </div>

                      {tab === "blank" && d.missing.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {[...new Set(d.missing)].map((m) => (
                            <span
                              key={m}
                              className="rounded-full bg-gold-400/25 px-2 py-0.5 text-[11px] font-bold text-ink-900"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-ink-800"
              >
                Close
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
