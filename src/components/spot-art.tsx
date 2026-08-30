/**
 * Hand-drawn spot illustrations, as inline SVG.
 *
 * The brief was "more graphics, but don't slow the site down" — which rules
 * out photographs and rules *in* line art. Each of these is a few hundred
 * bytes of markup: no network request, no layout shift while it loads, sharp
 * on any screen, and it takes its colour from whatever it sits on, so one
 * drawing works on cream and on ink without a second file.
 *
 * They're deliberately loose — slightly off-round bowls, uneven steam — so
 * the site reads as a family stall that draws its own signage rather than a
 * chain that bought a stock icon pack. Everything is `stroke="currentColor"`
 * with round caps, which is what keeps them looking like one hand drew them.
 */

type ArtProps = {
  className?: string;
  /** Decorative by default; pass a label when the drawing carries meaning. */
  title?: string;
};

function frame(title?: string) {
  return title
    ? ({ role: "img" as const, "aria-label": title })
    : ({ "aria-hidden": true } as const);
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A bowl of noodles with steam — the shop's whole business in one mark. */
export function NoodleBowl({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        {/* steam, uneven on purpose */}
        <path d="M24 16c2-3-1-5 1-8" opacity=".7" />
        <path d="M32 14c2-4-1-6 1-9" opacity=".85" />
        <path d="M40 16c2-3-1-5 1-8" opacity=".7" />
        {/* bowl */}
        <path d="M10 30h44c0 12-8 21-22 21S10 42 10 30Z" />
        <path d="M6 32h52" />
        {/* noodles curling over the rim */}
        <path d="M20 30c3-5 8-6 12-3s9 2 12-3" />
        <path d="M23 34c4-3 9-2 12 1" opacity=".6" />
        {/* chopsticks */}
        <path d="M42 8 30 27M48 11 34 28" />
      </g>
    </svg>
  );
}

/** A chilli — used wherever something is hot, new, or worth noticing. */
export function Chili({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        <path d="M38 14c8 2 14 10 14 20 0 12-9 20-20 20-8 0-14-5-14-11 0-8 8-9 13-14s3-13 7-15Z" />
        <path d="M36 15c-1-4 1-7 5-8" />
        <path d="M41 7c3-1 6 0 7 3" />
      </g>
    </svg>
  );
}

/** An empty pan — for "nothing here yet" without saying it twice. */
export function EmptyPan({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        <ellipse cx="27" cy="34" rx="19" ry="13" />
        <path d="M27 47c-10 0-19-6-19-13" opacity=".5" />
        <path d="M45 30h11a3 3 0 0 1 0 6h-9" />
        {/* one lonely speck, so it reads as empty rather than broken */}
        <circle cx="27" cy="34" r="1.5" opacity=".5" />
      </g>
    </svg>
  );
}

/** A paper bag — pickup, delivery, an order on its way. */
export function OrderBag({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        <path d="M14 22h36l-3 30a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4Z" />
        <path d="M24 22v-4a8 8 0 0 1 16 0v4" />
        <path d="M22 32h20" opacity=".45" />
      </g>
    </svg>
  );
}

/** A speech bubble with a curl of steam — the chat, in the shop's voice. */
export function ChatSteam({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        <path d="M12 18h40a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H30l-11 9v-9h-7a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4Z" />
        <path d="M24 30c2-3-1-4 1-6" opacity=".7" />
        <path d="M32 29c2-4-1-5 1-8" opacity=".85" />
        <path d="M40 30c2-3-1-4 1-6" opacity=".7" />
      </g>
    </svg>
  );
}

/** A star for reviews, drawn rather than typed. */
export function DrawnStar({ className, title }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} {...frame(title)}>
      <g {...stroke}>
        <path d="M32 10 39 25l16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z" />
      </g>
    </svg>
  );
}

/**
 * A section marker: the drawing, a rule, and the label.
 *
 * Gives a heading some character without another gigantic hero — the ask was
 * playful, not louder.
 */
export function SectionMark({
  art,
  children,
  className = "",
}: {
  art: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest ${className}`}
    >
      <span className="h-5 w-5 shrink-0">{art}</span>
      {children}
      <span aria-hidden className="h-px flex-1 bg-current opacity-20" />
    </p>
  );
}

/**
 * An empty state that looks considered rather than broken.
 *
 * A bare sentence on a page reads like something failed. A drawing plus one
 * clear next step reads like the shop simply hasn't got there yet — which is
 * usually the truth.
 */
export function EmptyState({
  art,
  title,
  children,
  action,
}: {
  art: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-cream-100 px-6 py-12 text-center ring-1 ring-ink-950/10">
      <span className="h-20 w-20 text-brand-600/45">{art}</span>
      <p className="font-display text-xl font-black text-ink-950">{title}</p>
      {children && (
        <p className="max-w-sm text-sm text-ink-800/60">{children}</p>
      )}
      {action}
    </div>
  );
}
