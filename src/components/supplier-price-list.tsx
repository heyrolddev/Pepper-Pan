"use client";

import { useEffect, useState, useTransition } from "react";
import { unitPeso } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import {
  compareToCost,
  quoteLabel,
} from "@/lib/supplier-quotes";
import {
  deleteSupplierPrice,
  pickableIngredients,
  saveSupplierPrice,
  supplierPrices,
  type SupplierPrice,
} from "@/app/admin/suppliers/actions";

/**
 * What this supplier charges, typed in before anything is bought.
 *
 * "What you buy here" was one free-text line saying "Chicken". That is a
 * label. Standing in the market deciding where to go, the question is how
 * much Kambal wants for it and whether that is better than what the shop
 * is paying now — and the shop had nowhere to write the answer down.
 *
 * ── Why a price here is not the price history ────────────────────────────
 *
 * `purchase_log` and the Prices & history dialog are what was actually
 * PAID. They are facts, and they only exist after the money has gone. This
 * is what somebody SAYS, which is the number that decides whether the money
 * goes at all. Both are worth having and neither replaces the other.
 *
 * ── The comparison, and when it refuses ──────────────────────────────────
 *
 * A quote in kilos held against a cost per gram is a conversion, and a
 * wrong one makes a supplier look a thousand times cheaper. So the sum is
 * in `lib/supplier-quotes.ts` where it is tested, and where it is allowed
 * to say it cannot do it — a quote per sack against a recipe in grams is a
 * real thing to want and not a thing anybody can answer without being told
 * how big a sack is. Then the price is still shown, just not dressed up as
 * a comparison.
 */

const boxClass =
  "w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400";

type Draft = {
  id?: string;
  ingredientId: string;
  label: string;
  price: string;
  qty: string;
  unit: string;
  note: string;
};

const blank: Draft = { ingredientId: "", label: "", price: "", qty: "1", unit: "kg", note: "" };

export function SupplierPriceList({
  supplierId,
  canEdit,
}: {
  supplierId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<SupplierPrice[] | null>(null);
  const [items, setItems] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const load = () =>
    supplierPrices(supplierId).then((r) => {
      if (r.error) setProblem(r.error);
      setRows(r.rows);
    });

  useEffect(() => {
    let alive = true;
    supplierPrices(supplierId).then((r) => {
      if (!alive) return;
      if (r.error) setProblem(r.error);
      setRows(r.rows);
    });
    pickableIngredients().then((i) => alive && setItems(i));
    return () => {
      alive = false;
    };
  }, [supplierId]);

  function save() {
    if (!draft) return;
    startBusy(async () => {
      setProblem(null);
      const res = await saveSupplierPrice({
        id: draft.id,
        supplierId,
        ingredientId: draft.ingredientId || null,
        label: draft.label,
        price: Number(draft.price) || 0,
        qty: Number(draft.qty) || 1,
        unit: draft.unit,
        note: draft.note,
      });
      if (res.error) return setProblem(res.error);
      setDraft(null);
      await load();
    });
  }

  return (
    <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/60">
          What they charge
        </span>
        {canEdit && !draft && (
          <button
            type="button"
            onClick={() => setDraft({ ...blank })}
            className="rounded-lg bg-ink-950 px-3 py-1.5 text-xs font-black text-gold-400 hover:bg-ink-800"
          >
            + Add a price
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-800/55">
        What they say it costs, written down before you buy. Separate from what
        you actually paid — that builds itself from your deliveries.
      </p>

      {problem && (
        <p className="mt-3 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-cream-50">
          {problem}
        </p>
      )}

      {rows === null ? (
        <p className="mt-3 text-xs text-ink-800/50">Looking…</p>
      ) : rows.length === 0 && !draft ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-800/50">
          Nothing yet. Next time you ask what chicken costs here, put the answer
          in and every restock after it can tell you whether the price moved.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {rows.map((row) => (
            <PriceRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              busy={busy}
              onEdit={() =>
                setDraft({
                  id: row.id,
                  ingredientId: row.ingredientId ?? "",
                  label: row.label,
                  price: String(row.price),
                  qty: String(row.qty),
                  unit: row.unit,
                  note: row.note ?? "",
                })
              }
              onRemove={() =>
                startBusy(async () => {
                  setProblem(null);
                  const res = await deleteSupplierPrice(row.id);
                  if (res.error) return setProblem(res.error);
                  await load();
                })
              }
            />
          ))}
        </ul>
      )}

      {draft && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-xl bg-cream-50 p-3 ring-1 ring-ink-950/10">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
              What
            </span>
            <input
              value={draft.label}
              list="supplier-price-items"
              placeholder="Chicken, or LPG, or bags"
              onChange={(e) => {
                const label = e.target.value;
                // Picking a real ingredient links the row, which is what
                // lets the quote be held against the current cost. Typing
                // something that is not one is fine and stays free text —
                // gas and bags are half of what a supplier sells.
                const hit = items.find(
                  (i) => i.name.toLowerCase() === label.trim().toLowerCase()
                );
                setDraft({
                  ...draft,
                  label,
                  ingredientId: hit?.id ?? "",
                  unit: hit && draft.unit === blank.unit ? draft.unit : draft.unit,
                });
              }}
              className={boxClass}
            />
            <datalist id="supplier-price-items">
              {items.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
                Price
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className={boxClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
                For how many
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.qty}
                onChange={(e) => setDraft({ ...draft, qty: e.target.value })}
                className={boxClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
                Of what
              </span>
              <input
                value={draft.unit}
                list="supplier-price-units"
                placeholder="kg"
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className={boxClass}
              />
              <datalist id="supplier-price-units">
                {["kg", "g", "L", "ml", "pc", "pack", "sack"].map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </label>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-800/50">
            The way they said it — &ldquo;₱230 for 1 kg&rdquo;. Your recipes use
            their own units, and the comparison below does the sum when it can.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
              Note
            </span>
            <input
              value={draft.note}
              placeholder="Cheaper if you take two, ask for Nena"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className={boxClass}
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-ink-800/55 hover:text-ink-950"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-ink-950 px-4 py-1.5 text-xs font-black text-gold-400 hover:bg-ink-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save price"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceRow({
  row,
  canEdit,
  busy,
  onEdit,
  onRemove,
}: {
  row: SupplierPrice;
  canEdit: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const verdict = row.ingredientUnit
    ? compareToCost(row, { unit: row.ingredientUnit, cost: row.ingredientCost })
    : null;

  return (
    <li className="rounded-xl bg-cream-50 px-3 py-2.5 ring-1 ring-ink-950/8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-black text-ink-950">{row.label}</span>
        <span className="font-display text-sm font-black tabular-nums text-ink-950">
          {quoteLabel(row)}
        </span>
      </div>

      {verdict && verdict.kind !== "unknown" && (
        <p className="mt-1 text-xs leading-relaxed text-ink-800/65">
          That is{" "}
          <strong className="text-ink-950">
            {unitPeso(verdict.perUnit)}/{row.ingredientUnit}
          </strong>{" "}
          — {verdict.kind === "same" ? (
            <>about what you pay now.</>
          ) : (
            <>
              <strong
                className={
                  verdict.kind === "cheaper" ? "text-jade-700" : "text-brand-700"
                }
              >
                {Math.abs(Math.round(verdict.change * 100))}%{" "}
                {verdict.kind === "cheaper" ? "cheaper" : "dearer"}
              </strong>{" "}
              than the {unitPeso(verdict.against)}/{row.ingredientUnit} you pay now.
            </>
          )}
        </p>
      )}

      {/* Said rather than left blank. A comparison that silently does not
          appear reads as "these are the same", which is the one thing it
          does not mean. */}
      {verdict && verdict.kind === "unknown" && (
        <p className="mt-1 text-xs leading-relaxed text-ink-800/45">{verdict.why}</p>
      )}

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] text-ink-800/45">
          Asked {formatDate(row.quotedOn)}
          {row.note && <> · {row.note}</>}
        </span>
        {canEdit && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-ink-800/55 hover:bg-ink-950/5 hover:text-ink-950"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label={`Remove the price for ${row.label}`}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-ink-800/35 hover:bg-brand-600/10 hover:text-brand-700 disabled:opacity-50"
            >
              ✕
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
