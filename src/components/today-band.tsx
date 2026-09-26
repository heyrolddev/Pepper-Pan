import Link from "next/link";
import { Explain } from "@/components/explain";
import { HeroBand, HeroFact, Spark } from "@/components/hq-kit";
import { pesoRound as peso } from "@/lib/peso";

/**
 * The day, before anything else on the page.
 *
 * Today's takings used to be one tile in a grid of ten — same size, same
 * cream, same weight as the count of registered customers — and the first
 * thing on a page called Today was a date picker for a different window. The
 * one figure the owner opens HQ for had to be found.
 *
 * So the day gets the band: the takings in gold, the fortnight behind them,
 * the four things that are currently true about the shift, and the two things
 * that are actually a verb. Everything that follows is a statistic; this is
 * the shift.
 *
 * Extracted from the page rather than written inline so it can be rendered on
 * its own with made-up figures and looked at, which is the only way a band
 * like this gets checked at 390px before an owner meets it on a phone.
 */
export function TodayBand({
  dateLabel,
  takings,
  yesterday,
  orderCount,
  cancelledToday,
  spark,
  toCook,
  ready,
  toCheck,
  waitingLeads,
}: {
  /** The shop's own day, named — "Saturday, 26 September". */
  dateLabel: string;
  takings: number;
  yesterday: number;
  orderCount: number;
  cancelledToday: number;
  /** One value per day, oldest first. */
  spark: number[];
  toCook: number;
  ready: number;
  toCheck: number;
  waitingLeads: number;
}) {
  return (
    <HeroBand eyebrow={dateLabel}>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        {/* The figure carries its own working.

            It used to be a tile in the grid below, wrapped in `Explain`, and
            moving it up here would have left the arithmetic behind. Only
            the figure is wrapped — the band also holds links, and a link
            inside a button is markup the browser silently unpicks. */}
        {/* Sized, because `Explain`'s trigger is `w-full`.

            Left to itself it took the whole row and pushed the fortnight onto
            a line of its own, where the spark stopped being "behind the
            figure" and became a second, smaller chart. */}
        <div className="min-w-0 flex-1 sm:max-w-sm">
        <Explain
          onDark
          title="Sales today"
          what="Everything that came through the shop today, however it was paid for — website, Messenger and the counter alike."
          lines={[
            {
              label: `${orderCount} order${orderCount === 1 ? "" : "s"} today`,
              value: peso(takings),
              note: "Every order dated today that wasn't cancelled.",
            },
            {
              label: "Cancelled today, not counted",
              value: String(
                cancelledToday
              ),
              note: "A cancelled order earned nothing, so it is left out rather than counted at zero.",
            },
            { label: "Yesterday, for comparison", value: peso(yesterday) },
            { label: "= Today's takings", value: peso(takings), total: true },
          ]}
          why="This is money in, not money kept — the ingredients have not come out of it yet. It also counts delivery fees separately, so a busy delivery day doesn't read as a good sales day."
        >
        <div className="min-w-0 pr-8">
          <p className="font-display text-[clamp(2.25rem,9vw,3.25rem)] font-black leading-none tabular-nums text-gold-400">
            {peso(takings)}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cream-50/65">
            <span>
              {orderCount} order{orderCount === 1 ? "" : "s"} today
            </span>
            {yesterday > 0 && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                  takings >= yesterday
                    ? "bg-jade-500 text-ink-950"
                    : "bg-brand-500 text-cream-50"
                }`}
              >
                {takings >= yesterday ? "▲" : "▼"}{" "}
                {Math.abs(
                  Math.round(
                    ((takings - yesterday) / yesterday) * 100
                  )
                )}
                % on yesterday
              </span>
            )}
          </p>
        </div>
        </Explain>
        </div>

        {/* The fortnight behind the figure. One number is a good day or a
            collapse depending entirely on the shape of the two weeks
            before it, and that shape was only available further down the
            page in a chart nobody scrolls to first. */}
        {/* Under the figure on a phone, beside it from 640px.

            Both halves were `flex-1` with a 180px floor, so at 390px the
            spark took 180 of the 342 available and the takings wrapped to
            "14 orders / today" over two lines with the trend chip on a
            third. The fortnight is the supporting fact; it gives way. */}
        <div className="w-full sm:min-w-[180px] sm:max-w-xs sm:flex-1">
          <Spark values={spark} />
          <p className="mt-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-cream-50/40">
            last 14 days
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-cream-50/10 pt-5 sm:grid-cols-4">
        <HeroFact
          label="To cook now"
          value={String(toCook)}
          note="pending, confirmed, cooking"
          tone={toCook > 0 ? "warn" : undefined}
        />
        <HeroFact
          label="Ready to hand over"
          value={String(ready)}
          note="waiting for the customer"
          tone={ready > 0 ? "good" : undefined}
        />
        <HeroFact
          label="Payments to check"
          value={String(toCheck)}
          note="GCash refs unconfirmed"
          tone={toCheck > 0 ? "bad" : undefined}
        />
        <HeroFact
          label="Waiting on a reply"
          value={String(waitingLeads)}
          note="customers in the inbox"
          tone={waitingLeads > 0 ? "warn" : undefined}
        />
      </div>

      {/* The work, on the band rather than at the bottom of the tiles.

          Both of these were links below ten cards — the two things on this
          page that are actually a verb, parked where you arrive only after
          reading everything that is a noun. */}
      {(toCook > 0 || waitingLeads > 0) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {toCook > 0 && (
            <Link
              href="/admin/orders"
              className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-black text-ink-950 transition-transform hover:scale-105"
            >
              Process {toCook} open order
              {toCook === 1 ? "" : "s"} →
            </Link>
          )}
          {waitingLeads > 0 && (
            <Link
              href="/admin/inbox"
              className="rounded-full bg-cream-50/15 px-5 py-2.5 text-sm font-black text-cream-50 ring-1 ring-cream-50/25 transition-colors hover:bg-cream-50 hover:text-ink-950"
            >
              Reply to {waitingLeads} customer{waitingLeads === 1 ? "" : "s"} →
            </Link>
          )}
        </div>
      )}
    </HeroBand>
  );
}
