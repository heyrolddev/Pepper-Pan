"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { peso } from "@/lib/costing";
import { recordWaste, type WasteCategory } from "@/app/admin/inventory/actions";
import type { RecipeOption } from "@/components/recipe-editor";

/** The reasons that actually come up, so nobody has to invent wording. */
const REASONS: Record<WasteCategory, string[]> = {
  waste: ["Spoiled", "Spilt", "Burnt", "Dropped", "Past its date", "Wrong order"],
  internal: ["Staff meal", "Tasting", "Sample for a customer", "Photo shoot"],
};

/**
 * Something didn't get sold.
 *
 * The category toggle is the whole design. Spoilage and staff meals both cost
 * money, but only one of them is a problem — and a single "waste" number that
 * mixes them is either an unfair indictment of the kitchen or a hiding place
 * for real spoilage, depending which way the mix runs.
 */
export function WasteForm({
  options,
  preselect,
  onClose,
}: {
  /** Ingredients and batches, priced. */
  options: RecipeOption[];
  preselect?: { kind: "inv" | "batch"; id: string };
  onClose: () => void;
}) {
  const [category, setCategory] = useState<WasteCategory>("waste");
  const [pick, setPick] = useState(
    preselect ? `${preselect.kind}:${preselect.id}` : ""
  );
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const byKey = useMemo(
    () => new Map(options.map((o) => [`${o.kind}:${o.id}`, o])),
    [options]
  );
  const chosen = byKey.get(pick);
  const amount = Number(qty) || 0;
  const cost = (chosen?.unitCost ?? 0) * amount;
  const short = chosen ? amount > chosen.stock : false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!chosen) {
      setError("Pick what it was.");
      return;
    }
    startTransition(async () => {
      const r = await recordWaste({
        sourceType: chosen.kind,
        sourceId: chosen.id,
        qty: amount,
        reason,
        category,
        note,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title="Log what didn't get sold"
      subtitle="It comes off the shelf either way — this is about knowing what it cost."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(["waste", "internal"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c);
                setReason("");
              }}
              aria-pressed={category === c}
              className={`rounded-xl px-3 py-3 text-left transition-colors ${
                category === c
                  ? c === "waste"
                    ? "bg-brand-600 text-cream-50"
                    : "bg-ink-950 text-cream-50"
                  : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
              }`}
            >
              <span className="block text-sm font-black uppercase tracking-wide">
                {c === "waste" ? "Wasted" : "Internal use"}
              </span>
              <span className="mt-0.5 block text-[11px] opacity-70">
                {c === "waste"
                  ? "Spoiled, spilt, burnt"
                  : "Staff meals, tasting"}
              </span>
            </button>
          ))}
        </div>

        <Field label="What was it">
          <Combobox
            value={pick}
            ariaLabel="What was it"
            placeholder="Type to search…"
            options={options.map((o) => ({
              value: `${o.kind}:${o.id}`,
              label: o.kind === "batch" ? `${o.name} (batch)` : o.name,
              hint: `${o.stock.toLocaleString("en-PH")} ${o.unit}`,
            }))}
            onChange={setPick}
          />
        </Field>

        <Field
          label={`How much${chosen ? ` (${chosen.unit})` : ""}`}
          hint={
            chosen
              ? `${chosen.stock.toLocaleString("en-PH")} ${chosen.unit} on hand.`
              : undefined
          }
        >
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass}
          />
        </Field>

        <Field label="What happened">
          <div className="flex flex-wrap gap-1.5">
            {REASONS[category].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  reason === r
                    ? "bg-ink-950 text-cream-50"
                    : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="or type your own"
            className={`${inputClass} mt-2`}
          />
        </Field>

        <Field label="Note" hint="Optional.">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. fridge left open overnight"
            className={inputClass}
          />
        </Field>

        {short && (
          <p className="rounded-xl bg-gold-400 px-4 py-3 text-sm text-ink-950">
            That&apos;s more than the {chosen!.stock.toLocaleString("en-PH")}{" "}
            {chosen!.unit} on record. It will still log — the count was
            probably already off — but the stock will go negative until
            somebody counts it.
          </p>
        )}

        {cost > 0 && (
          <div className="flex items-baseline justify-between rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
            <span className="text-sm font-bold opacity-70">
              {category === "waste" ? "Money lost" : "Money spent"}
            </span>
            <span className="font-display text-2xl font-black tabular-nums">
              {peso(cost)}
            </span>
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !chosen || amount <= 0}
          className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {busy ? "Logging…" : "Log it"}
        </button>
      </form>
    </AdminDialog>
  );
}
