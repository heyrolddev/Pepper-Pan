"use client";

import { useEffect, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { formatDateTimeFull } from "@/lib/format-date";
import { batchHistory, createBatch } from "@/app/admin/inventory/actions";
import type { Activity } from "@/lib/activity";

/**
 * Making a new batch, and seeing what happened to an old one.
 *
 * Two gaps that were only obvious once the shop tried to use the tab for real
 * work rather than for reading.
 *
 * There was no way to create a batch at all. They could be costed, cooked,
 * edited and drawn on, and the only route to a twenty-seventh one was the
 * legacy importer — invisible until somebody invents a new sauce.
 *
 * And a batch's stock moved for four different reasons with nothing on screen
 * saying which. "Why is there only 200g of sauce" had no answer short of
 * guessing.
 */

export function AddBatchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="self-start rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
    >
      + Add a batch
    </button>
  );
}

export function NewBatchForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [yieldQty, setYieldQty] = useState("");
  const [yieldUnit, setYieldUnit] = useState("g");
  const [reorder, setReorder] = useState("");
  const [repack, setRepack] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await createBatch({
        name,
        yieldQty: Number(yieldQty) || 0,
        yieldUnit,
        reorderLevel: Number(reorder) || 0,
        manualCostPerUnit: repack ? Number(manual) || 0 : null,
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
      title="New batch"
      subtitle="Something you cook in bulk and then draw on — a sauce, a marinade, liquid butter."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Black pepper sauce"
            className={inputClass}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="One batch makes"
            hint="Every recipe that uses it divides by this."
          >
            <input
              value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="1000"
              className={inputClass}
            />
          </Field>
          <Field label="Unit">
            <input
              value={yieldUnit}
              onChange={(e) => setYieldUnit(e.target.value)}
              placeholder="g"
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Tell me when it drops below"
          hint="Optional. Leave blank and it never nags."
        >
          <input
            value={reorder}
            onChange={(e) => setReorder(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0"
            className={inputClass}
          />
        </Field>

        {/* A repack is the exception that has to be said out loud: bought
            ready-made and split into portions, so it has no recipe and
            producing one would otherwise be refused as "nothing to make it
            from". */}
        <label className="flex items-start gap-3 rounded-xl bg-cream-100 px-3 py-2.5">
          <input
            type="checkbox"
            checked={repack}
            onChange={(e) => setRepack(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm">
            <span className="font-bold text-ink-950">
              It&apos;s a repack, not something you cook
            </span>
            <span className="mt-0.5 block text-xs text-ink-800/55">
              Bought ready-made and split into portions. No recipe — you type
              in what a unit costs instead.
            </span>
          </span>
        </label>

        {repack && (
          <Field label="Cost per unit" hint="₱ per one of the unit above.">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        )}

        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim() || !(Number(yieldQty) > 0)}
          className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {busy ? "Adding…" : "Add it"}
        </button>
        <p className="text-center text-xs text-ink-800/50">
          {repack
            ? "Priced by hand, so it's ready to use straight away."
            : "Next: tap Recipe on the new card to say what goes in it."}
        </p>
      </form>
    </AdminDialog>
  );
}

export function BatchHistoryDialog({
  batch,
  onClose,
}: {
  batch: { id: string; name: string; stock: number; yieldUnit: string };
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    batchHistory(batch.id).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setRows(r.rows);
    });
    return () => {
      alive = false;
    };
  }, [batch.id]);

  return (
    <AdminDialog
      title={batch.name}
      subtitle={`${batch.stock.toLocaleString("en-PH")} ${batch.yieldUnit} on hand — here's how it got there.`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        {rows === null ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-6 text-center text-sm text-ink-800/60">
            Looking…
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
            Nothing recorded against this one yet. Making a batch, changing its
            recipe or throwing some away will all turn up here.
          </p>
        ) : (
          <ul className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl bg-cream-100 px-4 py-2.5 ring-1 ring-ink-950/10"
              >
                <p className="text-sm leading-relaxed text-ink-950">
                  {r.description}
                </p>
                <p className="mt-0.5 text-xs text-ink-800/50">
                  {formatDateTimeFull(r.at)}
                  {r.who && <> · {r.who}</>}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-ink-800/45">
          Read from the shop&apos;s activity log rather than a separate list of
          movements — one record of what happened, so there is nothing to
          disagree with itself.
        </p>
      </div>
    </AdminDialog>
  );
}
