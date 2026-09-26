import type { ReactNode } from "react";

/**
 * The pieces that give an HQ page a shape.
 *
 * Every screen in HQ was a vertical stack of the same card: `rounded-3xl
 * bg-cream-100 p-6 ring-1 ring-ink-950/10`, nine times. Nothing was wrong
 * with any one of them and the page was unreadable anyway, because a reader
 * gets hierarchy from DIFFERENCE and there was none — the break-even figure,
 * the thing the whole Money page exists to produce, was in a box identical to
 * the list of things the shop owns.
 *
 * Three devices, and the restraint matters as much as the devices:
 *
 *   ONE DARK BAND PER PAGE, carrying the single figure that page exists for.
 *   Its job is to be the only thing on the screen that is not cream, so the
 *   eye lands on it before it starts reading. A second one would cancel the
 *   first.
 *
 *   SECTION HEADS that group the cards into chapters, so eight panels read as
 *   three ideas. The eyebrow takes the section's own accent — the same colour
 *   the sidebar is already using for this part of HQ, repeated where the eye
 *   actually is.
 *
 *   METERS AND SPARKS, because "₱4,100 against ₱3,800" is arithmetic the
 *   reader has to do and a bar is a fact they can see. Neither replaces the
 *   figure; both sit beside it.
 */

/* ------------------------------------------------------------------ */

/**
 * A chapter heading.
 *
 * The eyebrow is not decoration: it says what KIND of thing the cards below
 * are, which is the question a stack of identical panels cannot answer. It
 * takes `--hq-accent`, set per section by the shell, so it agrees with the
 * sidebar instead of inventing a colour per page.
 */
export function SectionHead({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--hq-accent,currentColor)]">
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-[var(--hq-accent,currentColor)]"
          />
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-black text-ink-950">{title}</h2>
        {hint && <p className="mt-1 max-w-2xl text-sm text-ink-800/60">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The one dark thing on the page.
 *
 * Ink rather than brand red, and that is the whole reason it works: red is
 * the shop's shouting colour and it is already spent on cancellations,
 * shortfalls and the sign itself. A charcoal band with a gold rule reads as
 * "this is the important one" without competing with anything that means
 * "something is wrong".
 *
 * The dot grid is 4% gold on charcoal — below the threshold where it reads as
 * a texture at arm's length, above the one where the panel reads as flat
 * paint. It is `aria-hidden` and pointer-transparent; it exists for the two
 * seconds before somebody starts reading.
 */
export function HeroBand({
  eyebrow,
  children,
  tone = "ink",
}: {
  eyebrow?: string;
  children: ReactNode;
  /** `ink` is the default. `jade` is for a band that is reporting good news. */
  tone?: "ink" | "jade";
}) {
  const ground = tone === "jade" ? "bg-jade-800" : "bg-ink-950";
  /* A div, not a `<section>`.

     The Money page's band is wrapped by `Explain`, whose trigger is a real
     `<button>` — and a button may only contain phrasing content, so a
     sectioning element inside one is invalid markup that browsers "fix" by
     closing the button early. The band is a presentation container; the
     section it belongs to is declared around it. */
  return (
    <div
      className={`relative isolate overflow-hidden rounded-3xl ${ground} px-6 py-7 text-cream-50 shadow-[0_18px_40px_-24px] shadow-ink-950/60 sm:px-8`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(var(--color-gold-400) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
      {/* A warm bloom behind the figure, so the band has a light source and
          does not read as a rectangle of paint. Off the top-right corner,
          where there is never any text. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full bg-gold-400/15 blur-3xl"
      />
      {eyebrow && (
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gold-400">
          {eyebrow}
        </p>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type MeterTone = "good" | "watch" | "bad" | "quiet";

const METER_FILL: Record<MeterTone, string> = {
  good: "bg-jade-500",
  watch: "bg-gold-400",
  bad: "bg-brand-500",
  quiet: "bg-cream-50/40",
};

/**
 * How far along something is, as a length rather than as a division.
 *
 * "₱848 against ₱703" asks the reader to do arithmetic before they know
 * whether it is good news. A bar past its mark answers that before it is
 * read. The figures stay — the bar is never the only copy of a number.
 *
 * ── The target is a MARK on the track, not the end of it ─────────────────
 *
 * The obvious build clamps the fill at 100% of the target, and it throws away
 * the more interesting half of the answer. A shop ₱5 over break-even and a
 * shop ₱5,000 over both render as one full bar, so the bar stops saying
 * anything on exactly the days it would be worth reading. Scaling the track
 * to whichever of the two is larger and notching the target keeps both facts:
 * how far along, and how far past.
 *
 * Below the target the notch sits at the right-hand end, which is the plain
 * progress bar everyone already knows.
 */
export function Meter({
  value,
  target,
  tone = "good",
  label,
  right,
  onDark = false,
}: {
  value: number;
  target: number;
  tone?: MeterTone;
  label?: ReactNode;
  right?: ReactNode;
  /** Whether it is sitting on the hero band, which needs paler furniture. */
  onDark?: boolean;
}) {
  const scale = Math.max(value, target, 1);
  const fill = Math.max(0, Math.min(1, value / scale));
  const mark = target > 0 ? Math.max(0, Math.min(1, target / scale)) : 0;
  const over = value > target && target > 0;

  return (
    <div>
      {(label || right) && (
        <div
          className={`mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs font-bold ${
            onDark ? "text-cream-50/65" : "text-ink-800/60"
          }`}
        >
          {label}
          {right}
        </div>
      )}
      <div
        className={`relative h-2.5 w-full rounded-full ${
          onDark ? "bg-cream-50/15" : "bg-ink-950/10"
        }`}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ${METER_FILL[tone]}`}
          // Floored at a hair above zero when there is anything at all, so a
          // real but tiny figure is a mark rather than an empty track.
          style={{ width: fill > 0 ? `${Math.max(2, fill * 100)}%` : 0 }}
        />
        {mark > 0 && (
          <span
            aria-hidden
            // Pulled back by its own width at the right-hand end so the notch
            // is never half outside the track it belongs to.
            className={`absolute -top-1 h-[18px] w-[3px] rounded-full ${
              onDark ? "bg-cream-50" : "bg-ink-950"
            } ${over ? "" : "opacity-40"}`}
            style={{ left: `calc(${mark * 100}% - 3px)` }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A fortnight of takings, the size of a line of text.
 *
 * Not a chart — the page already has one of those. This is the shape of the
 * trend at a glance beside the figure it belongs to, which is the thing a
 * single number can never say: ₱4,000 today is a good day or a collapse
 * depending entirely on the fortnight behind it.
 *
 * Drawn as bars rather than a line on purpose. Trading days are discrete and
 * a closed day is a real zero; a line interpolates straight through it and
 * draws a slope the shop never had.
 */
export function Spark({
  values,
  tone = "gold",
  className = "",
}: {
  values: number[];
  tone?: "gold" | "jade";
  className?: string;
}) {
  if (values.length === 0) return null;
  const peak = Math.max(...values, 0);
  if (peak <= 0) return null;
  const today = tone === "jade" ? "bg-jade-400" : "bg-gold-400";

  return (
    <div
      aria-hidden
      className={`flex h-10 items-end gap-[2px] ${className}`}
    >
      {values.map((v, i) => (
        <span
          key={i}
          /* Two colours, not one colour at two opacities.

             Gold at 40% over charcoal is olive — a muddy third colour that
             reads as neither the accent nor the ground, and the whole row
             came out looking like a rendering fault. The history is pale
             cream, which is what everything quiet on this band already is,
             and the accent is spent on the one bar that is today. */
          className={`min-w-[3px] flex-1 rounded-t-[2px] ${
            i === values.length - 1 ? today : "bg-cream-50/30"
          }`}
          style={{ height: v > 0 ? `${Math.max(8, (v / peak) * 100)}%` : "2px" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A fact stated beside the headline, on the dark band.
 *
 * Deliberately not a `StatTile`: those are cards, and putting cards inside
 * the one panel whose job is to not be a card would undo it.
 */
export function HeroFact({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  /** Colours the figure when it carries a verdict rather than a measurement. */
  tone?: "good" | "warn" | "bad";
}) {
  const colour =
    tone === "good"
      ? "text-jade-300"
      : tone === "warn"
        ? "text-gold-400"
        : tone === "bad"
          ? "text-brand-300"
          : "text-cream-50";
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-cream-50/50">
        {label}
      </p>
      <p className={`mt-0.5 font-display text-xl font-black tabular-nums ${colour}`}>
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] leading-snug text-cream-50/45">{note}</p>}
    </div>
  );
}
