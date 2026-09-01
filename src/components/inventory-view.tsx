"use client";

import { useMemo, useState } from "react";
import { peso } from "@/lib/costing";
import {
  CountForm,
  IngredientForm,
  RestockForm,
  type EditableIngredient,
} from "@/components/ingredient-forms";
import {
  ProduceBatchForm,
  RecipeEditor,
  type RecipeOption,
} from "@/components/recipe-editor";
import { WasteForm } from "@/components/waste-form";
import { hqTitle } from "@/lib/hq-theme";

export type StockRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  reorder: number;
  unitCost: number;
  value: number;
  low: boolean;
  buysAs: string | null;
  categories: string[];
  purchasePrice: number;
  purchaseQty: number;
  /** How much the last delivery's price moved against the one before it. */
  priceMovePct: number | null;
};

/** The shape the forms want, from the shape the list already has. */
function editable(s: StockRow): EditableIngredient {
  return {
    id: s.id,
    name: s.name,
    unit: s.unit,
    purchasePrice: s.purchasePrice,
    purchaseQty: s.purchaseQty,
    reorder: s.reorder,
    categories: s.categories,
    stock: s.stock,
    unitCost: s.unitCost,
  };
}

/** Which dialog is open, and over which row. */
export type SuggestionRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  dailyAvg: number;
  daysLeft: number;
  buy: number;
  cost: number;
  coveredBy: { name: string; qty: number; unit: string }[];
};

export type ExpiringRow = {
  name: string;
  unit: string;
  qty: number;
  cost: number;
  expiryDate: string;
  daysLeft: number;
};

type Editing =
  | { kind: "new" }
  | { kind: "waste" }
  | { kind: "edit" | "restock" | "count"; row: StockRow }
  | { kind: "produce" | "recipe"; batch: BatchRow }
  | null;

export type BatchRow = {
  id: string;
  name: string;
  /** What goes into one batch, so the produce dialog can check the shelf. */
  recipe: { ingredientId: string; qty: number }[];
  yieldQty: number;
  yieldUnit: string;
  stock: number;
  reorder: number;
  total: number;
  perUnit: number;
  unknown: boolean;
  problems: string[];
  lineCount: number;
};

/**
 * What's in the store room.
 *
 * The screen answers two questions and puts the urgent one first: what do I
 * need to buy before the next service, and how much money is sitting on the
 * shelves. Everything else is a table, and a table is fine — but a shopping
 * list read off a table at 5am is how you forget the thing you ran out of last
 * week.
 *
 * Staff see the stock levels, because staff are the ones who notice something
 * is nearly gone. They don't see what it costs: supplier prices are the
 * owner's.
 */

/** Stock against its reorder level, as one glanceable bar. */
function StockBar({ stock, reorder }: { stock: number; reorder: number }) {
  if (reorder <= 0) {
    // No reorder level set, so there is no "low" to draw. Saying so beats
    // drawing a bar that silently means nothing.
    return (
      <div className="h-2 w-full rounded-full bg-ink-950/[0.07]" aria-hidden />
    );
  }
  // Full bar = twice the reorder level, so a healthy shelf sits around the
  // middle and there's visible room above the line as well as below it.
  const pct = Math.max(2, Math.min(100, (stock / (reorder * 2)) * 100));
  const low = stock <= reorder;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-950/[0.07]">
      <div
        className={`h-full rounded-full ${low ? "bg-brand-600" : "bg-jade-500"}`}
        style={{ width: `${pct}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-px bg-ink-950/30" aria-hidden />
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
  tone?: "plain" | "good" | "bad";
}) {
  const skin = {
    plain: "bg-cream-100 text-ink-950 ring-ink-950/10",
    good: "bg-jade-600 text-cream-50 ring-jade-700/30",
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

export function InventoryView({
  stock,
  batches,
  suggestions,
  expiring,
  usageDays,
  thinHistory,
  canSeeCosts,
  canManage,
  failed,
}: {
  stock: StockRow[];
  batches: BatchRow[];
  suggestions: SuggestionRow[];
  expiring: ExpiringRow[];
  /** Days of consumption history the averages are built on. */
  usageDays: number;
  thinHistory: boolean;
  canSeeCosts: boolean;
  /**
   * May this person move stock, or only look at it?
   *
   * Separate from `canSeeCosts` because they are separate questions and the
   * shop answers them differently: a manager restocks all day and never needs
   * to know what the shop's margin is. Squashing the two into one flag is
   * what would force the owner to hand over the books to get a shelf counted.
   */
  canManage: boolean;
  failed: string[];
}) {
  const [tab, setTab] = useState<"stock" | "batches">("stock");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);

  // Offered as suggestions rather than a fixed list: the shop's own units and
  // tags are the right vocabulary, and a dropdown of ours would just be one
  // more thing that doesn't fit.
  const units = useMemo(
    () => [...new Set(stock.map((s) => s.unit).filter(Boolean))].sort(),
    [stock]
  );
  const allCategories = useMemo(
    () => [...new Set(stock.flatMap((s) => s.categories))].sort(),
    [stock]
  );

  // Everything a recipe line can point at, priced. Ingredients only — a batch
  // made of batches is a recursion nobody at the stall asked for.
  const ingredientOptions: RecipeOption[] = useMemo(
    () =>
      stock.map((s) => ({
        id: s.id,
        name: s.name,
        unit: s.unit,
        unitCost: s.unitCost,
        kind: "inv" as const,
        stock: s.stock,
      })),
    [stock]
  );

  const low = useMemo(() => stock.filter((s) => s.low), [stock]);
  const totalValue = useMemo(
    () => stock.reduce((sum, s) => sum + s.value, 0),
    [stock]
  );
  const unpriced = useMemo(
    () => stock.filter((s) => s.unitCost <= 0).length,
    [stock]
  );
  const lowBatches = useMemo(
    () => batches.filter((b) => b.reorder > 0 && b.stock <= b.reorder),
    [batches]
  );

  const shownStock = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock
      .filter((s) => {
        if (lowOnly && !s.low) return false;
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q))
        );
      })
      // Low first — the only ordering that makes the list actionable rather
      // than merely complete.
      .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
  }, [stock, query, lowOnly]);

  const shownBatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return batches
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [batches, query]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={hqTitle}>Inventory</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
            What&apos;s on the shelf, what&apos;s running out, and the sauces and
            marinades you make in bulk. Selling now takes stock off the shelf.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEditing({ kind: "waste" })}
            className="rounded-2xl bg-ink-950/5 px-5 py-3 text-sm font-black text-ink-800/70 ring-1 ring-ink-950/10 transition-colors hover:bg-brand-600 hover:text-cream-50"
          >
            Log waste
          </button>
          {/* Logging waste stays with everyone. Throwing away a burnt batch
              happens at the moment it burns, by whoever burnt it — a system
              that makes that need a manager is a system where waste quietly
              stops being logged and the shelf drifts from the count. */}
          {canManage && (
            <button
              onClick={() => setEditing({ kind: "new" })}
              className="rounded-2xl bg-ink-950 px-5 py-3 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
            >
              + Add an ingredient
            </button>
          )}
        </div>
      </div>

      {failed.length > 0 && (
        <p className="rounded-2xl bg-brand-600 px-5 py-4 text-sm text-cream-50">
          <strong>Couldn&apos;t read {failed.join(", ")}.</strong> Anything
          missing below is missing because of that, not because it&apos;s gone.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Running low"
          value={String(low.length)}
          sub={low.length === 0 ? "Nothing needs buying" : "At or below reorder level"}
          tone={low.length === 0 ? "good" : "bad"}
        />
        {canSeeCosts && (
          <Stat
            label="Stock value"
            value={peso(totalValue, 0)}
            sub="Money sitting on the shelves"
          />
        )}
        <Stat
          label="Ingredients"
          value={String(stock.length)}
          sub={
            unpriced === 0
              ? "All priced"
              : `${unpriced} with no price — costs will read low`
          }
        />
        <Stat
          label="Batches"
          value={String(batches.length)}
          sub={
            lowBatches.length === 0
              ? "Sauces and marinades you prep"
              : `${lowBatches.length} need${lowBatches.length === 1 ? "s" : ""} making`
          }
        />
      </div>

      {/* Going off first: no amount of restocking fixes something already in
          the fridge with two days left on it. */}
      {expiring.length > 0 && (
        <section className="rounded-3xl bg-chili-500/15 p-6 ring-1 ring-chili-500/30">
          <h3 className="font-display text-xl font-black text-ink-950">
            Use these first
          </h3>
          <p className="mt-1 text-sm text-ink-800/60">
            {expiring.length} lot{expiring.length === 1 ? "" : "s"} at or near
            the date. Cooking draws on the oldest first automatically — this is
            so you can plan around it.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {expiring.map((e, i) => (
              <li
                key={i}
                className={`rounded-2xl px-4 py-2.5 ring-1 ${
                  e.daysLeft < 0
                    ? "bg-brand-600 text-cream-50 ring-brand-700/30"
                    : "bg-cream-50 text-ink-950 ring-ink-950/10"
                }`}
              >
                <span className="font-bold">{e.name}</span>
                <span className="ml-2 text-sm tabular-nums">
                  {e.qty.toLocaleString("en-PH")} {e.unit}
                </span>
                <span
                  className={`ml-2 text-xs font-bold ${
                    e.daysLeft < 0 ? "text-cream-100/80" : "text-chili-700"
                  }`}
                >
                  {e.daysLeft < 0
                    ? `${Math.abs(e.daysLeft)}d past`
                    : e.daysLeft === 0
                      ? "today"
                      : `${e.daysLeft}d left`}
                </span>
                {canSeeCosts && (
                  <span className="ml-2 text-xs opacity-50">{peso(e.cost, 0)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Before there is any sales history there is nothing to average, so the
          shopping list simply wouldn't render — and an absent panel looks
          like a broken one. This says why, and points at the levels the
          owner set, which are all there is to go on in week one. */}
      {suggestions.length === 0 && low.length > 0 && (
        <section className="rounded-3xl border-2 border-dashed border-ink-950/15 p-6">
          <h3 className="font-display text-lg font-black text-ink-950">
            No usage history yet
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
            Once sales start going through, this becomes a shopping list worked
            out from what you actually get through in a day. Until then, the{" "}
            {low.length} flagged below are against the reorder levels you set
            yourself.
          </p>
        </section>
      )}

      {/* The shopping list. Above the table, because at 5am nobody scrolls.
          Built from what the shop actually gets through rather than from the
          reorder number somebody guessed once — and it says how long each one
          has left, which is the part a static level can never tell you. */}
      {suggestions.length > 0 && (
        <section className="rounded-3xl bg-ink-950 p-6 text-cream-50">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-xl font-black">
              Buy before the next service
            </h3>
            {canSeeCosts && (
              <span className="font-display text-lg font-black tabular-nums text-gold-400">
                {peso(suggestions.reduce((sum, s) => sum + s.cost, 0), 0)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-cream-100/60">
            {thinHistory
              ? `Based on only ${usageDays} day${usageDays === 1 ? "" : "s"} of sales so far — treat it as a rough first guess.`
              : `Worked out from what you've actually used over the last ${usageDays} days.`}
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl bg-cream-50/10 px-4 py-3 ring-1 ring-cream-50/15"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-bold">
                    {s.name}
                    <span className="ml-2 text-sm font-normal text-cream-100/50">
                      {s.stock.toLocaleString("en-PH")} {s.unit} left ·{" "}
                      {s.dailyAvg.toLocaleString("en-PH", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      {s.unit}/day
                    </span>
                  </span>
                  <span className="text-sm">
                    <span
                      className={`font-black tabular-nums ${
                        s.daysLeft < 1 ? "text-brand-300" : "text-gold-400"
                      }`}
                    >
                      {s.daysLeft < 1
                        ? "out now"
                        : `${s.daysLeft.toFixed(1)} days left`}
                    </span>
                    <span className="ml-3 text-cream-100/70">
                      buy ~{s.buy.toLocaleString("en-PH", { maximumFractionDigits: 0 })}{" "}
                      {s.unit}
                    </span>
                  </span>
                </div>
                {s.coveredBy.length > 0 && (
                  <p className="mt-1 text-xs text-jade-300">
                    Low, but you already have{" "}
                    {s.coveredBy
                      .map(
                        (c) =>
                          `${c.qty.toLocaleString("en-PH")} ${c.unit} of ${c.name}`
                      )
                      .join(", ")}{" "}
                    made.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            { key: "stock" as const, label: "Ingredients", n: stock.length },
            { key: "batches" as const, label: "Batches", n: batches.length },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              role="tab"
              aria-selected={tab === t.key}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                tab === t.key
                  ? "bg-ink-950 text-cream-50"
                  : "bg-cream-100 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
              }`}
            >
              {t.label}
              <span className="ml-2 tabular-nums opacity-50">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "stock" ? "Search an ingredient…" : "Search a batch…"}
            className="min-w-0 flex-1 rounded-xl bg-cream-100 px-4 py-2.5 text-sm text-ink-950 ring-1 ring-ink-950/10 placeholder:text-ink-800/40 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          {tab === "stock" && (
            <button
              onClick={() => setLowOnly((v) => !v)}
              aria-pressed={lowOnly}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                lowOnly
                  ? "bg-brand-600 text-cream-50"
                  : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10 hover:bg-cream-200"
              }`}
            >
              Low stock only
            </button>
          )}
        </div>
      </div>

      {tab === "stock" ? (
        shownStock.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            {query ? `Nothing matches “${query}”.` : "Nothing to show."}
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {shownStock.map((s) => (
              <li
                key={s.id}
                className={`rounded-2xl bg-cream-100 p-4 ring-1 ${
                  s.low ? "ring-brand-600/40" : "ring-ink-950/10"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 font-bold text-ink-950">{s.name}</p>
                  <p className="shrink-0 text-sm tabular-nums text-ink-800/70">
                    <strong
                      className={`font-display text-base ${
                        s.low ? "text-brand-600" : "text-ink-950"
                      }`}
                    >
                      {s.stock.toLocaleString("en-PH")}
                    </strong>{" "}
                    {s.unit}
                  </p>
                </div>

                <div className="mt-2.5">
                  <StockBar stock={s.stock} reorder={s.reorder} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-800/50">
                  <span>
                    {s.reorder > 0
                      ? `Reorder at ${s.reorder.toLocaleString("en-PH")} ${s.unit}`
                      : "No reorder level set"}
                  </span>
                  {canSeeCosts && s.unitCost > 0 && (
                    <>
                      <span>{peso(s.unitCost, 4)} / {s.unit}</span>
                      <span>{peso(s.value, 0)} on hand</span>
                    </>
                  )}
                  {/* Against the previous delivery, not an average — an
                      average smooths away exactly the jump worth knowing
                      about. */}
                  {canSeeCosts && s.priceMovePct !== null && (
                    <span
                      className={`font-bold ${
                        s.priceMovePct > 0 ? "text-brand-600" : "text-jade-700"
                      }`}
                      title="Compared with the delivery before it"
                    >
                      {s.priceMovePct > 0 ? "↑" : "↓"}{" "}
                      {Math.abs(s.priceMovePct).toFixed(0)}% since last buy
                    </span>
                  )}
                  {canSeeCosts && s.unitCost <= 0 && (
                    <span className="font-bold text-chili-700">No price set</span>
                  )}
                  {s.low && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 font-black uppercase tracking-wide text-cream-50">
                      Low
                    </span>
                  )}
                </div>

                {/* Restock first and widest: it is the thing done most, and
                    usually while holding a delivery in the other hand.

                    Solid green only where restocking is actually the next
                    action. Ninety-one saturated bars down the page would be
                    decoration, and decoration that looks like a priority is
                    worse than none — this way the colour is the shopping
                    list, same as the red badge. */}
                {canManage && (
                <div className="mt-3 flex gap-1.5">
                  <button
                    onClick={() => setEditing({ kind: "restock", row: s })}
                    className={`flex-1 rounded-xl py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                      s.low
                        ? "bg-jade-600 text-cream-50 hover:bg-jade-700"
                        : "bg-jade-600/10 text-jade-800 hover:bg-jade-600 hover:text-cream-50"
                    }`}
                  >
                    Restock
                  </button>
                  <button
                    onClick={() => setEditing({ kind: "count", row: s })}
                    className="rounded-xl bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
                  >
                    Count
                  </button>
                  <button
                    onClick={() => setEditing({ kind: "edit", row: s })}
                    className="rounded-xl bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
                  >
                    Edit
                  </button>
                </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : shownBatches.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
          {query ? `Nothing matches “${query}”.` : "No batches yet."}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shownBatches.map((b) => {
            const low = b.reorder > 0 && b.stock <= b.reorder;
            return (
              <li
                key={b.id}
                className={`rounded-2xl bg-cream-100 p-4 ring-1 ${
                  low ? "ring-brand-600/40" : "ring-ink-950/10"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 font-bold text-ink-950">{b.name}</p>
                  <p className="shrink-0 text-sm tabular-nums text-ink-800/70">
                    <strong
                      className={`font-display text-base ${
                        low ? "text-brand-600" : "text-ink-950"
                      }`}
                    >
                      {b.stock.toLocaleString("en-PH")}
                    </strong>{" "}
                    {b.yieldUnit} made
                  </p>
                </div>

                <div className="mt-2.5">
                  <StockBar stock={b.stock} reorder={b.reorder} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-800/50">
                  <span>
                    Makes {b.yieldQty.toLocaleString("en-PH")} {b.yieldUnit}
                    {b.lineCount > 0 && ` from ${b.lineCount} ingredients`}
                  </span>
                  {canSeeCosts && !b.unknown && (
                    <>
                      <span>{peso(b.total)} a batch</span>
                      <span>{peso(b.perUnit, 4)} / {b.yieldUnit}</span>
                    </>
                  )}
                  {canSeeCosts && b.unknown && (
                    <span className="font-bold text-chili-700">Not costed</span>
                  )}
                  {low && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 font-black uppercase tracking-wide text-cream-50">
                      Make more
                    </span>
                  )}
                </div>

                {canSeeCosts && b.problems.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {b.problems.map((p) => (
                      <li key={p} className="text-[11px] font-semibold text-chili-700">
                        ⚠ {p}
                      </li>
                    ))}
                  </ul>
                )}

                {canManage && (
                <div className="mt-3 flex gap-1.5">
                  <button
                    onClick={() => setEditing({ kind: "produce", batch: b })}
                    className={`flex-1 rounded-xl py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                      low
                        ? "bg-jade-600 text-cream-50 hover:bg-jade-700"
                        : "bg-jade-600/10 text-jade-800 hover:bg-jade-600 hover:text-cream-50"
                    }`}
                  >
                    Make a batch
                  </button>
                  {/* Recipes define what things cost, so they are the owner's.
                      Making a batch is something that happened, so it is the
                      shift's. */}
                  {canSeeCosts && (
                    <button
                      onClick={() => setEditing({ kind: "recipe", batch: b })}
                      className="rounded-xl bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
                    >
                      Recipe
                    </button>
                  )}
                </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Keyed on the row so opening a second ingredient's form resets every
          field — a restock dialog carrying the last one's quantity is how a
          delivery gets recorded against the wrong shelf. */}
      {editing?.kind === "waste" && (
        <WasteForm
          options={[
            ...ingredientOptions,
            ...batches.map((b) => ({
              id: b.id,
              name: b.name,
              unit: b.yieldUnit,
              unitCost: b.perUnit,
              kind: "batch" as const,
              stock: b.stock,
            })),
          ]}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "new" && (
        <IngredientForm
          units={units}
          categories={allCategories}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "edit" && (
        <IngredientForm
          key={editing.row.id}
          ingredient={editable(editing.row)}
          units={units}
          categories={allCategories}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "restock" && (
        <RestockForm
          key={editing.row.id}
          ingredient={editable(editing.row)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "count" && (
        <CountForm
          key={editing.row.id}
          ingredient={editable(editing.row)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "produce" && (
        <ProduceBatchForm
          key={editing.batch.id}
          batch={{
            id: editing.batch.id,
            name: editing.batch.name,
            yieldQty: editing.batch.yieldQty,
            yieldUnit: editing.batch.yieldUnit,
            stock: editing.batch.stock,
          }}
          recipe={editing.batch.recipe}
          options={ingredientOptions}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "recipe" && (
        <RecipeEditor
          key={editing.batch.id}
          title={`Recipe for ${editing.batch.name}`}
          subtitle={`Makes ${editing.batch.yieldQty.toLocaleString("en-PH")} ${editing.batch.yieldUnit} a batch.`}
          price={null}
          options={ingredientOptions}
          initial={editing.batch.recipe.map((r) => ({
            refType: "inv" as const,
            refId: r.ingredientId,
            qty: r.qty,
          }))}
          target={{ kind: "batch", batchId: editing.batch.id }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
