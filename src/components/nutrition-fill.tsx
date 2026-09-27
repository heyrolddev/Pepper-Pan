"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import {
  applyNutritionFill,
  planNutritionFill,
  type NutritionPlan,
} from "@/app/admin/inventory/actions";

/**
 * Calories for the whole shelf, in one look and one tap.
 *
 * `ingredients` has had four nutrition columns since 0055 and every one of
 * them is null, because filling them means looking up pork belly, then
 * cabbage, then soy sauce, eighty times over. Nobody was ever going to, so no
 * dish ever reached "nothing missing", so no dish ever showed a calorie count
 * and the whole feature sat there doing nothing. The blocker was never the
 * software — it was eighty lookups.
 *
 * Two screens, deliberately, and the first one is read-only. Eighty rows is
 * exactly the number at which "fill everything" stops being a convenience and
 * becomes a thing that happened to the shop's data without anybody seeing it.
 * So: here is what it would do, in full, and then you decide.
 *
 * Nothing already filled in is ever touched. A figure typed off a real packet
 * beats a published average for a generic ingredient every time.
 */
export function NutritionFill() {
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const open = () =>
    start(async () => {
      setError(null);
      setDone(null);
      setPlan(await planNutritionFill());
    });

  const apply = () => {
    if (!plan) return;
    start(async () => {
      const r = await applyNutritionFill(plan.ready.map((row) => row.id));
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      setDone(r.filled ?? 0);
      setPlan(null);
    });
  };

  return (
    <>
      <button
        onClick={open}
        disabled={busy}
        className="rounded-xl bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-950 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50 disabled:opacity-50"
      >
        {busy && !plan ? "Checking…" : "Fill calories from the reference"}
      </button>

      {done !== null && (
        <p className="mt-2 rounded-xl bg-jade-600/15 px-4 py-2.5 text-sm font-bold text-jade-700">
          {done === 0
            ? "Nothing needed filling."
            : `Filled ${done} ingredient${done === 1 ? "" : "s"}. Dishes whose whole recipe is now covered will show calories.`}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {plan && (
        <AdminDialog
          wide
          title="Fill calories from the reference"
          subtitle="Published averages for raw ingredients — a starting point, not a measurement of your own supplier. Every figure stays editable afterwards."
          onClose={() => setPlan(null)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            {plan.ready.length === 0 && plan.needsYou.length === 0 && plan.unknown.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-ink-950/15 p-5 text-sm text-ink-800/60">
                Every ingredient already has its figures. Nothing to do.
              </p>
            ) : (
              <>
                {plan.ready.length > 0 && (
                  <section>
                    <h4 className="font-display text-base font-black text-ink-950">
                      {plan.ready.length} will be filled
                    </h4>
                    <div className="mt-2 max-h-[40vh] overflow-y-auto pr-1">
                      <ul className="flex flex-col gap-1.5">
                        {plan.ready.map((row) => (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-cream-100 px-3 py-2 ring-1 ring-ink-950/[0.07]"
                          >
                            <span className="min-w-0 text-sm">
                              <strong className="font-bold text-ink-950">{row.name}</strong>
                              <span className="ml-2 text-xs text-ink-800/50">
                                read as {row.food}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-bold tabular-nums text-ink-800/70">
                              {row.kcal} kcal · {row.protein}P · {row.carbs}C · {row.fat}F
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

                {/* Named rather than counted. "12 need your help" is a number
                    somebody nods at; a list of twelve names is twelve things
                    they can actually go and do. */}
                {plan.needsYou.length > 0 && (
                  <section className="rounded-2xl bg-gold-400/20 px-4 py-3">
                    <h4 className="text-sm font-black text-ink-950">
                      {plan.needsYou.length} need you to say the portion size
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-ink-800/65">
                      The reference has these, but per 100 g — and you count them in
                      pieces. Only you know what one weighs, so open each and fill it in.
                    </p>
                    <p className="mt-2 text-xs font-bold text-ink-800/70">
                      {plan.needsYou.map((r) => `${r.name} (${r.unit})`).join(", ")}
                    </p>
                  </section>
                )}

                {plan.unknown.length > 0 && (
                  <section className="rounded-2xl bg-ink-950/[0.04] px-4 py-3">
                    <h4 className="text-sm font-black text-ink-800/70">
                      {plan.unknown.length} not in the reference
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-ink-800/55">
                      Nothing in the table answers to these names. Type their figures off
                      the packet, or rename them closer to what they are.
                    </p>
                    <p className="mt-2 text-xs font-bold text-ink-800/60">
                      {plan.unknown.map((r) => r.name).join(", ")}
                    </p>
                  </section>
                )}

                {plan.alreadyDone > 0 && (
                  <p className="text-xs text-ink-800/50">
                    {plan.alreadyDone} already {plan.alreadyDone === 1 ? "has" : "have"} figures
                    and {plan.alreadyDone === 1 ? "is" : "are"} left exactly as{" "}
                    {plan.alreadyDone === 1 ? "it is" : "they are"} — what you typed off a
                    real packet beats an average for a generic ingredient.
                  </p>
                )}
              </>
            )}

            {plan.ready.length > 0 && (
              <button
                onClick={apply}
                disabled={busy}
                className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
              >
                {busy ? "Filling…" : `Fill these ${plan.ready.length}`}
              </button>
            )}
          </div>
        </AdminDialog>
      )}
    </>
  );
}
