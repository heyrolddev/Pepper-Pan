"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminDialog } from "@/components/admin-dialog";
import { Combobox } from "@/components/combobox";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { peso } from "@/lib/peso";
import { hqTitle } from "@/lib/hq-theme";
import {
  deletePromo,
  savePromo,
  setPromoActive,
  type PromoInput,
} from "@/app/admin/promos/promo-actions";
import type { PromoKind, PromoScope } from "@/lib/promos";

/**
 * Discounts, and the codes customers type.
 *
 * ── The one screen here that gives food away ────────────────────────────
 *
 * Every other editor in HQ records something. This one writes a rule that
 * takes money off a sale, which is why the form is blunt about the two
 * numbers that decide how much it can cost: how many times it may be used,
 * and the ceiling on a percentage. A "50% off" with no cap and no limit is
 * one party order away from a very expensive afternoon, and the owner
 * should be told that before they save it rather than after.
 *
 * ── Why a promo can have no code ────────────────────────────────────────
 *
 * Two things live here. A CODE is typed by a customer online. A counter
 * discount — senior, PWD, a friend of the shop — is picked from a list by
 * the cashier and nobody types anything. Same arithmetic, same table, and
 * the only difference is whether there is a string to type, so they are one
 * form with one field left blank rather than two screens that drift.
 */

export type PromoRow = {
  id: string;
  code: string | null;
  label: string;
  description: string | null;
  kind: PromoKind;
  value: number;
  scope: PromoScope;
  meal_id: string | null;
  min_spend: number;
  max_discount: number | null;
  max_uses: number | null;
  max_per_customer: number | null;
  starts_on: string | null;
  ends_on: string | null;
  online: boolean;
  at_counter: boolean;
  is_active: boolean;
  /** How many times it has actually been claimed. */
  used: number;
  /** What those uses have cost the shop, in pesos. */
  given: number;
};

export type PickableDish = { id: string; name: string };

type Draft = PromoInput & { id?: string };

const field =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";
const label =
  "text-[11px] font-black uppercase tracking-widest text-ink-800/55";

const blank = (): Draft => ({
  code: "",
  label: "",
  description: "",
  kind: "percent",
  value: 10,
  scope: "order",
  mealId: null,
  minSpend: 0,
  maxDiscount: null,
  maxUses: null,
  maxPerCustomer: 1,
  startsOn: null,
  endsOn: null,
  online: true,
  atCounter: true,
  isActive: true,
});

const draftOf = (p: PromoRow): Draft => ({
  id: p.id,
  code: p.code ?? "",
  label: p.label,
  description: p.description ?? "",
  kind: p.kind,
  value: Number(p.value),
  scope: p.scope,
  mealId: p.meal_id,
  minSpend: Number(p.min_spend) || 0,
  maxDiscount: p.max_discount === null ? null : Number(p.max_discount),
  maxUses: p.max_uses === null ? null : Number(p.max_uses),
  maxPerCustomer: p.max_per_customer === null ? null : Number(p.max_per_customer),
  startsOn: p.starts_on,
  endsOn: p.ends_on,
  online: p.online,
  atCounter: p.at_counter,
  isActive: p.is_active,
});

/** What it takes off, in the words on a poster. */
function offText(p: { kind: PromoKind; value: number }) {
  return p.kind === "percent" ? `${p.value}% off` : `${peso(p.value)} off`;
}

export function PromoCodes({
  rows,
  dishes,
}: {
  rows: PromoRow[];
  dishes: PickableDish[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PromoRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const dishName = (id: string | null) =>
    dishes.find((d) => d.id === id)?.name ?? "a deleted dish";

  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      setError(null);
      after?.();
      router.refresh();
    });

  return (
    <section className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className={hqTitle}>Discounts &amp; promo codes</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/65">
            A <strong>code</strong> is typed by a customer before they check
            out. A <strong>counter discount</strong> has no code — the cashier
            picks it from a list at the till. Both come off the food, never off
            the delivery fee, and both are worked out on our side: nothing a
            phone sends about a price is believed.
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setDraft(blank());
          }}
          className="shrink-0 rounded-2xl bg-ink-950 px-5 py-3 text-sm font-black text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50"
        >
          + New discount
        </button>
      </div>

      {error && !draft && (
        <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-5 rounded-2xl border-2 border-dashed border-ink-950/15 p-6 text-sm text-ink-800/60">
          No discounts yet. A code lets you put something on a poster —
          &ldquo;SULIT50&rdquo; — and know exactly what it cost you.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((p) => (
            <li
              key={p.id}
              className={`rounded-2xl bg-cream-50 p-4 ring-1 ${
                p.is_active ? "ring-ink-950/10" : "ring-ink-950/5 opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    {p.code ? (
                      <span className="rounded-lg bg-ink-950 px-2 py-1 font-mono text-sm font-black tracking-wider text-gold-400">
                        {p.code}
                      </span>
                    ) : (
                      <span className="rounded-full bg-ink-950/[0.07] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-ink-800/60">
                        counter only
                      </span>
                    )}
                    <span className="font-display text-base font-black text-ink-950">
                      {p.label}
                    </span>
                    <span className="rounded-full bg-jade-600/12 px-2.5 py-1 text-xs font-black text-jade-700">
                      {offText(p)}
                    </span>
                    {p.scope === "meal" && (
                      <span className="rounded-full bg-gold-400/25 px-2.5 py-1 text-[11px] font-bold text-ink-900">
                        {dishName(p.meal_id)} only
                      </span>
                    )}
                    {/* Said on the card, because "100% off" on a list of
                        codes is alarming until you know it is the padala. */}
                    {p.scope === "delivery" && (
                      <span className="rounded-full bg-jade-600/15 px-2.5 py-1 text-[11px] font-bold text-jade-700">
                        Delivery only
                      </span>
                    )}
                  </p>

                  {/* The terms, in one line, in the order somebody asks
                      about them at a counter. */}
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-800/60">
                    {p.min_spend > 0 && <span>min {peso(p.min_spend)}</span>}
                    {p.max_discount !== null && <span>up to {peso(p.max_discount)}</span>}
                    <span>
                      {p.max_uses === null
                        ? "unlimited uses"
                        : `${p.used}/${p.max_uses} used`}
                    </span>
                    {p.max_per_customer !== null && (
                      <span>{p.max_per_customer} each</span>
                    )}
                    {(p.starts_on || p.ends_on) && (
                      <span>
                        {p.starts_on ?? "any time"} → {p.ends_on ?? "no end"}
                      </span>
                    )}
                    <span>
                      {p.online && p.at_counter
                        ? "online & counter"
                        : p.online
                          ? "online only"
                          : "counter only"}
                    </span>
                  </p>

                  {/* The number the owner actually wants: what it has cost.
                      A promo nobody can price is a promo nobody can decide
                      to stop. */}
                  <p className="mt-2 text-xs font-bold text-ink-800/70">
                    {p.used === 0
                      ? "Not used yet"
                      : `Used ${p.used} time${p.used === 1 ? "" : "s"} · given away ${peso(p.given)}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => run(() => setPromoActive(p.id, !p.is_active))}
                    disabled={busy}
                    className={`rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
                      p.is_active
                        ? "bg-jade-600 text-cream-50"
                        : "bg-ink-950/10 text-ink-800/60"
                    }`}
                  >
                    {p.is_active ? "On" : "Off"}
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setDraft(draftOf(p));
                    }}
                    aria-label={`Edit ${p.label}`}
                    className="grid h-9 w-9 place-items-center rounded-full bg-ink-950/5 text-ink-800 transition-colors hover:bg-ink-950 hover:text-cream-50"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p)}
                    aria-label={`Delete ${p.label}`}
                    className="grid h-9 w-9 place-items-center rounded-full text-ink-800/40 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          dishes={dishes}
          busy={busy}
          error={error}
          onSave={() =>
            run(
              () => savePromo(draft),
              () => setDraft(null)
            )
          }
          onClose={() => setDraft(null)}
        />
      )}

      {confirmDelete && (
        <AdminDialog
          title={`Delete "${confirmDelete.label}"?`}
          subtitle="It stops working immediately, everywhere."
          busy={busy}
          onClose={() => setConfirmDelete(null)}
        >
          <div className="flex flex-col gap-4">
            <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800/75">
              Orders that already used it keep the code and the amount on
              them, so old receipts still add up. What goes is the rule and
              the record of who claimed it —{" "}
              <strong>
                which means a &ldquo;one each&rdquo; code becomes available
                again to everybody who already used it.
              </strong>{" "}
              Switching it <strong>Off</strong> instead keeps that history.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={busy}
                className="rounded-full px-5 py-2.5 font-bold text-ink-800/70 hover:text-ink-950 disabled:opacity-50"
              >
                Keep it
              </button>
              <button
                onClick={() =>
                  run(
                    () => deletePromo(confirmDelete.id),
                    () => setConfirmDelete(null)
                  )
                }
                disabled={busy}
                className="rounded-full bg-brand-600 px-6 py-2.5 font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete for good"}
              </button>
            </div>
          </div>
        </AdminDialog>
      )}
    </section>
  );
}

function Editor({
  draft,
  setDraft,
  dishes,
  busy,
  error,
  onSave,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  dishes: PickableDish[];
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  /* The two numbers that decide how much this can cost, and whether either
     is missing. A percentage with no ceiling and no usage limit is one
     party order away from a very expensive afternoon — said before it is
     saved rather than found out afterwards. */
  const uncapped =
    draft.kind === "percent" && !draft.maxDiscount && !draft.maxUses;

  return (
    <AdminDialog
      wide
      title={draft.id ? "Edit discount" : "New discount"}
      subtitle="What it takes off, who may use it, and how many times."
      busy={busy}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {/* ── what it is ─────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Name</span>
            <input
              autoFocus
              value={draft.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="Sulit Sabado"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Code customers type</span>
            <input
              value={draft.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder="SULIT50"
              className={`${field} font-mono uppercase tracking-wider`}
            />
            <span className="text-[11px] text-ink-800/50">
              Leave blank for a counter-only discount — senior, PWD, a friend
              of the shop. Nobody types those; the cashier picks them.
            </span>
          </label>
        </div>

        {/* ── how much ──────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
          <p className={label}>How much off</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(["percent", "amount"] as PromoKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={draft.kind === k}
                onClick={() => set({ kind: k, maxDiscount: null })}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  draft.kind === k
                    ? "bg-ink-950 text-cream-50"
                    : "bg-cream-50 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {k === "percent" ? "% off" : "₱ off"}
              </button>
            ))}
            <input
              inputMode="decimal"
              value={draft.value}
              onChange={(e) => set({ value: Number(e.target.value) })}
              aria-label="How much off"
              className={`${field} w-24 font-bold tabular-nums`}
            />
            {draft.kind === "percent" && (
              <label className="flex items-center gap-2 text-xs font-bold text-ink-800/70">
                but never more than ₱
                <input
                  inputMode="decimal"
                  value={draft.maxDiscount ?? ""}
                  onChange={(e) =>
                    set({
                      maxDiscount: e.target.value.trim()
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  placeholder="no cap"
                  aria-label="Most it can take off"
                  className="w-24 rounded-lg border-2 border-ink-950/15 bg-cream-50 px-2 py-1 text-sm font-bold tabular-nums text-ink-950 outline-none focus:border-brand-600"
                />
              </label>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["order", "meal", "delivery"] as PromoScope[]).map((sc) => (
              <button
                key={sc}
                type="button"
                aria-pressed={draft.scope === sc}
                /* A delivery code has no dish, and the database refuses one
                   (`promos_delivery_scope_has_no_meal`). Clearing it here
                   means switching scope cannot leave a stale dish behind to
                   be rejected on save with a constraint name nobody reads. */
                onClick={() =>
                  set({ scope: sc, mealId: sc === "meal" ? draft.mealId : null })
                }
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  draft.scope === sc
                    ? "bg-brand-600 text-cream-50"
                    : "bg-cream-50 text-ink-800/70 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {sc === "order"
                  ? "The whole order"
                  : sc === "meal"
                    ? "One dish"
                    : "The delivery"}
              </button>
            ))}
            {draft.scope === "delivery" && (
              <p className="w-full text-xs leading-relaxed text-ink-800/60">
                Comes off the <strong className="text-ink-950">padala</strong>, never the
                food. <strong className="text-ink-950">100% is free delivery.</strong> Set a
                minimum spend below and you have &ldquo;libreng padala sa ₱500 pataas&rdquo;
                — the minimum always measures the food, so a far delivery cannot unlock it
                on its own. A pickup order is told the code is for deliveries.
              </p>
            )}
            {draft.scope === "meal" && (
              <div className="min-w-0 flex-1">
                <Combobox
                  ariaLabel="Which dish"
                  placeholder="Which dish?"
                  value={draft.mealId ?? ""}
                  options={dishes.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={(mealId) => set({ mealId })}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── the limits ────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Minimum order</span>
            <input
              inputMode="decimal"
              value={draft.minSpend || ""}
              onChange={(e) => set({ minSpend: Number(e.target.value) || 0 })}
              placeholder="none"
              className={`${field} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Total uses</span>
            <input
              inputMode="numeric"
              value={draft.maxUses ?? ""}
              onChange={(e) =>
                set({ maxUses: e.target.value.trim() ? Number(e.target.value) : null })
              }
              placeholder="unlimited"
              className={`${field} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Uses per customer</span>
            <input
              inputMode="numeric"
              value={draft.maxPerCustomer ?? ""}
              onChange={(e) =>
                set({
                  maxPerCustomer: e.target.value.trim()
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="unlimited"
              className={`${field} tabular-nums`}
            />
            <span className="text-[11px] text-ink-800/50">
              Online only — a walk-in has no account to count against.
            </span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Starts</span>
            <input
              type="date"
              value={draft.startsOn ?? ""}
              onChange={(e) => set({ startsOn: e.target.value || null })}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Ends</span>
            <input
              type="date"
              value={draft.endsOn ?? ""}
              onChange={(e) => set({ endsOn: e.target.value || null })}
              className={field}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { k: "online" as const, on: draft.online, text: "Usable online" },
            { k: "atCounter" as const, on: draft.atCounter, text: "Usable at the counter" },
            { k: "isActive" as const, on: draft.isActive, text: "Running" },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              role="switch"
              aria-checked={t.on}
              onClick={() => set({ [t.k]: !t.on } as Partial<Draft>)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                t.on
                  ? "bg-jade-600 text-cream-50"
                  : "bg-cream-100 text-ink-800/60 ring-1 ring-ink-950/10"
              }`}
            >
              {t.on ? "✓ " : ""}
              {t.text}
            </button>
          ))}
        </div>

        {/* Said before it is saved, not found out on a Saturday. */}
        {uncapped && (
          <p className="rounded-2xl bg-gold-400/25 px-4 py-3 text-sm leading-relaxed text-ink-800">
            ⚠︎ <strong>{draft.value}% off, no ceiling, no limit on uses.</strong>{" "}
            On a ₱2,000 party order that is ₱{((2000 * draft.value) / 100).toFixed(0)}{" "}
            given away in one go, and it can happen again all day. Set a cap or
            a number of uses unless you really mean it.
          </p>
        )}

        {error && (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-600/20">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-5 py-2.5 font-bold text-ink-800/70 hover:text-ink-950 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={busy}
            className="rounded-full bg-ink-950 px-6 py-2.5 font-bold text-gold-400 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save discount"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}
