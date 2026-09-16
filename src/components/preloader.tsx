import { Logo } from "@/components/logo";
import { PanLoader } from "@/components/pan-loader";

/**
 * Intro overlay, shown once a visit.
 *
 * The markup is rendered server-side so it covers the page from the very
 * first paint (otherwise you'd see the real page, then the loader drop on
 * top of it once React hydrated). A blocking script in <head> decides
 * whether this load gets the intro and, when it shouldn't, hides the
 * overlay via CSS before it ever paints — see `introScript` in layout.tsx.
 *
 * NO STATE, NO EFFECT, NO REACT AT ALL — and that is the fix, not a style.
 *
 * This used to be a client component that dismissed itself from a `useEffect`
 * after 1100ms. The flaw is in the word "after": an effect does not run until
 * React has hydrated, so the timer did not start when the overlay appeared,
 * it started when the JavaScript finished loading and booting. On a fast
 * laptop those are the same instant. On a mid-range Android on mobile data
 * they are not, and the intro lasted hydration *plus* a second — the slower
 * the phone, the longer the shop made you look at a logo, which is precisely
 * backwards. The scroll lock was held for all of it.
 *
 * Driven by CSS, the second is a second on every device, because the animation
 * starts at first paint and owes nothing to the bundle. It also takes
 * `AnimatePresence` and its slice of the animation library out of the root
 * layout, so every page of the site stops carrying an animation library for
 * the sake of a splash screen that is over before most people see it.
 */
export function Preloader() {
  return (
    <div
      aria-hidden
      className="intro-overlay grain fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950"
    >
      <div
        aria-hidden
        className="hero-grid pointer-events-none absolute inset-0 opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute h-80 w-80 rounded-full bg-brand-600/30 blur-3xl"
      />

      <div className="relative">
        <Logo width={320} priority className="h-auto w-[220px] sm:w-[300px]" />
      </div>

      {/* The shop's one job, drawn: fire leaping out of the pan with the
          peppercorns tossing in it. The five hopping dots it replaced were
          a loading spinner in the shop's colours — they could have
          belonged to anyone. */}
      <PanLoader className="mt-6 h-auto w-[200px] sm:w-[240px]" />

      <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-cream-100/50">
        Firing up the pan…
      </p>

      <div className="mt-8 h-0.5 w-40 overflow-hidden rounded-full bg-cream-100/15">
        <div className="intro-bar h-full w-0 bg-gradient-to-r from-brand-600 via-chili-500 to-gold-400" />
      </div>
    </div>
  );
}
