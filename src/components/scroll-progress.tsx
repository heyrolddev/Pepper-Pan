/**
 * The reading bar across the top of the page.
 *
 * NO JAVASCRIPT — and that is the entire point of this file.
 *
 * It used to be a `useScroll` motion value fed through a `useSpring`, which
 * meant a spring simulation ran on the main thread for every frame of every
 * scroll, on every page, on every device. That is the most expensive possible
 * way to draw a one-pixel line, and on a phone it is paid in exactly the place
 * it is most felt: a spring that is still settling while your thumb is still
 * moving is scroll jank, and scroll jank is what "the site feels slow" means
 * to most people.
 *
 * A scroll-driven CSS animation does the same job on the compositor, off the
 * main thread, for nothing. It also deletes `motion` from the root layout's
 * bundle, so every page stops paying for the animation library just by having
 * a header.
 *
 * Browsers without `animation-timeline` (older Safari, older Firefox) simply
 * never animate it, and it stays at `scaleX(0)` — invisible. A decorative bar
 * that quietly does not appear is the right way for this to degrade; the
 * alternative was shipping a scroll handler to everyone so that a minority
 * could see a hairline.
 */
export function ScrollProgress() {
  return (
    <div
      aria-hidden
      className="scroll-progress fixed left-0 top-0 z-50 h-1 w-full origin-left bg-gradient-to-r from-brand-600 via-chili-500 to-gold-400"
    />
  );
}
