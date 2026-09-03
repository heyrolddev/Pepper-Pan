"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * One card at a time, swiped by hand.
 *
 * Deliberately not an auto-playing carousel. A slide that moves on its own
 * takes the decision away from the person reading it — they lose the thing
 * they were half-way through, and on a stall's homepage the item that matters
 * is whichever one they stopped on. Nothing here moves unless someone moves it.
 *
 * The scrolling itself is the browser's, not ours: a flex row with CSS scroll
 * snapping. That means the native swipe on a phone, momentum, rubber-banding
 * at the ends and trackpad gestures on a laptop all work exactly as the person
 * expects, because they are not reimplemented. React only watches where the
 * scroll ended up, so it can light the right dot.
 */
export function Swiper({
  children,
  label,
}: {
  children: ReactNode[];
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // One slide is not a carousel. Dots and arrows over a single card are
  // controls that do nothing, which is worse than no controls.
  const many = children.length > 1;

  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // Round rather than floor: half-way through a swipe the next card is
    // already the one being looked at, and the dot should agree.
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={many ? onScroll : undefined}
        aria-roledescription="carousel"
        aria-label={label}
        className={`flex snap-x snap-mandatory scroll-smooth ${
          many ? "no-bar overflow-x-auto" : "overflow-hidden"
        }`}
      >
        {children.map((slide, i) => (
          <div
            key={i}
            className="w-full shrink-0 snap-center"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${children.length}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {many && (
        // Both controls sit left. Pushed to the right edge they land under
        // the fixed "Ask Pepper Pan" launcher, which is exactly where a
        // right-handed thumb and a mouse both go for "next".
        <div className="mt-6 flex items-center gap-5">
          {/* The dots are the indicator, and they are also the control —
              a person who can see which card they are on can tap to any
              other one. */}
          <div className="flex items-center gap-2">
            {children.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Show item ${i + 1}`}
                aria-current={i === active}
                className={`h-2.5 rounded-full transition-all ${
                  i === active
                    ? "w-8 bg-ink-950"
                    : "w-2.5 bg-ink-950/30 hover:bg-ink-950/55"
                }`}
              />
            ))}
          </div>

          {/* Arrows for anyone on a mouse, who cannot swipe. Hidden from
              screen readers because the dots above already say the same
              thing, and saying it twice is noise. */}
          <div className="hidden gap-2 sm:flex">
            <button
              onClick={() => goTo(Math.max(0, active - 1))}
              disabled={active === 0}
              aria-label="Previous"
              className="grid h-10 w-10 place-items-center rounded-full bg-ink-950 text-lg font-black text-cream-50 transition-opacity disabled:opacity-30"
            >
              ←
            </button>
            <button
              onClick={() => goTo(Math.min(children.length - 1, active + 1))}
              disabled={active === children.length - 1}
              aria-label="Next"
              className="grid h-10 w-10 place-items-center rounded-full bg-ink-950 text-lg font-black text-cream-50 transition-opacity disabled:opacity-30"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
