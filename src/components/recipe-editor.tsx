"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { peso } from "@/lib/costing";
import {
  produceBatch,
  saveBatchRecipe,
  saveMealRecipe,
} from "@/app/admin/inventory/actions";

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
 * of them gained a feature. A dish may draw on batches as well as
 * ingredients; a batch may only use ingredients, since a batch made of
 * batches is a recursion nobody at the stall asked for.
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
  target: { kind: "meal"; mealId: string } | { kind: "batch"; batchId: string };
  onClose: () => void;
}) {
  const [lines, setLines] = useState<RecipeLine[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const byId = useMemo(
    () => new Map(options.map((o) => [`${o.kind}:${o.id}`, o])),
    [options]
  );
  const allowed = useMemo(
    () =>
      target.kind === "batch" ? options.filter((o) => o.kind === "inv") : options,
    [options, target.kind]
  );

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
      const r =
        target.kind === "meal"
          ? await saveMealRecipe({ mealId: target.mealId, lines })
          : await saveBatchRecipe({
              batchId: target.batchId,
              lines: lines.map((l) => ({ ingredientId: l.refId, qty: l.qty })),
            });
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
                <select
                  value={o ? `${o.kind}:${o.id}` : ""}
                  onChange={(e) => {
                    // Split on the first colon only. An id is free-form text
                    // and a regex with a dot-all flag isn't available at this
                    // TS target anyway.
                    const v = e.target.value;
                    const at = v.indexOf(":");
                    if (at < 0) return;
                    setLine(i, {
                      refType: v.slice(0, at) as "inv" | "batch",
                      refId: v.slice(at + 1),
                    });
                  }}
                  className={`${inputClass} py-2`}
                >
                  <option value="">Pick one…</option>
                  {allowed.map((opt) => (
                    <option key={`${opt.kind}:${opt.id}`} value={`${opt.kind}:${opt.id}`}>
                      {opt.kind === "batch" ? `${opt.name} (batch)` : opt.name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={l.qty || ""}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) || 0 })}
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="How much"
                    className={`${inputClass} w-24 shrink-0 py-1.5 text-right`}
                  />
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
              {target.kind === "meal" ? "Costs to make" : "Costs per batch"}
            </span>
            <span className="font-display text-2xl font-black tabular-nums">
              {peso(total)}
            </span>
          </div>
          {price !== null && price > 0 && (
            <div className="mt-2 flex items-baseline justify-between border-t border-cream-50/15 pt-2 text-sm">
              <span className="opacity-70">
                Sells for {peso(price, 0)} — you keep
              </span>
              <span
                className={`font-display text-lg font-black tabular-nums ${
                  price - total < 0 ? "text-brand-300" : "text-jade-300"
                }`}
              >
                {peso(price - total)}
                <span className="ml-2 text-xs font-bold opacity-60">
                  {((total / price) * 100).toFixed(0)}% food cost
                </span>
              </span>
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
          {busy ? "Saving…" : "Save the recipe"}
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
  recipe: { ingredientId: string; qty: number }[];
  options: RecipeOption[];
  onClose: () => void;
}) {
  const [multiplier, setMultiplier] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const times = Number(multiplier) || 0;
  const byId = useMemo(
    () => new Map(options.filter((o) => o.kind === "inv").map((o) => [o.id, o])),
    [options]
  );

  const needs = recipe.map((r) => {
    const o = byId.get(r.ingredientId);
    const needed = r.qty * times;
    return {
      name: o?.name ?? "Deleted ingredient",
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
