"use client";

import { useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminSearch } from "@/components/admin-search";
import { telHref, type Supplier } from "@/lib/suppliers";
import {
  deleteSupplier,
  saveSupplier,
} from "@/app/admin/suppliers/actions";

/**
 * The people the shop buys from.
 *
 * Written for the moment it is actually used, which is not sitting down at a
 * desk: the shelf is empty, the chicken hasn't come, and somebody needs the
 * number. So the phone number is the biggest thing on the row after the name,
 * and it is a link — one tap dials it.
 *
 * "What you buy here" is free text rather than a list of ingredients tied to
 * the inventory, because half of what a supplier sells isn't an ingredient:
 * gas, bags, a repair. A picker would have been tidier and would have had
 * nowhere to put the gas dealer.
 */

const boxClass =
  "w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400";

type Draft = {
  id?: string;
  name: string;
  phone: string;
  place: string;
  sells: string;
  note: string;
  active: boolean;
};

const blank: Draft = {
  name: "",
  phone: "",
  place: "",
  sells: "",
  note: "",
  active: true,
};

export function SupplierList({
  rows,
  canEdit,
  error,
}: {
  rows: Supplier[];
  /** Owner and manager. A shift reads the list but doesn't curate it. */
  canEdit: boolean;
  error: string | null;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  function save() {
    if (!draft) return;
    setProblem(null);
    startBusy(async () => {
      const res = await saveSupplier(draft);
      if (res.error) setProblem(res.error);
      else setDraft(null);
    });
  }

  function remove() {
    if (!confirmDelete) return;
    setProblem(null);
    startBusy(async () => {
      const res = await deleteSupplier(confirmDelete.id);
      if (res.error) setProblem(res.error);
      else setConfirmDelete(null);
    });
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <p className="font-display text-lg font-black text-ink-950">
          Run migration 0045
        </p>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          The supplier list lives in a table that doesn&apos;t exist yet. Run{" "}
          <code className="rounded bg-cream-50 px-1">
            supabase/migrations/0045_suppliers_debts_and_running_costs.sql
          </code>{" "}
          in the Supabase SQL Editor.
        </p>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-2 font-mono text-xs text-ink-800/70">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {problem && (
        <p className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-cream-50">
          {problem}
        </p>
      )}

      {canEdit && (
        <div>
          <button
            onClick={() => setDraft({ ...blank })}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
          >
            + Add a supplier
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
          Nobody here yet. Add the three or four you buy from most — after that
          a restock is a tap instead of typing the name again.
        </p>
      ) : (
        <AdminSearch
          rows={rows}
          searchText={(s) =>
            [s.name, s.phone, s.place, s.sells, s.note].filter(Boolean).join(" ")
          }
          noun="supplier"
          placeholder="Search name, place, what they sell…"
        >
          {(filtered) => (
            <ul className="flex flex-col gap-2">
              {filtered.map((s) => {
                const tel = telHref(s.phone);
                return (
                  <li
                    key={s.id}
                    className={`rounded-2xl p-4 ring-1 ${
                      s.active
                        ? "bg-cream-100 ring-ink-950/10"
                        : "bg-cream-100/50 ring-ink-950/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`font-display text-lg font-bold ${
                            s.active ? "text-ink-950" : "text-ink-800/45"
                          }`}
                        >
                          {s.name}
                          {!s.active && (
                            <span className="ml-2 rounded-full bg-ink-950/8 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/50">
                              Not using
                            </span>
                          )}
                        </p>
                        {s.place && (
                          <p className="mt-0.5 text-sm text-ink-800/60">{s.place}</p>
                        )}
                      </div>
                      {/* The reason anybody opens this page: the number, one
                          tap from dialling, while standing at an empty shelf. */}
                      {s.phone &&
                        (tel ? (
                          <a
                            href={tel}
                            className="shrink-0 rounded-xl bg-jade-600 px-4 py-2 text-sm font-black text-cream-50 transition-colors hover:bg-jade-700"
                          >
                            {s.phone}
                          </a>
                        ) : (
                          <span className="shrink-0 text-sm font-bold text-ink-800/60">
                            {s.phone}
                          </span>
                        ))}
                    </div>

                    {s.sells && (
                      <p className="mt-3 rounded-xl bg-cream-50 px-3 py-2 text-sm text-ink-800/75">
                        <span className="text-[10px] font-black uppercase tracking-widest text-ink-800/45">
                          Buys here
                        </span>
                        <span className="mt-0.5 block">{s.sells}</span>
                      </p>
                    )}
                    {s.note && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-800/50">
                        {s.note}
                      </p>
                    )}

                    {canEdit && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() =>
                            setDraft({
                              id: s.id,
                              name: s.name,
                              phone: s.phone ?? "",
                              place: s.place ?? "",
                              sells: s.sells ?? "",
                              note: s.note ?? "",
                              active: s.active,
                            })
                          }
                          className="rounded-lg bg-ink-950/5 px-3 py-1.5 text-xs font-bold text-ink-800 hover:bg-ink-950/10"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(s)}
                          className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/45 hover:text-brand-700"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </AdminSearch>
      )}

      {draft && (
        <AdminDialog
          title={draft.id ? "Edit supplier" : "New supplier"}
          subtitle="Whatever you'd want to know standing in front of an empty shelf."
          onClose={() => setDraft(null)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Aling Nena"
                className={boxClass}
                autoFocus
              />
            </Field>
            <Field label="Phone">
              <input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="0917 555 1234"
                className={boxClass}
              />
            </Field>
            <Field label="Where">
              <input
                value={draft.place}
                onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                placeholder="Apalit public market, second aisle"
                className={boxClass}
              />
            </Field>
            <Field
              label="What you buy here"
              hint="In your own words. Not everything a supplier sells is an ingredient — gas, bags, a repair."
            >
              <input
                value={draft.sells}
                onChange={(e) => setDraft({ ...draft, sells: e.target.value })}
                placeholder="chicken, gulay, minsan noodles"
                className={boxClass}
              />
            </Field>
            <Field label="Note" hint="Delivery days, who to ask for, anything.">
              <input
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Delivers Tue and Fri, ask for Nena herself"
                className={boxClass}
              />
            </Field>

            <label className="flex items-center gap-3 rounded-xl bg-cream-100 px-3 py-2.5">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                className="h-4 w-4"
              />
              <span className="text-sm">
                <span className="font-bold text-ink-950">Still buying here</span>
                <span className="mt-0.5 block text-xs text-ink-800/55">
                  Turn this off instead of removing them — old deliveries keep
                  their name, and they drop out of the restock chips.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDraft(null)}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
              >
                Never mind
              </button>
              <button
                onClick={save}
                disabled={busy || !draft.name.trim()}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}

      {confirmDelete && (
        <AdminDialog
          title={`Remove ${confirmDelete.name}?`}
          subtitle="Deliveries you already recorded keep their name — this only takes them off the list."
          onClose={() => setConfirmDelete(null)}
          busy={busy}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-ink-800/70">
              If you might buy here again, switch{" "}
              <strong className="text-ink-950">Still buying here</strong> off
              instead. That keeps the history joined up and takes them out of
              the restock chips just the same.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-ink-800/60 hover:text-ink-950"
              >
                Keep them
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink-800/45">{hint}</span>}
    </label>
  );
}
