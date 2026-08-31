"use client";

import { useMemo, useState } from "react";
import { peso, FOOD_COST_TARGET, type Margin } from "@/lib/costing";

export type DishLine = {
  label: string;
  kind: "ingredient" | "batch" | "meal";
  qty: number;
  unit: string;
  unitCost: number;
  cost: number;
  problem: string | null;
};

export type DishRow = {
  id: string;
  name: string;
  price: number;
  categories: string[];
  onMenu: boolean;
  available: boolean;
  cost: number;
  costed: boolean;
  gross: number;
  foodCostPct: number | null;
  verdict: Margin["verdict"];
  problems: string[];
  lines: DishLine[];
};

/**
 * What every dish earns, and where the money went.
 *
 * The one number this whole screen exists to show is food cost: how much of
 * the price the customer pays is already spent before you've turned the gas
 * on. It's shown three ways on purpose — as a bar you can read across the
 * whole list without reading any of it, as a percentage, and as pesos — because
 * "30%" and "₱54 of ₱179" land differently on different days.
 *
 * Sorted worst-first by default. A list of 72 dishes sorted by name is a
 * reference; sorted by what's bleeding, it's a to-do list.
 */

const TONES: Record<
  Margin["verdict"],
  { bar: string; chip: string; label: string; blurb: string }
> = {
  losing: {
    bar: "bg-brand-600",
    chip: "bg-brand-600 text-cream-50",
    label: "Losing money",
    blurb: "Costs more to make than it sells for.",
  },
  tight: {
    bar: "bg-chili-500",
    chip: "bg-chili-500 text-cream-50",
    label: "Tight",
    blurb: "Ingredients eat over 40% of the price.",
  },
  ok: {
    bar: "bg-gold-400",
    chip: "bg-gold-400 text-ink-950",
    label: "Fine",
    blurb: "Around the usual target for street food.",
  },
  great: {
    bar: "bg-jade-500",
    chip: "bg-jade-500 text-cream-50",
    label: "Strong",
    blurb: "Ingredients are under a quarter of the price.",
  },
  unknown: {
    bar: "bg-ink-950/20",
    chip: "bg-ink-950/10 text-ink-800/70",
    label: "No recipe",
    blurb: "Nothing has been entered for this dish yet.",
  },
};

type Sort = "worst" | "best" | "profit" | "price" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "worst", label: "Worst first" },
  { key: "best", label: "Best first" },
  { key: "profit", label: "Most profit" },
  { key: "price", label: "Price" },
  { key: "name", label: "A–Z" },
];

type Filter = "all" | "attention" | "menu" | "uncosted";

/** One dish's price, split into what it cost and what's left. */
function CostBar({ dish }: { dish: DishRow }) {
  const tone = TONES[dish.verdict];
  if (!dish.costed || dish.foodCostPct === null) {
    return (
      <div className="h-2.5 w-full rounded-full bg-ink-950/10" aria-hidden />
    );
  }
  // Capped so a dish costing three times its price still draws a bar rather
  // than a segment running off the card — the red and the "Losing money" chip
  // already say it's past the end.
  const filled = Math.min(dish.foodCostPct, 100);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-jade-500/25">
      <div
        className={`h-full rounded-full ${tone.bar} transition-[width] duration-500`}
        style={{ width: `${filled}%` }}
      />
      {/* Where food cost is supposed to land. A bar with no target is a bar
          you can only compare against other bars. */}
      <div
        className="absolute inset-y-0 w-px bg-ink-950/40"
        style={{ left: `${FOOD_COST_TARGET}%` }}
        aria-hidden
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "plain" | "good" | "warn" | "bad";
}) {
  const skin = {
    plain: "bg-cream-100 text-ink-950 ring-ink-950/10",
    good: "bg-jade-600 text-cream-50 ring-jade-700/30",
    warn: "bg-gold-400 text-ink-950 ring-gold-600/30",
    bad: "bg-brand-600 text-cream-50 ring-brand-700/30",
  }[tone];
  return (
    <div className={`rounded-3xl p-4 ring-1 sm:p-5 ${skin}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 sm:text-[11px]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black tabular-nums sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-snug opacity-70 sm:text-xs">{sub}</p>
    </div>
  );
}

export function DishCosts({
  dishes,
  failed,
}: {
  dishes: DishRow[];
  failed: string[];
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("worst");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const summary = useMemo(() => {
    const costed = dishes.filter((d) => d.costed && d.price > 0);
    const uncosted = dishes.filter((d) => !d.costed);
    const attention = dishes.filter(
      (d) => d.verdict === "losing" || d.verdict === "tight"
    );
    // Averaged across dishes rather than weighted by sales: this is a menu
    // question ("are my recipes priced right"), not a takings question. The
    // Analytics screen is where sales weight belongs.
    const avg =
      costed.length > 0
        ? costed.reduce((s, d) => s + (d.foodCostPct ?? 0), 0) / costed.length
        : null;
    const best = [...costed].sort((a, b) => b.gross - a.gross)[0] ?? null;
    return { costed, uncosted, attention, avg, best };
  }, [dishes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = dishes.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q) &&
          !d.categories.some((c) => c.toLowerCase().includes(q))) return false;
      if (filter === "attention")
        return d.verdict === "losing" || d.verdict === "tight";
      if (filter === "menu") return d.onMenu;
      if (filter === "uncosted") return !d.costed;
      return true;
    });

    // Dishes with no recipe have no percentage to sort by, so they sit at the
    // end of every money ordering rather than pretending to be 0%.
    const bucket = (d: DishRow) => (d.costed && d.price > 0 ? 0 : 1);
    list = [...list].sort((a, b) => {
      const ba = bucket(a) - bucket(b);
      if (ba !== 0) return ba;
      switch (sort) {
        case "worst":
          return (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0);
        case "best":
          return (a.foodCostPct ?? 0) - (b.foodCostPct ?? 0);
        case "profit":
          return b.gross - a.gross;
        case "price":
          return b.price - a.price;
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [dishes, query, sort, filter]);

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "Every dish", n: dishes.length },
    { key: "attention", label: "Needs a look", n: summary.attention.length },
    { key: "menu", label: "On the menu", n: dishes.filter((d) => d.onMenu).length },
    { key: "uncosted", label: "No recipe", n: summary.uncosted.length },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Dish costs</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          What each dish costs you to make, worked out from the recipes and
          ingredient prices you&apos;ve already entered — and what&apos;s left
          over once it&apos;s sold.
        </p>
      </div>

      {failed.length > 0 && (
        <p className="rounded-2xl bg-brand-600 px-5 py-4 text-sm text-cream-50">
          <strong>Couldn&apos;t read {failed.join(", ")}.</strong> The costs
          below are missing whatever was in there — treat them as wrong until
          this loads.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Average food cost"
          value={summary.avg === null ? "—" : `${summary.avg.toFixed(1)}%`}
          sub={
            summary.avg === null
              ? "Nothing costed yet"
              : summary.avg <= FOOD_COST_TARGET
                ? `Under the ${FOOD_COST_TARGET}% target`
                : `Target is around ${FOOD_COST_TARGET}%`
          }
          tone={
            summary.avg === null
              ? "plain"
              : summary.avg <= FOOD_COST_TARGET
                ? "good"
                : summary.avg <= 40
                  ? "warn"
                  : "bad"
          }
        />
        <Stat
          label="Needs a look"
          value={String(summary.attention.length)}
          sub={
            summary.attention.length === 0
              ? "Nothing is priced badly"
              : "Losing money, or over 40% food cost"
          }
          tone={summary.attention.length === 0 ? "plain" : "warn"}
        />
        <Stat
          label="Best earner"
          value={summary.best ? peso(summary.best.gross, 0) : "—"}
          sub={summary.best ? summary.best.name : "Nothing costed yet"}
        />
        <Stat
          label="Costed"
          value={`${summary.costed.length}/${dishes.length}`}
          sub={
            summary.uncosted.length === 0
              ? "Every dish has a recipe"
              : `${summary.uncosted.length} still need${summary.uncosted.length === 1 ? "s" : ""} a recipe`
          }
          tone={summary.uncosted.length === 0 ? "plain" : "warn"}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filter === f.key
                  ? "bg-ink-950 text-cream-50"
                  : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
              }`}
            >
              {f.label}
              <span
                className={`ml-2 tabular-nums ${
                  filter === f.key ? "opacity-60" : "opacity-40"
                }`}
              >
                {f.n}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a dish…"
            className="min-w-0 flex-1 rounded-xl bg-cream-100 px-4 py-2.5 text-sm text-ink-950 ring-1 ring-ink-950/10 placeholder:text-ink-800/40 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <div className="flex flex-wrap gap-1.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  sort === s.key
                    ? "bg-gold-400 text-ink-950"
                    : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
          {query
            ? `Nothing matches “${query}”.`
            : "Nothing in this group."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((d) => {
            const tone = TONES[d.verdict];
            const isOpen = open === d.id;
            return (
              <li
                key={d.id}
                className="overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : d.id)}
                  aria-expanded={isOpen}
                  className="w-full px-5 py-4 text-left transition-colors hover:bg-cream-200/60"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-black leading-tight text-ink-950">
                        {d.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-800/50">
                        {d.categories.length > 0 && <span>{d.categories.join(" · ")}</span>}
                        {!d.onMenu && (
                          <span className="rounded-full bg-ink-950/10 px-2 py-0.5 font-bold">
                            Hidden
                          </span>
                        )}
                        {d.onMenu && !d.available && (
                          <span className="rounded-full bg-ink-950/10 px-2 py-0.5 font-bold">
                            Sold out
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${tone.chip}`}
                    >
                      {tone.label}
                      {d.foodCostPct !== null && (
                        <span className="ml-1.5 tabular-nums opacity-80">
                          {d.foodCostPct.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Price → cost → keep, in the order the money moves. */}
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="text-sm text-ink-800/60">
                      Sells for{" "}
                      <strong className="font-display text-base text-ink-950 tabular-nums">
                        {peso(d.price, 0)}
                      </strong>
                    </span>
                    <span className="text-sm text-ink-800/60">
                      Ingredients{" "}
                      <strong className="font-display text-base tabular-nums text-ink-950">
                        {d.costed ? peso(d.cost) : "—"}
                      </strong>
                    </span>
                    <span className="text-sm text-ink-800/60">
                      You keep{" "}
                      <strong
                        className={`font-display text-base tabular-nums ${
                          d.gross < 0 ? "text-brand-600" : "text-jade-700"
                        }`}
                      >
                        {d.costed ? peso(d.gross) : "—"}
                      </strong>
                    </span>
                  </div>

                  <div className="mt-3">
                    <CostBar dish={d} />
                    <p className="mt-1.5 text-xs text-ink-800/45">
                      {tone.blurb}
                      {d.problems.length > 0 && (
                        <span className="ml-1 font-bold text-chili-700">
                          · {d.problems.length} thing
                          {d.problems.length === 1 ? "" : "s"} to fix
                        </span>
                      )}
                      <span className="ml-2 opacity-60">
                        {isOpen ? "Hide recipe" : "See recipe"}
                      </span>
                    </p>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-ink-950/10 bg-cream-50/70 px-5 py-4">
                    {d.problems.length > 0 && (
                      <ul className="mb-4 flex flex-col gap-1 rounded-2xl bg-chili-500/10 px-4 py-3">
                        {d.problems.map((p) => (
                          <li key={p} className="text-xs font-semibold text-chili-700">
                            ⚠ {p}
                          </li>
                        ))}
                      </ul>
                    )}

                    {d.lines.length === 0 ? (
                      <p className="text-sm text-ink-800/60">
                        No recipe entered. Until there is one, this dish
                        can&apos;t be costed — and it isn&apos;t counted in the
                        average above.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                          <thead>
                            <tr className="text-left text-[11px] font-black uppercase tracking-widest text-ink-800/40">
                              <th className="pb-2 font-black">Goes in</th>
                              <th className="pb-2 text-right font-black">How much</th>
                              <th className="pb-2 text-right font-black">Per unit</th>
                              <th className="pb-2 text-right font-black">Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-950/5">
                            {d.lines.map((l, i) => (
                              <tr key={`${l.label}-${i}`}>
                                <td className="py-2 pr-3">
                                  <span className="font-semibold text-ink-950">
                                    {l.label}
                                  </span>
                                  {l.kind !== "ingredient" && (
                                    <span className="ml-2 rounded-full bg-ink-950/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-800/50">
                                      {l.kind === "batch" ? "batch" : "dish"}
                                    </span>
                                  )}
                                  {l.problem && (
                                    <span className="ml-2 text-[11px] font-bold text-brand-600">
                                      {l.problem}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-right tabular-nums text-ink-800/70">
                                  {l.qty.toLocaleString("en-PH")} {l.unit}
                                </td>
                                <td className="py-2 text-right tabular-nums text-ink-800/50">
                                  {l.unitCost > 0 ? peso(l.unitCost, 4) : "—"}
                                </td>
                                <td className="py-2 text-right font-bold tabular-nums text-ink-950">
                                  {peso(l.cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-ink-950/15">
                              <td colSpan={3} className="pt-2 text-right font-bold text-ink-800/70">
                                Total ingredients
                              </td>
                              <td className="pt-2 text-right font-display font-black tabular-nums text-ink-950">
                                {peso(d.cost)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-800/45">
        Ingredients only — gas, packaging, the stall and your time are on top.
        The line on each bar marks {FOOD_COST_TARGET}%, the usual food-cost
        target for street food; under it, there&apos;s room for everything else.
      </p>
    </div>
  );
}
