"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runTakeoutMerge } from "@/app/admin/menu/actions";
import type { MergePlan } from "@/lib/takeout-merge";

/**
 * Collapsing the "(T.O)" duplicates, from the Menu screen.
 *
 * This was a command-line script, which meant the one person who needs it —
 * the owner of a food stall — would have had to install Node, put their
 * database's service-role key in a file, and type a command. For a job done
 * once, that is not a reasonable ask.
 *
 * The shape is show-then-do, and the "show" is the important half. This is
 * the heaviest single change the software can make to a menu: 27 dishes at
 * once. Nobody should press that button without having read what it will do,
 * so the plan is on screen before the button exists, listed dish by dish.
 *
 * It appears only when there is something to collapse, and takes itself away
 * afterwards.
 */
export function TakeoutMergePanel({ plan }: { plan: MergePlan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (plan.error) return null;
  // Nothing to collapse AND nothing to report — the job is done, so the panel
  // goes away. But if every twin was skipped, staying silent would leave the
  // owner with "(T.O)" dishes still on the menu and no idea why the software
  // won't touch them. Those need a decision only they can make.
  if (plan.rows.length === 0 && plan.skipped.length === 0 && !result) return null;

  if (result) {
    return (
      <div className="rounded-3xl bg-jade-600 px-5 py-4 text-cream-50">
        <p className="font-display text-lg font-black">
          Done — {result.done} duplicate{result.done === 1 ? "" : "s"} collapsed.
        </p>
        <p className="mt-1 text-sm opacity-90">
          Each dish now carries its own take-out packaging, and the twins are
          hidden — not deleted, so their sales history is intact. Next: check{" "}
          <strong>Dish costs</strong> and move anything charged once per ORDER
          (the bag) into the order packaging list, or a four-dish take-out gets
          charged four bags.
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

  // Every twin needs a human decision — say so rather than vanishing.
  if (plan.rows.length === 0) {
    return (
      <div className="rounded-3xl bg-cream-100 p-4 ring-1 ring-ink-950/10">
        <p className="font-bold text-ink-950">
          {plan.skipped.length} take-out dish
          {plan.skipped.length === 1 ? "" : "es"} need a decision
        </p>
        <p className="mt-0.5 max-w-2xl text-sm text-ink-800/70">
          These couldn&apos;t be collapsed automatically, and guessing would
          attach one dish&apos;s packaging to another. Fix the reason and this
          panel will offer to collapse them.
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-ink-800/60">
          {plan.skipped.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-gold-400/20 p-4 ring-1 ring-gold-400/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink-950">
            {plan.rows.length} take-out duplicate
            {plan.rows.length === 1 ? "" : "s"} can be collapsed
          </p>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-800/70">
            Dishes named &ldquo;(T.O) …&rdquo; are the same food as their
            dine-in twin, packed differently. Collapsing moves that difference
            onto the dish as its take-out packaging, so there is one dish
            served two ways instead of two dishes to keep in step. Your menu
            goes from <strong>{plan.before}</strong> to{" "}
            <strong>{plan.after}</strong> items.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-xl bg-ink-950/5 px-4 py-2 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
        >
          {open ? "Hide the list" : "See what would change"}
        </button>
      </div>

      {open && (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
          <ul className="flex flex-col gap-3">
            {plan.rows.map((r) => (
              <li key={r.twinId} className="text-sm">
                <p className="font-bold text-ink-950">{r.baseName}</p>
                <ul className="mt-0.5 pl-4 text-ink-800/70">
                  {r.packaging.map((l) => (
                    <li key={`${l.refType}:${l.refId}`} className="tabular-nums">
                      + {l.label} × {l.qty}
                    </li>
                  ))}
                </ul>
                <p className="pl-4 text-xs text-ink-800/45">
                  from &ldquo;{r.twinName}&rdquo;, which gets hidden
                </p>
              </li>
            ))}
          </ul>

          {/* Said out loud rather than left as a surprise. A dish that can't
              be matched is not a failure of the merge — it is a dish that
              needs a decision, and the owner is the one who can make it. */}
          {plan.skipped.length > 0 && (
            <div className="mt-4 border-t border-ink-950/10 pt-3">
              <p className="text-xs font-black uppercase tracking-widest text-ink-800/40">
                Left alone ({plan.skipped.length})
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-800/60">
                {plan.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm font-bold text-ink-950">
              Collapse {plan.rows.length} dishes? Nothing is deleted.
            </span>
            <button
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await runTakeoutMerge();
                  if (r.error) {
                    setError(r.error);
                    setConfirming(false);
                    return;
                  }
                  setResult({ done: r.done, failed: r.failed });
                  router.refresh();
                });
              }}
              disabled={pending}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Collapsing…" : "Yes, do it"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="rounded-xl bg-ink-950/5 px-4 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
            >
              Not now
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
          >
            Collapse them
          </button>
        )}
      </div>
    </div>
  );
}
