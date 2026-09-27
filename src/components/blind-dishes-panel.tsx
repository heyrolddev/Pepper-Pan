import Link from "next/link";
import { blindDishNote, type MenuDish } from "@/lib/menu-health";

/**
 * The dishes that sell for real money and cost nothing.
 *
 * This sits above the day's takings for the same reason the error log does:
 * the money below it is wrong, and this is why. A dish with no recipe moves
 * no stock and books ₱0, so every sale of it inflates the margin on every
 * screen in HQ — and does it quietly, which is how "my stock is not going
 * down" becomes a mystery instead of a to-do.
 *
 * Deliberately not a tile in the grid. A tile is a measurement; this is a
 * fault, and the difference has to be visible before either is read.
 */
export function BlindDishesPanel({ dishes }: { dishes: MenuDish[] }) {
  if (dishes.length === 0) return null;

  // The live ones first — those are the ones taking money today.
  const shown = [...dishes]
    .sort((a, b) => Number(b.isPublic) - Number(a.isPublic) || a.name.localeCompare(b.name))
    .slice(0, 8);

  return (
    <section className="rounded-3xl bg-gold-400/20 p-6 ring-1 ring-gold-600/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-chili-700">
            <span aria-hidden className="h-2 w-2 rounded-full bg-chili-600" />
            Costing gap
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-black text-ink-950">
            Some dishes cost nothing to make
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/70">{blindDishNote(dishes)}</p>
        </div>
        <Link
          href="/admin/costing"
          className="shrink-0 rounded-full bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-transform hover:scale-105"
        >
          Give them a recipe →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {shown.map((d) => (
          <span
            key={d.id}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
              d.isPublic
                ? "bg-cream-50 text-ink-950 ring-1 ring-ink-950/10"
                : "bg-ink-950/[0.06] text-ink-800/55"
            }`}
          >
            {d.name}
            {!d.isPublic && <span className="ml-1.5 opacity-60">hidden</span>}
          </span>
        ))}
        {dishes.length > shown.length && (
          <span className="self-center text-xs font-bold text-ink-800/50">
            and {dishes.length - shown.length} more
          </span>
        )}
      </div>
    </section>
  );
}
