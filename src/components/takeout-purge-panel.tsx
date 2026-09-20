"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runTakeoutPurge } from "@/app/admin/menu/actions";
import type { PurgePlan } from "@/lib/takeout-purge";

/**
 * Deleting the "(T.O)" twins for good, from the Menu screen.
 *
 * Same show-then-do shape as the merge panel above it, and for a stronger
 * reason: this one cannot be undone. So the plan is on screen, dish by dish,
 * before the button that does it exists — and the button names the numbers
 * rather than saying "confirm", because a count is the one thing that makes
 * somebody read a sentence they have already decided to agree with.
 *
 * The heading does not say "delete your sales", because that is not what
 * happens and the panel has to be believed. Every peso lives on the ORDER and
 * is untouched; what goes is the line saying which dish was in it. Getting
 * that distinction the wrong way round would either frighten the owner off a
 * tidy-up they asked for, or let them run it thinking less was at stake.
 */
export function TakeoutPurgePanel({ plan }: { plan: PurgePlan }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<{ deleted: number; lines: number; failed: string[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (plan.error) return null;
  if (plan.rows.length === 0 && !result) return null;

  if (result) {
    return (
      <div className="rounded-3xl bg-jade-600 px-5 py-4 text-cream-50">
        <p className="font-display text-lg font-black">
          Gone — {result.deleted} take-out dish{result.deleted === 1 ? "" : "es"} deleted.
        </p>
        <p className="mt-1 text-sm opacity-90">
          {result.lines > 0
            ? `${result.lines} order line${result.lines === 1 ? "" : "s"} went with them. `
            : ""}
          Your takings, profit and cash are unchanged — those live on the order,
          not on the dish.
        </p>
        {result.failed.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {result.failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <h3 className="font-display text-lg font-black text-ink-950">
        Delete the {plan.rows.length} old &ldquo;(T.O)&rdquo; dish
        {plan.rows.length === 1 ? "" : "es"} for good
      </h3>
      <p className="mt-1 max-w-2xl text-sm text-ink-800/70">
        These were collapsed into take-out packaging and hidden. They are off
        the menu already, but they still turn up in every dish list in HQ.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <p className="rounded-xl bg-jade-600/10 px-4 py-2.5 text-sm text-ink-800/80 ring-1 ring-jade-600/25">
          <strong className="text-ink-950">Not affected:</strong> takings,
          profit, COGS, cash, break-even, payback. Every peso is recorded on
          the order, not on the dish.
        </p>
        <p className="rounded-xl bg-gold-50 px-4 py-2.5 text-sm text-ink-800/80 ring-1 ring-gold-400/40">
          <strong className="text-ink-950">Lost for good:</strong>{" "}
          {plan.totalOrderLines} line
          {plan.totalOrderLines === 1 ? "" : "s"} saying which old order
          contained which of these, and their rows in Analytics.
        </p>
      </div>

      <details className="mt-3 rounded-2xl bg-cream-50 ring-1 ring-ink-950/10">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-ink-800">
          See all {plan.rows.length}
        </summary>
        <ul className="max-h-56 overflow-y-auto px-4 pb-3 text-sm text-ink-800/75">
          {plan.rows.map((r) => (
            <li key={r.id} className="flex justify-between gap-3 py-0.5">
              <span className="truncate">{r.name}</span>
              <span className="shrink-0 tabular-nums text-ink-800/45">
                {r.orderLines === 0 ? "never sold" : `${r.orderLines} sold`}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {plan.blocked.length > 0 && (
        <p className="mt-2 text-xs text-ink-800/55">
          {plan.blocked.length} cannot go and will be left alone:{" "}
          {plan.blocked.join("; ")}.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {armed ? (
          <>
            <button
              onClick={() => {
                setError(null);
                start(async () => {
                  const r = await runTakeoutPurge();
                  if (r.error) return setError(r.error);
                  setResult(r);
                  router.refresh();
                });
              }}
              disabled={pending}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {pending
                ? "Deleting…"
                : `Yes — delete ${plan.rows.length} dishes and ${plan.totalOrderLines} order lines`}
            </button>
            <button
              onClick={() => setArmed(false)}
              disabled={pending}
              className="text-sm font-semibold text-ink-800/60 hover:text-ink-950"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setArmed(true)}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
          >
            Delete them for good
          </button>
        )}
        {/* Not a checkbox promising a backup was taken — a link to the screen
            that takes one. A tick box asking somebody to confirm they did a
            thing they have not done is a formality, not a safety net. */}
        <Link
          href="/admin/backup"
          className="text-sm font-bold text-brand-600 underline underline-offset-2"
        >
          Take a backup first
        </Link>
      </div>
    </div>
  );
}
