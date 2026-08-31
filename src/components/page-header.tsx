import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

/**
 * Shared masthead for every non-landing page, so the inner pages carry
 * the same dark, appetite-forward energy as the homepage hero.
 *
 * `compact` is for pages whose real content is the thing people came for —
 * the menu, above all. A full-height masthead there is a poster in front of
 * the food: the customer has already chosen to look at the menu, so the
 * masthead's job shrinks from selling to signposting.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  compact = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Half the height, for pages where the content below is the point. */
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="under-nav grain relative overflow-hidden bg-ink-950">
      <div
        aria-hidden
        className="hero-grid pointer-events-none absolute inset-0 opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-brand-600/40 blur-3xl drift"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-0 h-56 w-56 rounded-full bg-gold-400/20 blur-3xl drift"
      />

      <div
        className={`relative mx-auto max-w-5xl px-6 ${
          compact ? "py-8 sm:py-10" : "py-16 sm:py-20"
        }`}
      >
        <Reveal>
          {eyebrow && (
            <span className="inline-block rounded-full bg-gold-400 px-4 py-1 text-xs font-bold uppercase tracking-widest text-ink-950">
              {eyebrow}
            </span>
          )}
          <h1
            className={`font-display font-black tracking-tight text-cream-50 ${
              compact
                ? "mt-3 text-3xl sm:text-4xl"
                : "mt-4 text-4xl sm:text-6xl"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`max-w-xl text-cream-100/70 ${
                compact ? "mt-2 text-sm sm:text-base" : "mt-4 text-lg"
              }`}
            >
              {subtitle}
            </p>
          )}
          {children}
        </Reveal>
      </div>
    </section>
  );
}
