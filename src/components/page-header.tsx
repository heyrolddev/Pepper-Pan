import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

/**
 * Shared masthead for every non-landing page, so the inner pages carry
 * the same dark, appetite-forward energy as the homepage hero.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
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

      <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <Reveal>
          {eyebrow && (
            <span className="inline-block rounded-full bg-gold-400 px-4 py-1 text-xs font-bold uppercase tracking-widest text-ink-950">
              {eyebrow}
            </span>
          )}
          <h1 className="mt-4 font-display text-4xl font-black tracking-tight text-cream-50 sm:text-6xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-4 max-w-xl text-lg text-cream-100/70">{subtitle}</p>
          )}
          {children}
        </Reveal>
      </div>
    </section>
  );
}
