"use client";

import { peso } from "@/lib/peso";
import { hqTitle } from "@/lib/hq-theme";
import { perTradingDay, type BranchSummary } from "@/lib/branch-summary";
import { type Branch } from "@/lib/branches";

/**
 * Every branch, side by side.
 *
 * The one question this page answers: is each branch working, growing,
 * moving or failing. Nothing else belongs here — a branch's own detail is a
 * branch's own screens.
 *
 * ── Why "per night open" is the headline and not "per day" ───────────────
 *
 * Apalit trades daily; El Mercado trades Friday to Sunday. Dividing both
 * weeks by seven would make the booth look like it is limping for no reason
 * other than being deliberately shut on a Tuesday, and an unfair number is
 * how a working branch gets closed. So the figure beside each branch is what
 * it takes on a night it actually opens, and the raw weekly total sits under
 * it for anyone who wants the plain sum.
 */
export function BranchesView({
  branches,
  summaries,
  windowLabel,
}: {
  branches: Branch[];
  summaries: Record<string, BranchSummary>;
  /** "the last 7 days" — said once, so no card has to repeat it. */
  windowLabel: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className={hqTitle}>Branches</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Every place Pepper Pan sells from, over {windowLabel}. Each branch is
          measured on the nights it actually opens, so a booth that trades three
          nights is not judged against a stall that trades seven.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {branches.map((b) => {
          const s = summaries[b.id];
          const nightly = s ? perTradingDay(s) : 0;
          const change = s?.change ?? null;

          return (
            <section
              key={b.id}
              className="flex flex-col gap-4 rounded-3xl bg-cream-50 p-5 ring-1 ring-ink-950/10 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-black text-ink-950">
                    {b.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-800/55">
                    {b.isMain ? "The commissary" : "Branch"}
                    {b.tradingNote ? ` · ${b.tradingNote}` : ""}
                  </p>
                </div>
                {!b.active && (
                  <span className="shrink-0 rounded-full bg-ink-950/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-ink-800/60">
                    Closed
                  </span>
                )}
              </div>

              {/* The headline, and the figure the owner should compare. */}
              <div className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/[0.07]">
                <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/55">
                  On a night it opens
                </p>
                <p className="mt-1 font-display text-3xl font-black tabular-nums text-ink-950">
                  {peso(nightly, 0)}
                </p>
                <p className="mt-1 text-xs text-ink-800/55">
                  {s?.tradingDays ?? 0} night{s?.tradingDays === 1 ? "" : "s"} open
                  {" · "}
                  {peso(s?.takings ?? 0, 0)} in total
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-3">
                <Figure label="Orders" value={String(s?.orders ?? 0)} />
                <Figure label="Average ticket" value={peso(s?.averageTicket ?? 0, 0)} />
                {/* A colour never travels alone: the word says which way it
                    went, so the figure survives a colourblind reader and a
                    black-and-white print alike. */}
                <Figure
                  label="Against the week before"
                  value={
                    change === null
                      ? "No history"
                      : `${change >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(change * 100))}%`
                  }
                  tone={
                    change === null
                      ? "text-ink-800/50"
                      : change >= 0
                        ? "text-jade-700"
                        : "text-brand-700"
                  }
                />
              </dl>
            </section>
          );
        })}
      </div>

      {branches.length < 2 && (
        <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 px-5 py-6 text-sm text-ink-800/65">
          One branch so far. This page starts earning its place the day there
          are two to compare.
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "text-ink-950",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-black uppercase leading-tight tracking-widest text-ink-800/55">
        {label}
      </dt>
      <dd className={`mt-1 font-display text-lg font-black tabular-nums ${tone}`}>
        {value}
      </dd>
    </div>
  );
}
