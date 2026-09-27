"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/reduced-motion";
import { addedKcal, splitOf, type OrderNutrition } from "@/lib/order-nutrition";

/**
 * What is going in the basket, drawn rather than written.
 *
 * ── Why it is not a line of text ────────────────────────────────────────
 *
 * "742 kcal · 38P 61C 37F" is four facts in a row with no shape, and the
 * shape is most of the information: whether a meal is mostly carbohydrate,
 * whether the drink just added half the energy again, whether the number is
 * big for this menu or ordinary. A row of digits makes the reader do all of
 * that themselves; a ring and a bar hand it to them at a glance.
 *
 * ── What it has to be honest about ──────────────────────────────────────
 *
 * The figure moves as the customer ticks things. That is the whole reason
 * this exists in the dialog rather than only on the card — the card can say
 * what a Black Pepper Chicken Noodles is, and only this can say what the
 * one being bought is, with the extra rice and the milktea in it. So the
 * total is the loud number, the dish's own figure stays visible underneath
 * it, and every add-on that moved it is listed by name.
 *
 * An add-on with no figure behind it is named too, and the total is marked
 * as a floor rather than a total. A quietly-skipped extra renders a number
 * that looks authoritative and is low by exactly the thing nobody filled
 * in — the same bug as a half-filled recipe, one layer up.
 *
 * ── The motion ──────────────────────────────────────────────────────────
 *
 * The kcal figure counts to its new value over 400ms and the bar slides
 * with it, so ticking a drink reads as "this added something" rather than
 * as a number that was always there. Under `prefers-reduced-motion` it
 * simply lands on the answer — the animation is a way of showing the
 * change, not the only way, so removing it costs nothing.
 */

/** Fixed across every dish: the bar is only readable if protein is always
 *  the same colour, so it does NOT take the category's. */
const MACROS = [
  { key: "protein", label: "Protein", bar: "bg-ocean-600", dot: "bg-ocean-600" },
  { key: "carbs", label: "Carbs", bar: "bg-gold-400", dot: "bg-gold-400" },
  { key: "fat", label: "Fat", bar: "bg-chili-500", dot: "bg-chili-500" },
] as const;

/** Counts to a new value, or lands on it when motion is not wanted. */
function useCountUp(to: number, still: boolean) {
  const [shown, setShown] = useState(to);
  const from = useRef(to);
  useEffect(() => {
    if (still || from.current === to) {
      from.current = to;
      setShown(to);
      return;
    }
    const start = performance.now();
    const was = from.current;
    from.current = to;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      // Ease out: fast enough to feel like a response, settled enough to read.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(was + (to - was) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, still]);
  return shown;
}

export function NutritionPanel({ n }: { n: OrderNutrition }) {
  const still = usePrefersReducedMotion();
  const split = splitOf(n.total);
  const added = addedKcal(n);
  const kcal = useCountUp(n.total.kcal, still);

  const grams: Record<string, number> = {
    protein: n.total.protein,
    carbs: n.total.carbs,
    fat: n.total.fat,
  };

  return (
    <section
      aria-label="What's in this"
      className="overflow-hidden rounded-2xl bg-ink-950 text-cream-50 ring-1 ring-ink-950/10"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pb-3 pt-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cream-50/45">
            {added > 0 ? "Your order" : "This dish"}
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-black leading-none tabular-nums">
              {kcal.toLocaleString("en-PH")}
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-cream-50/50">
              kcal
            </span>
          </p>
          {/* The dish on its own stays visible. Without it, a customer who
              ticks a drink sees one number become another with nothing
              saying which part was the food. */}
          {added > 0 && (
            <p className="mt-0.5 text-[11px] font-semibold text-cream-50/45">
              {n.dish.kcal.toLocaleString("en-PH")} the dish
              <span className="mx-1 text-gold-400">+</span>
              <span className="font-bold text-gold-400">
                {added.toLocaleString("en-PH")} added
              </span>
            </p>
          )}
        </div>

        {/* The macros as figures, beside the bar that weights them. Grams
            and share answer different questions — "how much protein" and
            "is this a carb meal" — and neither substitutes for the other. */}
        <ul className="flex shrink-0 gap-3">
          {MACROS.map((m) => (
            <li key={m.key} className="text-right">
              <span className="flex items-center justify-end gap-1">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                <span className="text-[9px] font-black uppercase tracking-wide text-cream-50/45">
                  {m.label}
                </span>
              </span>
              <span className="block font-display text-sm font-black tabular-nums">
                {grams[m.key].toLocaleString("en-PH")}
                <span className="ml-0.5 text-[10px] font-bold text-cream-50/45">g</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Three segments that always fill the bar exactly — the split is
          computed from the macros' own energy, so a rounded label can never
          leave a gap. */}
      <div
        className="flex h-1.5 w-full overflow-hidden bg-cream-50/10"
        role="img"
        aria-label={`${split.protein}% protein, ${split.carbs}% carbohydrate, ${split.fat}% fat by energy`}
      >
        {MACROS.map((m) => (
          <span
            key={m.key}
            className={`${m.bar} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
            style={{ width: `${split[m.key]}%` }}
          />
        ))}
      </div>

      {/* ── what moved it ──────────────────────────────────────────────
          Named and priced in calories, because "your order is 1,321" with
          no breakdown leaves the customer unable to act on it. Seeing that
          the milktea is 339 is what lets them swap it for an americano. */}
      {(n.extras.length > 0 || n.uncounted.length > 0) && (
        <ul className="flex flex-col gap-1 border-t border-cream-50/10 px-4 py-2.5">
          {n.extras.map((e) => (
            <li
              key={e.label}
              className="flex items-baseline justify-between gap-3 text-[11px]"
            >
              <span className="min-w-0 truncate font-semibold text-cream-50/65">
                {e.qty > 1 && (
                  <span className="mr-1 font-black tabular-nums text-cream-50/45">
                    {e.qty}×
                  </span>
                )}
                {e.label}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-gold-400">
                +{e.per.kcal.toLocaleString("en-PH")}
              </span>
            </li>
          ))}
          {n.uncounted.length > 0 && (
            <li className="pt-0.5 text-[10px] leading-relaxed text-cream-50/45">
              {/* The total is a floor, and says so. */}
              At least — {n.uncounted.join(", ")}{" "}
              {n.uncounted.length === 1 ? "has" : "have"} no figures yet, so{" "}
              {n.uncounted.length === 1 ? "it is" : "they are"} not in this.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
