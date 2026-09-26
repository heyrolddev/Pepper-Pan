"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminDialog, Field, inputClass } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { peso } from "@/lib/peso";
import { recordWasteMany, type WasteCategory } from "@/app/admin/inventory/actions";
import type { RecipeOption } from "@/components/recipe-editor";
import {
  doubledUp,
  overStock,
  partialReport,
  readyLines,
  wasteTotal,
  type WasteDraft,
} from "@/lib/waste-lines";

/** The reasons that actually come up, so nobody has to invent wording. */
const REASONS: Record<WasteCategory, string[]> = {
  waste: ["Spoiled", "Spilt", "Burnt", "Dropped", "Past its date", "Wrong order"],
  internal: ["Staff meal", "Tasting", "Sample for a customer", "Photo shoot"],
};

/**
 * Something didn't get sold — and usually more than one something.
 *
 * Two things carry this form.
 *
 * THE CATEGORY TOGGLE. Spoilage and staff meals both cost money, but only one
 * of them is a problem, and a single "waste" number that mixes them is either
 * an unfair indictment of the kitchen or a hiding place for real spoilage,
 * depending which way the mix runs.
 *
 * THE ROWS. Waste arrives in handfuls: the fridge is left open and it is the
 * pork, the beansprouts and half a batch of dumplings at once. One item per
 * dialog meant the shop logged the first thing, felt it had got the idea, and
 * the rest turned into a stock discrepancy a fortnight later — and nothing on
 * any screen could have shown that, because a waste log missing four lines
 * looks exactly like a good month.
 *
 * The reason and the note are shared across every row, because the shared
 * reason is what makes several rows ONE submission. A per-row reason would
 * cost a control on every line on a phone to serve a case — a staff meal and
 * a spillage together — that is already two categories, and therefore already
 * two submissions.
 */

let nextKey = 0;
function blankRow(): WasteDraft {
  nextKey += 1;
  return { key: `w${nextKey}`, pick: "", qty: "" };
}

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
  const [rows, setRows] = useState<WasteDraft[]>(() => [
    preselect
      ? { ...blankRow(), pick: `${preselect.kind}:${preselect.id}` }
      : blankRow(),
  ]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const catalogue = useMemo(
    () =>
      new Map(
        options.map((o) => [
          `${o.kind}:${o.id}`,
          {
            kind: o.kind,
            id: o.id,
            name: o.name,
            unit: o.unit,
            stock: o.stock,
            unitCost: o.unitCost,
          },
        ])
      ),
    [options]
  );

  const { ready, problems } = useMemo(
    () => readyLines(rows, catalogue),
    [rows, catalogue]
  );
  const total = wasteTotal(ready);
  const short = overStock(ready);
  const doubled = doubledUp(ready);
  const problemOn = useMemo(
    () => new Map(problems.map((p) => [p.key, p.what])),
    [problems]
  );

  const pickerOptions = useMemo(
    () =>
      options.map((o) => ({
        value: `${o.kind}:${o.id}`,
        label: o.kind === "batch" ? `${o.name} (batch)` : o.name,
        hint: `${o.stock.toLocaleString("en-PH")} ${o.unit}`,
      })),
    [options]
  );

  const setRow = (key: string, patch: Partial<WasteDraft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (problems.length > 0) {
      setError(problems[0].what);
      return;
    }
    if (ready.length === 0) {
      setError("Pick what it was.");
      return;
    }
    startTransition(async () => {
      const r = await recordWasteMany({
        lines: ready.map((l) => ({
          sourceType: l.kind,
          sourceId: l.id,
          qty: l.qty,
          name: l.name,
        })),
        reason,
        category,
        note,
      });
      if (r.error !== null) {
        setError(r.error);
        return;
      }
      /* A run can half-work: each line moves stock on its own, so a deleted
         ingredient on line two leaves line one applied. Closing on that
         would be the system knowing something and not saying it — and the
         cost is somebody logging the good lines a second time. The rows that
         went in are dropped, the rows that did not are left on screen with
         the reason, and the dialog stays open. */
      const partial = partialReport(r.done, r.failed);
      if (partial) {
        const failedNames = new Set(r.failed.map((f) => f.name));
        setRows((rs) => {
          const kept = rs.filter((row) => {
            const line = ready.find((l) => l.key === row.key);
            return !line || failedNames.has(line.name);
          });
          return kept.length > 0 ? kept : [blankRow()];
        });
        setError(partial);
        return;
      }
      onClose();
    });
  }

  return (
    <AdminDialog
      title="Log what did not get sold"
      subtitle="It comes off the shelf either way — this is about knowing what it cost. Add as many lines as you need."
      onClose={onClose}
      busy={busy}
      /* Wide, because the rows are a picker and a quantity side by side and
         at 464px the picker came out too narrow to read an ingredient name
         in. See AdminDialog for what that width actually buys. */
      wide
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
                {c === "waste" ? "Spoiled, spilt, burnt" : "Staff meals, tasting"}
              </span>
            </button>
          ))}
        </div>

        {/* ---- the rows ---- */}
        <Field label={rows.length > 1 ? `What was it — ${rows.length} lines` : "What was it"}>
          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const line = ready.find((l) => l.key === row.key);
              const complaint = problemOn.get(row.key);
              return (
                <div key={row.key} className="rounded-2xl bg-ink-950/[0.02] p-2 sm:bg-transparent sm:p-0">
                  {/* The picker gets its own line on a phone.

                      One row of four controls put the item picker — the whole
                      point of the line — at about 35 pixels wide at 390px,
                      because the quantity box beside it was quietly full
                      width: `inputClass` starts with `w-full`, and a `w-28`
                      written alongside it is settled by whichever width
                      utility Tailwind emits last. The width now lives on a
                      wrapper, where it cannot be overruled, and below 640px
                      the picker takes the line to itself. */}
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="w-full min-w-0 sm:flex-1">
                      <Combobox
                        value={row.pick}
                        ariaLabel={`What was it, line ${i + 1}`}
                        placeholder="Type to search…"
                        options={pickerOptions}
                        onChange={(v) => setRow(row.key, { pick: v })}
                      />
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <span className="flex-1 sm:w-32 sm:flex-none">
                        <input
                          value={row.qty}
                          onChange={(e) => setRow(row.key, { qty: e.target.value })}
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          aria-label={`How much, line ${i + 1}`}
                          /* "Qty", not "How much" — at 128px the longer
                             word clipped to "How muc", and a placeholder that
                             cannot finish its own sentence reads as a broken
                             box rather than a hint. The full question is on
                             the aria-label, where it has no width to fit. */
                          placeholder="Qty"
                          className={`${inputClass} text-right tabular-nums`}
                        />
                      </span>
                      {/* The unit lives beside the box rather than inside the
                          label, because with several rows the label is shared
                          and the units are not — grams on one line and pieces
                          on the next. */}
                      <span className="w-9 shrink-0 text-xs font-bold text-ink-800/45">
                        {line?.unit ?? catalogue.get(row.pick)?.unit ?? ""}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRows((rs) =>
                            rs.length === 1
                              ? [blankRow()]
                              : rs.filter((r) => r.key !== row.key)
                          )
                        }
                        aria-label={`Remove line ${i + 1}`}
                        className="grid h-10 w-9 shrink-0 place-items-center rounded-lg bg-ink-950/5 text-xs text-ink-800/50 transition-colors hover:bg-brand-600 hover:text-cream-50"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-ink-800/45">
                      {complaint ? (
                        <span className="font-bold text-brand-600">{complaint}</span>
                      ) : line ? (
                        `${line.stock.toLocaleString("en-PH")} ${line.unit} on hand`
                      ) : (
                        ""
                      )}
                    </span>
                    {line && line.cost > 0 && (
                      <span className="font-bold tabular-nums text-ink-800/55">
                        {peso(line.cost)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
            className="mt-2 rounded-xl bg-ink-950/5 px-4 py-2 text-sm font-black text-ink-950 transition-colors hover:bg-ink-950 hover:text-cream-50"
          >
            + Another line
          </button>
        </Field>

        <Field label="What happened" hint="One reason for every line above.">
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

        {doubled.length > 0 && (
          <p className="rounded-xl bg-ink-950/[0.06] px-4 py-3 text-sm text-ink-950">
            <strong>{doubled.join(", ")}</strong>{" "}
            {doubled.length === 1 ? "is" : "are"} on more than one line. Both
            will come off the shelf — fine if that is two separate lots, worth
            a look if one of them was meant to replace the other.
          </p>
        )}

        {short.length > 0 && (
          <p className="rounded-xl bg-gold-400 px-4 py-3 text-sm text-ink-950">
            {short.map((l) => `${l.name} (${l.stock.toLocaleString("en-PH")} ${l.unit} on record)`).join(", ")}{" "}
            — that&apos;s more than the count says is there. It will still log
            — the count was probably already off — but the stock will go
            negative until somebody counts it.
          </p>
        )}

        {total > 0 && (
          <div className="flex items-baseline justify-between rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
            <span className="text-sm font-bold opacity-70">
              {category === "waste" ? "Money lost" : "Money spent"}
              {ready.length > 1 && (
                <span className="ml-2 opacity-70">across {ready.length} lines</span>
              )}
            </span>
            <span className="font-display text-2xl font-black tabular-nums">
              {peso(total)}
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
          disabled={busy || ready.length === 0 || problems.length > 0 || !reason.trim()}
          className="w-full rounded-2xl bg-ink-950 py-3.5 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
        >
          {busy
            ? "Logging…"
            : ready.length > 1
              ? `Log all ${ready.length}`
              : "Log it"}
        </button>
      </form>
    </AdminDialog>
  );
}
