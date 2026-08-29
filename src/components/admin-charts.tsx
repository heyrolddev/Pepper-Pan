/**
 * Dashboard chart primitives.
 *
 * Every chart here plots ONE measure, so each is a single-hue magnitude chart:
 * no categorical palette, no legend (the heading names the series), and colour
 * is never the only thing carrying meaning — each mark has a hover readout and
 * the peak is direct-labelled. Money uses the brand hue, counts use jade, and
 * that mapping is consistent across the page.
 */

const peso = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export type Bar = { label: string; value: number; caption?: string };

const HUES = {
  money: { fill: "bg-brand-600", soft: "bg-brand-600/15" },
  count: { fill: "bg-jade-600", soft: "bg-jade-600/15" },
} as const;

/**
 * Vertical bars for a short time series. Bars are thin with 4px rounded tops
 * anchored to a shared baseline, and separated by a surface gap so adjacent
 * bars never read as one block.
 */
export function ColumnChart({
  data,
  hue = "money",
  format = "peso",
  emptyLabel = "Nothing to show yet.",
}: {
  data: Bar[];
  hue?: keyof typeof HUES;
  format?: "peso" | "plain";
  emptyLabel?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const fmt = (n: number) => (format === "peso" ? peso(n) : String(n));
  const peakIndex = max > 0 ? data.findIndex((d) => d.value === max) : -1;

  if (max === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-6 text-sm text-ink-800/70">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div
      // items-stretch (not items-end) so each column is a full-height box —
      // the bar's percentage height needs a parent with a real height to
      // resolve against, otherwise every bar collapses to nothing.
      className="flex h-44 items-stretch gap-[2px]"
      role="img"
      aria-label={data.map((d) => `${d.label}: ${fmt(d.value)}`).join(", ")}
    >
      {data.map((d, i) => (
        <div
          key={d.label}
          className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5"
        >
          {/* Hover readout — the interaction layer every mark gets. */}
          <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-ink-950 px-2 py-1 text-[11px] font-bold text-cream-50 shadow-lg group-hover:block">
            {d.caption ?? d.label}: {fmt(d.value)}
          </span>

          {/* Direct-label the peak only, never every bar. */}
          {i === peakIndex && (
            <span className="text-[10px] font-bold text-ink-950">{fmt(d.value)}</span>
          )}

          <span className="flex w-full min-h-0 flex-1 items-end">
            <span
              className={`block w-full rounded-t transition-opacity ${HUES[hue].fill} group-hover:opacity-80`}
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0.5)}%` }}
            />
          </span>
          <span className="truncate text-[10px] font-semibold text-ink-800/50">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars for ranked categories — the label needs the room. */
export function RankedBars({
  data,
  hue = "count",
  format = "plain",
  suffix,
}: {
  data: Bar[];
  hue?: keyof typeof HUES;
  format?: "peso" | "plain";
  suffix?: (row: Bar) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const fmt = (n: number) => (format === "peso" ? peso(n) : String(n));

  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.label} className="group flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm font-semibold text-ink-950 sm:w-48">
            {d.label}
          </span>
          <span className="flex h-5 flex-1 items-center">
            <span
              className={`h-full rounded-r transition-opacity ${HUES[hue].fill} group-hover:opacity-80`}
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
            <span className="ml-3 whitespace-nowrap text-sm font-bold text-ink-950">
              {fmt(d.value)}
            </span>
            {suffix && (
              <span className="ml-2 whitespace-nowrap text-xs text-ink-800/55">
                {suffix(d)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
