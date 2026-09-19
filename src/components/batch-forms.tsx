"use client";

import { useEffect, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { formatDateTimeFull } from "@/lib/format-date";
import {
  batchHistory,
  createBatch,
  deleteBatch,
  ingredientHistory,
  saveBatch,
} from "@/app/admin/inventory/actions";
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

/**
 * Change what a batch IS, rather than what is in it.
 *
 * Separate from the recipe editor on purpose. What goes into black pepper
 * sauce is edited standing at the shelf; what one batch of it makes is a
 * decision that silently reprices every dish drawing on it, and that deserves
 * a deliberate trip to a different form rather than a number nudged by
 * accident in passing.
 */
export function EditBatchForm({
  batch,
  onClose,
}: {
  batch: {
    id: string;
    name: string;
    yieldQty: number;
    yieldUnit: string;
    reorder: number;
    stock: number;
  };
  onClose: () => void;
}) {
  const [name, setName] = useState(batch.name);
  const [yieldQty, setYieldQty] = useState(String(batch.yieldQty));
  const [yieldUnit, setYieldUnit] = useState(batch.yieldUnit);
  const [reorder, setReorder] = useState(batch.reorder ? String(batch.reorder) : "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const yieldMoved = Number(yieldQty) !== batch.yieldQty;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveBatch({
        id: batch.id,
        name,
        yieldQty: Number(yieldQty) || 0,
        yieldUnit,
        reorderLevel: Number(reorder) || 0,
        // Not editable here: a repack's typed-in cost belongs with the recipe
        // decision, and changing it by accident on a rename would move every
        // margin that uses it.
        manualCostPerUnit: null,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog title={`Edit ${batch.name}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="One batch makes">
            <input
              value={yieldQty}
              onChange={(e) => setYieldQty(e.target.value)}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <Field label="Unit">
            <input
              value={yieldUnit}
              onChange={(e) => setYieldUnit(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {yieldMoved && (
          <p className="rounded-xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80">
            Changing what a batch makes <strong>reprices every dish</strong>{" "}
            that uses it — the cost per {yieldUnit || "unit"} is the batch cost
            divided by this number.
          </p>
        )}

        <Field label="Tell me when it drops below" hint="Leave blank and it never nags.">
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
          {busy ? "Saving…" : "Save"}
        </button>

        <div className="border-t border-ink-950/10 pt-4">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-sm font-bold text-brand-700 hover:underline"
            >
              Delete this batch
            </button>
          ) : (
            <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-600/25">
              <p className="text-sm leading-relaxed text-ink-800/80">
                Delete <strong className="text-ink-950">{batch.name}</strong>?
                {batch.stock > 0 && (
                  <>
                    {" "}
                    There {batch.stock === 1 ? "is" : "are"} still{" "}
                    <strong className="text-ink-950">
                      {batch.stock.toLocaleString("en-PH")} {batch.yieldUnit}
                    </strong>{" "}
                    recorded as made.
                  </>
                )}{" "}
                Any dish or batch still using it will stop you — nothing that
                is part of a recipe can be removed out from under it.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="rounded-xl px-4 py-2 text-sm font-bold text-ink-800/60 hover:text-ink-950"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const r = await deleteBatch(batch.id);
                      if (r.error !== null) {
                        setError(r.error);
                        setConfirming(false);
                        return;
                      }
                      onClose();
                    })
                  }
                  className="rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete it"}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </AdminDialog>
  );
}

/** An ingredient's own history — same dialog, same reader, different filter. */
export function IngredientHistoryDialog({
  row,
  onClose,
}: {
  row: { id: string; name: string; stock: number; unit: string };
  onClose: () => void;
}) {
  return (
    <HistoryDialog
      title={row.name}
      subtitle={`${row.stock.toLocaleString("en-PH")} ${row.unit} on hand — here's how it got there.`}
      load={() => ingredientHistory(row.id)}
      onClose={onClose}
    />
  );
}

export function BatchHistoryDialog({
  batch,
  onClose,
}: {
  batch: { id: string; name: string; stock: number; yieldUnit: string };
  onClose: () => void;
}) {
  return (
    <HistoryDialog
      title={batch.name}
      subtitle={`${batch.stock.toLocaleString("en-PH")} ${batch.yieldUnit} on hand — here's how it got there.`}
      load={() => batchHistory(batch.id)}
      onClose={onClose}
    />
  );
}

/**
 * One history dialog, two callers.
 *
 * An ingredient and a batch ask the same question of the same log with a
 * different filter, and two copies of this would drift the first time one of
 * them learned to show something the other did not.
 */
function HistoryDialog({
  title,
  subtitle,
  load,
  onClose,
}: {
  title: string;
  subtitle: string;
  load: () => Promise<{ rows: Activity[]; error: string | null }>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    load().then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setRows(r.rows);
    });
    return () => {
      alive = false;
    };
    // `load` is a fresh closure each render; depending on it would refetch for
    // ever. The dialog is keyed by id at the call site, so a different thing
    // is a different component rather than the same one being told to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminDialog title={title} subtitle={subtitle} onClose={onClose}>
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
