"use client";

import { useState, useTransition } from "react";
import { ColumnChart, RankedBars, type Bar } from "@/components/admin-charts";
import { pesoRound as peso } from "@/lib/peso";
import { loadMonthlyReport } from "@/app/admin/analytics/monthly-actions";
import type { Report } from "@/lib/monthly-report";

/**
 * The month, closed and read back.
 *
 * ── Why this is an accordion and loads on open ───────────────────────────
 *
 * Twelve months of reports is twelve months of queries, and Analytics is
 * already a heavy page. Nobody reads twelve; they read the last one, and
 * once a year they go looking for a particular one. So the months are a
 * list of closed rows and a report is fetched when somebody asks for it.
 *
 * The newest month opens by itself, because that is the one the person
 * came for.
 *
 * ── The order the sections are in is the argument ────────────────────────
 *
 * Did it make money → where the money went → which days → which dishes →
 * who came back → what to do. Each answers the question the one before it
 * raises. The actions are last on purpose: advice read before the figures
 * that justify it is advice nobody follows.
 */
export function MonthlyReportPanel({ months }: { months: string[] }) {
  const [open, setOpen] = useState<string | null>(months[0] ?? null);
  const [cache, setCache] = useState<Record<string, Report | null>>({});
  const [busy, startBusy] = useTransition();

  function toggle(month: string) {
    if (open === month) return setOpen(null);
    setOpen(month);
    if (cache[month] === undefined) {
      startBusy(async () => {
        const r = await loadMonthlyReport(month);
        setCache((c) => ({ ...c, [month]: r }));
      });
    }
  }

  if (months.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm leading-relaxed text-ink-800/70">
        No month has any sales in it yet. Once the shop has traded, each
        finished month gets its own report here — what it came to, which dishes
        earned, and what to do about next month.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {months.map((month) => (
        <MonthRow
          key={month}
          month={month}
          open={open === month}
          loading={open === month && busy && cache[month] === undefined}
          report={cache[month]}
          onToggle={() => toggle(month)}
        />
      ))}
    </div>
  );
}

function label(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][m - 1];
  return name ? `${name} ${y}` : month;
}

function MonthRow({
  month,
  open,
  loading,
  report,
  onToggle,
}: {
  month: string;
  open: boolean;
  loading: boolean;
  report: Report | null | undefined;
  onToggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-cream-100 ring-1 ring-ink-950/10">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-cream-200/60"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-base font-black text-ink-950">
            {label(month)}
          </span>
          {report && !report.complete && (
            <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-950">
              still running
            </span>
          )}
          {report && (
            <span className="text-sm font-bold tabular-nums text-ink-800/60">
              {peso(report.money.revenue)}
              {report.money.revenueChange !== null && (
                <span
                  className={
                    report.money.revenueChange >= 0
                      ? " text-jade-700"
                      : " text-brand-700"
                  }
                >
                  {" "}
                  {report.money.revenueChange >= 0 ? "▲" : "▼"}
                  {Math.abs(Math.round(report.money.revenueChange * 100))}%
                </span>
              )}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-bold text-ink-800/40">
          {open ? "Hide" : "Open"}
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-950/10 bg-cream-50/70 px-5 py-4">
          {loading || report === undefined ? (
            <p className="py-6 text-center text-sm text-ink-800/50">Reading the month…</p>
          ) : report === null ? (
            <p className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
              That month could not be read. It is worth trying again — nothing
              was changed.
            </p>
          ) : (
            <Body report={report} />
          )}
        </div>
      )}
    </section>
  );
}

function Body({ report: r }: { report: Report }) {
  const days: Bar[] = r.trading.byDay.map((d) => ({
    label: String(Number(d.date.slice(8, 10))),
    value: d.revenue,
    caption: d.date,
  }));

  const sellers: Bar[] = r.dishes.topSellers.map((d) => ({
    label: d.name,
    value: d.qty,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Said before any figure is read, because it changes what they mean. */}
      {!r.complete && (
        <p className="rounded-xl bg-gold-400/25 px-4 py-2.5 text-xs leading-relaxed text-ink-900">
          <strong className="font-black">This month is not over.</strong> Every
          figure is what has happened so far
          {r.comparedOver !== null && (
            <> — and the comparison uses the same {r.comparedOver} days of last month, not the whole of it</>
          )}
          . The monthly bills are charged to the day.
        </p>
      )}

      {/* ── 1. Did it make money ───────────────────────────────────── */}
      <Section title="What it came to">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Sales" value={peso(r.money.revenue)} big />
          <Stat label="Ingredients" value={peso(r.money.cogs)} />
          <Stat
            label="Gross profit"
            value={peso(r.money.grossProfit)}
            note={r.money.margin !== null ? `${Math.round(r.money.margin * 100)}% margin` : undefined}
          />
          <Stat
            label="Left after bills"
            value={peso(r.money.netProfit)}
            big
            tone={r.money.netProfit >= 0 ? "good" : "bad"}
          />
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-ink-800/55">
          {peso(r.money.revenue)} in, less {peso(r.money.cogs)} of ingredients
          {r.money.waste > 0 && <>, less {peso(r.money.waste)} thrown away</>}
          {r.money.fixedCosts > 0 && <>, less {peso(r.money.fixedCosts)} of monthly bills</>}
          {r.money.discounts > 0 && (
            <> · {peso(r.money.discounts)} went out as discount</>
          )}
          .
        </p>
      </Section>

      {/* ── 2. Which days ──────────────────────────────────────────── */}
      <Section
        title="Day by day"
        hint={
          r.trading.daysOpen > 0
            ? `${r.trading.daysOpen} trading day${r.trading.daysOpen === 1 ? "" : "s"}, ${r.trading.orders} orders, ${peso(r.trading.avgOrder)} a ticket.`
            : undefined
        }
      >
        <ColumnChart data={days} emptyLabel="No sales recorded this month." />
        {r.trading.best && (
          <p className="mt-2 text-xs text-ink-800/55">
            Best day {r.trading.best.date} at {peso(r.trading.best.revenue)}
            {r.trading.quietest && (
              <> · quietest {r.trading.quietest.date} at {peso(r.trading.quietest.revenue)}</>
            )}
            {r.trading.cancelRate > 0 && (
              <> · {Math.round(r.trading.cancelRate * 100)}% cancelled</>
            )}
          </p>
        )}
      </Section>

      {/* ── 3. Which dishes ────────────────────────────────────────── */}
      {r.dishes.topSellers.length > 0 && (
        <Section title="What sold" hint="By how many left the kitchen.">
          <RankedBars data={sellers} format="plain" />
          {r.dishes.topEarners.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-800/55">
              <strong className="text-ink-950">Earned most:</strong>{" "}
              {r.dishes.topEarners
                .slice(0, 3)
                .map((d) => `${d.name} (${peso(d.profit)})`)
                .join(" · ")}
            </p>
          )}
          {/* Priced at today's recipe, against what it sold for then. Said
              here rather than in a footnote, because a dish being called a
              loss-maker is a decision somebody acts on. */}
          <p className="mt-1 text-[11px] leading-relaxed text-ink-800/40">
            Per-dish profit uses today&apos;s recipe prices. The month&apos;s own
            totals above come from what each order actually cost at the time.
          </p>
        </Section>
      )}

      {/* ── 4. Who came back ───────────────────────────────────────── */}
      {(r.customers.total > 0 || r.customers.walkIns > 0) && (
        <Section title="Who bought">
          <p className="text-sm leading-relaxed text-ink-800/70">
            {r.customers.total > 0 && (
              <>
                <strong className="text-ink-950">{r.customers.total}</strong>{" "}
                account holder{r.customers.total === 1 ? "" : "s"}
                {r.customers.repeatRate !== null && (
                  <>
                    , {r.customers.returning} of whom ordered more than once (
                    {Math.round(r.customers.repeatRate * 100)}%)
                  </>
                )}
              </>
            )}
            {r.customers.walkIns > 0 && (
              <>
                {r.customers.total > 0 && " · "}
                <strong className="text-ink-950">{r.customers.walkIns}</strong>{" "}
                walk-in{r.customers.walkIns === 1 ? "" : "s"} at the counter
              </>
            )}
            .
          </p>
        </Section>
      )}

      {/* ── 5. Strong and weak ─────────────────────────────────────── */}
      {(r.strengths.length > 0 || r.weaknesses.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Findings title="What went well" items={r.strengths} tone="good" />
          <Findings title="What did not" items={r.weaknesses} tone="bad" />
        </div>
      )}

      {/* ── 6. What to do ──────────────────────────────────────────── */}
      {r.actions.length > 0 && (
        <Section
          title="What to do about next month"
          hint="Most valuable first. Each one is tied to a figure above."
        >
          <ol className="flex flex-col gap-2">
            {r.actions.map((a, i) => (
              <li
                key={a.title}
                className="flex gap-3 rounded-xl bg-cream-100 px-4 py-3"
              >
                <span className="font-display text-sm font-black text-brand-600">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-ink-950">
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-800/65">
                    {a.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="font-display text-sm font-black text-ink-950">{title}</h4>
      {hint && <p className="mb-2 mt-0.5 text-xs text-ink-800/50">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  big,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  big?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl bg-cream-100 px-3 py-2.5">
      <dt className="text-[10px] font-black uppercase tracking-widest text-ink-800/45">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-display font-black tabular-nums ${
          big ? "text-xl" : "text-base"
        } ${tone === "good" ? "text-jade-700" : tone === "bad" ? "text-brand-600" : "text-ink-950"}`}
      >
        {value}
      </dd>
      {note && <p className="text-[11px] text-ink-800/45">{note}</p>}
    </div>
  );
}

function Findings({
  title,
  items,
  tone,
}: {
  title: string;
  items: { title: string; detail: string }[];
  tone: "good" | "bad";
}) {
  // Rendered even when empty, and saying so. An absent column reads as
  // "nothing went wrong", which is a claim rather than a silence.
  return (
    <section
      className={`rounded-2xl px-4 py-3 ring-1 ${
        tone === "good"
          ? "bg-jade-600/8 ring-jade-600/20"
          : "bg-brand-600/8 ring-brand-600/20"
      }`}
    >
      <h4
        className={`text-[11px] font-black uppercase tracking-widest ${
          tone === "good" ? "text-jade-800" : "text-brand-700"
        }`}
      >
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-800/45">
          Nothing measured here this month.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-2">
          {items.map((f) => (
            <li key={f.title}>
              <span className="block text-sm font-bold text-ink-950">{f.title}</span>
              <span className="text-xs leading-relaxed text-ink-800/65">
                {f.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
