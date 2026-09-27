import Link from "next/link";
import {
  verdictText,
  type Rollout,
} from "@/lib/nutrition-rollout";

/**
 * Whether the calories are actually reaching a customer, and what is stopping
 * them.
 *
 * The owner filled 44 ingredients from the reference, went to look at the
 * menu, and there were no calories anywhere. Nothing was broken — the master
 * switch was one of three separate things that all have to be true, and it
 * lives two tabs away from the button that does the filling. Every one of
 * those three facts was visible on some screen and none of them on the
 * screen where the work happens.
 *
 * So this panel goes on BOTH screens: the Inventory tab, where the
 * ingredients get filled in, and the Menu tab, beside the switch itself. It
 * is the same component and the same figures either way, which is the point
 * — two screens describing one state in two different ways is how the
 * confusion started.
 *
 * The blocker list is the part worth having. "44 filled" is a number to nod
 * at; "fill Garlic and 9 dishes go live" is something to go and do, and it
 * reorders eighty lookups into the five that matter.
 */
export function NutritionStatus({
  rollout,
  /** Menu links are pointless on the Menu page itself. */
  showMenuLink = true,
}: {
  rollout: Rollout;
  showMenuLink?: boolean;
}) {
  const { verdict, ready, blocked, blockers, noRecipe } = rollout;
  const { headline, next } = verdictText(verdict);

  // Colour by state, because this is a status and reading it at a glance is
  // most of its job: green when customers can see it, gold when the work is
  // done and one switch is in the way, plain while there is still filling in
  // to do — which is a to-do list, not a warning.
  const tone =
    verdict.kind === "showing"
      ? "bg-jade-600/12 ring-jade-700/20"
      : verdict.kind === "switch-off"
        ? "bg-gold-400/25 ring-gold-400/50"
        : "bg-cream-100 ring-ink-950/10";

  return (
    <div className={`rounded-2xl px-4 py-3.5 ring-1 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-base font-black text-ink-950">
          {headline}
        </p>
        {showMenuLink && (verdict.kind === "switch-off" || ready.length > 0) && (
          <Link
            href="/admin/menu"
            className="shrink-0 rounded-full bg-ink-950 px-3.5 py-1.5 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
          >
            {verdict.kind === "switch-off" ? "Turn them on →" : "Menu settings →"}
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-800/70">{next}</p>

      {/* ── what to fill in next ──────────────────────────────────────────
          Ranked by what each one would free, not by how many dishes mention
          it. An ingredient in three dishes that each need two more things
          frees nothing today; the one ingredient standing alone in front of
          a dish frees it this afternoon. */}
      {blockers.length > 0 && (
        <div className="mt-3 border-t border-ink-950/[0.07] pt-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-ink-800/45">
            Fill these next
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {blockers.slice(0, 8).map((b) => (
              <li
                key={b.name}
                className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-bold ring-1 ${
                  b.unlocks > 0
                    ? "bg-cream-50 text-ink-950 ring-ink-950/10"
                    : "bg-transparent text-ink-800/55 ring-ink-950/10"
                }`}
              >
                <span className="truncate">{b.name}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                    b.unlocks > 0
                      ? "bg-jade-600/15 text-jade-700"
                      : "bg-ink-950/[0.07] text-ink-800/60"
                  }`}
                >
                  {b.unlocks > 0
                    ? `frees ${b.unlocks}`
                    : `in ${b.dishes}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-800/50">
            <strong>frees N</strong> means that ingredient is the last thing
            standing between N dishes and a calorie count — fill it and they
            go live. <strong>in N</strong> means it is needed by N dishes that
            are still short of other things too.
          </p>
        </div>
      )}

      {/* Counted, not listed. A dish with no recipe is a costing problem the
          Dish costs screen already names dish by dish; here it only matters
          so the totals above add up and nobody goes hunting for a calorie
          count that was never going to appear. */}
      {noRecipe.length > 0 && (
        <p className="mt-2 text-xs text-ink-800/50">
          {noRecipe.length} {noRecipe.length === 1 ? "dish has" : "dishes have"} no
          recipe at all, so there is nothing to work a figure out from
          {blocked.length > 0 || ready.length > 0 ? " — they are not counted above." : "."}
        </p>
      )}
    </div>
  );
}
