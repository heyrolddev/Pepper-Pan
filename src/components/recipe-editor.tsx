"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { peso } from "@/lib/costing";
import {
  produceBatch,
  saveBatchRecipe,
  saveMealRecipe,
  saveMealPackaging,
  saveOrderPackaging,
} from "@/app/admin/inventory/actions";
import { setDishPrice } from "@/app/admin/costing/actions";

/** Something a recipe line can point at. */
export type RecipeOption = {
  id: string;
  name: string;
  unit: string;
  /** ₱ per unit — for an ingredient its cost, for a batch its cost per yield unit. */
  unitCost: number;
  kind: "inv" | "batch";
  /** How much is on hand, for the shortfall warning when producing. */
  stock: number;
};

export type RecipeLine = { refType: "inv" | "batch"; refId: string; qty: number };

/**
 * What goes into a thing.
 *
 * One editor for both dishes and batches, because they are the same shape —
 * a list of "this much of that" — and two of these would drift the day one
 * of them gained a feature. Both may draw on ingredients and on batches: a
 * batch made of batches is exactly how liquid butter gets into marinated ji
 * pai without its thirteen ingredients being re-listed there. The caller
 * excludes a batch from its own option list; the server refuses a loop that
 * goes round more than one corner.
 *
 * The running cost is the point of the screen. Editing a recipe without
 * seeing what it does to the cost is editing blind, and the number that
 * matters — what this dish now costs to make — is one subtraction away from
 * the price.
 */
export function RecipeEditor({
  title,
  subtitle,
  /** Null when editing a batch: a batch has no selling price. */
  price,
  options,
  initial,
  target,
  onClose,
}: {
  title: string;
  subtitle?: string;
  price: number | null;
  options: RecipeOption[];
  initial: RecipeLine[];
  target:
    | { kind: "meal"; mealId: string }
    | { kind: "batch"; batchId: string }
    | { kind: "packaging"; mealId: string }
    | { kind: "order-packaging" };
  onClose: () => void;
}) {
  const [lines, setLines] = useState<RecipeLine[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  /**
   * What it sells for, editable right here.
   *
   * It used to be read-only on this dialog and changeable only on the Menu
   * tab — which is the one screen that cannot show you the margin you are
   * changing it against. So repricing meant reading the cost here,
   * remembering it, and typing the new price somewhere else. There is only
   * one `meals.price`, so changing it here changes the menu and the counter
   * by construction; nothing is being kept in step.
   */
  const [sellFor, setSellFor] = useState(price === null ? "" : String(price));

  const byId = useMemo(
    () => new Map(options.map((o) => [`${o.kind}:${o.id}`, o])),
    [options]
  );
  // Every option is offered, for a dish and for a batch alike. A batch used
  // to be restricted to ingredients; migration 0046 made "liquid butter
  // inside marinated ji pai" expressible, and the caller is what excludes a
  // batch from its own recipe.
  const allowed = options;

  // The live figure the margin below is measured against, so the readout
  // moves as the price is typed rather than after it is saved.
  const sell = price === null ? null : Number(sellFor) || 0;

  const priced = lines.map((l) => {
    const o = byId.get(`${l.refType}:${l.refId}`);
    return { line: l, option: o, cost: (o?.unitCost ?? 0) * l.qty };
  });
  const total = priced.reduce((s, p) => s + p.cost, 0);

  const setLine = (i: number, patch: Partial<RecipeLine>) =>
    setLines((cur) => cur.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // The price first, when it changed. If the recipe save then fails the
      // owner sees the new price with the old recipe — visible, and fixable
      // by saving again. The other order hides the failure: a saved recipe
      // and a price that silently did not move looks entirely fine.
      if (target.kind === "meal" && price !== null && sell !== null && sell !== price) {
        const p = await setDishPrice({ mealId: target.mealId, price: sell });
        if (p.error !== null) {
          setError(p.error);
          return;
        }
      }

      const r =
        target.kind === "meal"
          ? await saveMealRecipe({ mealId: target.mealId, lines })
          : target.kind === "packaging"
            ? await saveMealPackaging({ mealId: target.mealId, lines })
            : target.kind === "order-packaging"
              ? await saveOrderPackaging({ lines })
              : await saveBatchRecipe({ batchId: target.batchId, lines });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog title={title} subtitle={subtitle} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* The two packaging dialogs are the same shape and mean opposite
            things, and getting them the wrong way round is silent: the bag
            filed per dish charges four bags for a four-dish order, which is
            exactly how the old duplicate dishes got it wrong. So each one
            says which it is, in the sentence that matters, before any line
            is edited. */}
        {(target.kind === "packaging" || target.kind === "order-packaging") && (
          <p
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              target.kind === "packaging"
                ? "bg-chili-500/15 text-ink-800/80"
                : "bg-gold-400/20 text-ink-800/80"
            }`}
          >
            {target.kind === "packaging" ? (
              <>
                <strong className="text-ink-950">Once per serving.</strong> Two
                of this dish in one order uses two of everything here — the
                container, the fork, the spoon. The <strong>bag</strong> does
                not belong here: it is one per order however many dishes go in
                it, and lives under &ldquo;What every take-out order
                includes&rdquo;.
              </>
            ) : (
              <>
                <strong className="text-ink-950">Once per order.</strong>{" "}
                However many dishes are in it. The bag belongs here. Anything
                used once per serving — a container, a fork — belongs on the
                dish instead, or a four-dish order will be charged one fork.
              </>
            )}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {lines.map((l, i) => {
            const o = byId.get(`${l.refType}:${l.refId}`);
            // The name gets its own row and the full width of the dialog.
            // Squeezed beside the quantity it truncated to "M.Chicken 100 (b"
            // and "T.O/ Noodles (ba", which on a menu full of near-identical
            // batch names is how the wrong thing gets picked — and on a phone
            // the single row didn't fit at all.
            return (
              <li
                key={i}
                className="rounded-2xl bg-ink-950/[0.03] p-2.5 ring-1 ring-ink-950/5"
              >
                <Combobox
                  value={o ? `${o.kind}:${o.id}` : ""}
                  ariaLabel="What goes in"
                  placeholder="Type to search…"
                  options={allowed.map((opt) => ({
                    value: `${opt.kind}:${opt.id}`,
                    label: opt.kind === "batch" ? `${opt.name} (batch)` : opt.name,
                    hint: opt.unit,
                  }))}
                  onChange={(v) => {
                    // Split on the first colon only. An id is free-form text
                    // and a regex with a dot-all flag isn't available at this
                    // TS target anyway.
                    const at = v.indexOf(":");
                    if (at < 0) return;
                    setLine(i, {
                      refType: v.slice(0, at) as "inv" | "batch",
                      refId: v.slice(at + 1),
                    });
                  }}
                />

                <div className="mt-2 flex items-center gap-2">
                  {/* Wrapped rather than given a `w-24` alongside `inputClass`.
                      That class already carries `w-full`, and which of two
                      competing width utilities wins is decided by the order
                      Tailwind emits them in, not by the order they're written
                      here — `w-full` won, the quantity box ate the row, and
                      the unit and the remove button were pushed off the edge
                      of the dialog. A fixed-width parent has no such
                      argument to lose. */}
                  <div className="w-24 shrink-0">
                    <input
                      value={l.qty || ""}
                      onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })}
                      type="number"
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="How much"
                      className={`${inputClass} py-1.5 text-right`}
                    />
                  </div>
                  <span className="shrink-0 text-xs text-ink-800/50">
                    {o?.unit ?? ""}
                  </span>
                  <span className="flex-1 text-right font-display text-sm font-black tabular-nums text-ink-950">
                    {o ? peso((o.unitCost || 0) * l.qty) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((cur) => cur.filter((_, n) => n !== i))}
                    aria-label="Remove this line"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-950/5 text-ink-800/60 transition-colors hover:bg-brand-600 hover:text-cream-50"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => setLines((cur) => [...cur, { refType: "inv", refId: "", qty: 0 }])}
          className="rounded-xl border-2 border-dashed border-ink-950/15 py-2.5 text-sm font-bold text-ink-800/60 transition-colors hover:border-gold-400 hover:text-ink-950"
        >
          + Add a line
        </button>

        <div className="rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold opacity-70">
              {target.kind === "meal"
                ? "Costs to make"
                : target.kind === "batch"
                  ? "Costs per batch"
                  : target.kind === "packaging"
                    ? "Adds to a take-out"
                    : "Adds to every take-out order"}
            </span>
            <span className="font-display text-2xl font-black tabular-nums">
              {peso(total)}
            </span>
          </div>
          {price !== null && (
            <div className="mt-2 border-t border-cream-50/15 pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm opacity-70">Sells for</span>
                <span className="relative flex w-32 items-center">
                  <span className="pointer-events-none absolute left-3 text-sm font-bold opacity-50">
                    ₱
                  </span>
                  <input
                    value={sellFor}
                    onChange={(e) => setSellFor(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    aria-label="Selling price"
                    className="w-full rounded-xl bg-cream-50/10 py-2 pl-7 pr-2 text-right font-display text-lg font-black tabular-nums text-cream-50 ring-1 ring-cream-50/20 focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                </span>
              </div>
              {sell !== null && sell > 0 && (
                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span className="opacity-70">You keep</span>
                  <span
                    className={`font-display text-lg font-black tabular-nums ${
                      sell - total < 0 ? "text-brand-300" : "text-jade-300"
                    }`}
                  >
                    {peso(sell - total)}
                    <span className="ml-2 text-xs font-bold opacity-60">
                      {((total / sell) * 100).toFixed(0)}% food cost
                    </span>
                  </span>
                </div>
              )}
              {sell !== null && sell !== price && (
                <p className="mt-2 text-xs opacity-60">
                  Saving changes the price on the menu and at the counter too —
                  there is only one price.
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {busy
            ? "Saving…"
            : target.kind === "packaging" || target.kind === "order-packaging"
              ? "Save the packaging"
              : sell !== null && sell !== price
                ? "Save the price and recipe"
                : "Save the recipe"}
        </button>
      </form>
    </AdminDialog>
  );
}

/**
 * Cook a batch.
 *
 * Shows the shopping list against what is actually on the shelf before
 * anything moves. It warns rather than refuses: the pepper may well have
 * been bought this morning and not entered yet, and a system that blocks
 * work which has already happened is a system that gets worked around.
 */
export function ProduceBatchForm({
  batch,
  recipe,
  options,
  onClose,
}: {
  batch: { id: string; name: string; yieldQty: number; yieldUnit: string; stock: number };
  recipe: RecipeLine[];
  options: RecipeOption[];
  onClose: () => void;
}) {
  const [multiplier, setMultiplier] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const times = Number(multiplier) || 0;
  // Keyed by kind as well as id, because an ingredient and a batch may share
  // neither namespace nor guarantee of distinctness — and a recipe line now
  // points at either.
  const byId = useMemo(
    () => new Map(options.map((o) => [`${o.kind}:${o.id}`, o])),
    [options]
  );

  const needs = recipe.map((r) => {
    const o = byId.get(`${r.refType}:${r.refId}`);
    const needed = r.qty * times;
    return {
      // A line pointing at a batch that has been deleted reads differently
      // from one pointing at a deleted ingredient, and the person about to
      // cook needs to know which shelf to go and look at.
      name: o?.name ?? (r.refType === "batch" ? "Deleted batch" : "Deleted ingredient"),
      unit: o?.unit ?? "",
      needed,
      have: o?.stock ?? 0,
      short: (o?.stock ?? 0) < needed,
      cost: (o?.unitCost ?? 0) * needed,
    };
  });
  const shortages = needs.filter((n) => n.short);
  const cost = needs.reduce((s, n) => s + n.cost, 0);
  const makes = batch.yieldQty * times;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await produceBatch({ batchId: batch.id, multiplier: times });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title={`Make ${batch.name}`}
      subtitle={`${batch.stock.toLocaleString("en-PH")} ${batch.yieldUnit} already made.`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="How many batches" hint={`One batch makes ${batch.yieldQty.toLocaleString("en-PH")} ${batch.yieldUnit}.`}>
          <input
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            type="number"
            step="0.25"
            min="0"
            inputMode="decimal"
            autoFocus
            className={inputClass}
          />
        </Field>

        {recipe.length === 0 ? (
          <p className="rounded-xl bg-chili-500/15 px-4 py-3 text-sm text-ink-950">
            This batch has no recipe yet, so there&apos;s nothing to make it
            from. Add one first.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-ink-950/10">
            <table className="w-full text-sm">
              <thead className="bg-ink-950/5">
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-ink-800/50">
                  <th className="px-3 py-2">Needs</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">On hand</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-950/5">
                {needs.map((n, i) => (
                  <tr key={i} className={n.short ? "bg-brand-600/10" : ""}>
                    <td className="px-3 py-1.5 font-semibold text-ink-950">{n.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-800/70">
                      {n.needed.toLocaleString("en-PH", { maximumFractionDigits: 2 })} {n.unit}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        n.short ? "font-black text-brand-600" : "text-ink-800/50"
                      }`}
                    >
                      {n.have.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {shortages.length > 0 && (
          <p className="rounded-xl bg-gold-400 px-4 py-3 text-sm text-ink-950">
            <strong>Not enough {shortages.map((s) => s.name).join(", ")}.</strong>{" "}
            You can still record it — if you bought more and haven&apos;t
            entered it yet, do that first, or the count will go negative.
          </p>
        )}

        <div className="flex items-baseline justify-between rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
          <span className="text-sm font-bold opacity-70">
            Makes {makes.toLocaleString("en-PH")} {batch.yieldUnit}
          </span>
          <span className="font-display text-2xl font-black tabular-nums">
            {peso(cost)}
          </span>
        </div>

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || times <= 0 || recipe.length === 0}
          className="w-full rounded-2xl bg-jade-600 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-jade-700 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {busy ? "Recording…" : "We made it"}
        </button>
      </form>
    </AdminDialog>
  );
}
