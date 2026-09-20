"use client";

import type { ReactNode } from "react";

/**
 * The shape of a panel that BUILDS something.
 *
 * Most of HQ edits things the owner can already see — a price, a photograph,
 * whether a dish is sold out today. Those are lists and forms, and they are
 * right to look like lists and forms.
 *
 * Two panels on the Menu screen are different in kind: menu cards and add-ons
 * both assemble a thing that does not exist yet out of parts that do not look
 * related until it is finished. They are the two the owner has to be taught,
 * and they were drawn like everything else.
 *
 * So they share a treatment, and it lives here rather than in either of them.
 * Two panels that are meant to look the same and are described in two files
 * look the same for about a month.
 *
 *   A dark band  — the panel says what it is for before anything is read,
 *                  and a gradient hairline ties it to the section's accent.
 *   Numbered steps — for a form whose order is real: you cannot attach a
 *                  group before it has answers, or a card before it has
 *                  dishes.
 *   A rail       — colour down the left of a row, carrying the one fact
 *                  worth reading first.
 */

export function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-ink-950/10">
      {children}
    </section>
  );
}

export function PanelBand({
  title,
  /** The word picked out in gold — usually the "&" or the second noun. */
  accent,
  after,
  lead,
  stats,
  action,
}: {
  title: string;
  accent?: string;
  after?: string;
  lead: ReactNode;
  /** A single line of context. Deliberately not a row of big number tiles:
   *  these figures orient, they are not the point of the screen. */
  stats?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="relative bg-ink-950 px-5 py-5 text-cream-50 sm:px-6">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold-400 via-brand-600 to-jade-600"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-black text-cream-50 sm:text-2xl">
            {title}
            {accent && <span className="text-gold-400"> {accent}</span>}
            {after && <> {after}</>}
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-100/70">
            {lead}
          </p>
          {stats && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-cream-100/55">
              {stats}
            </p>
          )}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </div>
  );
}

/** A figure in the band's one-line summary. */
export function Stat({ n, children }: { n: number | string; children: ReactNode }) {
  return (
    <>
      <span className="tabular-nums text-gold-400">{n}</span>
      <span>{children}</span>
    </>
  );
}

export const StatDot = () => (
  <span aria-hidden className="text-cream-100/25">
    •
  </span>
);

export function PanelBody({ children }: { children: ReactNode }) {
  return <div className="p-5 sm:p-6">{children}</div>;
}

/** The gold button in a band. */
export function BandButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-gold-400 px-5 py-2.5 text-sm font-black text-ink-950 shadow-lg shadow-gold-400/20 transition-transform hover:scale-105"
    >
      {children}
    </button>
  );
}

/**
 * One numbered section of a form.
 *
 * Numbered only where the order is real. A number that encodes nothing is
 * decoration, and both forms that use this have an order you cannot reverse.
 */
export function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/[0.07]">
      <div className="flex items-baseline gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-xs font-black text-gold-400">
          {n}
        </span>
        <div className="min-w-0">
          <h4 className="font-display text-base font-black leading-none text-ink-950">
            {title}
          </h4>
          {hint && <p className="mt-1 text-xs text-ink-800/55">{hint}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A row in a panel's list: a coloured rail, then everything else. */
export function RailRow({
  rail,
  ring,
  dimmed = false,
  children,
}: {
  rail: string;
  ring: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={`flex overflow-hidden rounded-2xl bg-cream-50 ring-1 transition-shadow hover:shadow-md hover:shadow-ink-950/5 ${ring} ${
        dimmed ? "opacity-65" : ""
      }`}
    >
      <span aria-hidden className={`w-1.5 shrink-0 ${rail}`} />
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </li>
  );
}

/** The dark strip under a form that shows what the customer will get. */
export function PreviewBand({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-ink-950">
      <p className="flex items-center gap-2 px-4 pt-3 text-[10px] font-black uppercase tracking-widest text-cream-100/45">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-jade-400" />
        What the customer sees
      </p>
      <div className="m-3 mt-2 rounded-xl bg-cream-50 p-3">{children}</div>
    </section>
  );
}

/** A numbered instruction list for an empty state that has to teach. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-4 flex flex-col gap-3">
      {items.map((text, i) => (
        <li key={i} className="flex gap-3 text-sm text-ink-800/80">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-400 font-display text-sm font-black text-ink-950">
            {i + 1}
          </span>
          <span className="pt-0.5">{text}</span>
        </li>
      ))}
    </ol>
  );
}
