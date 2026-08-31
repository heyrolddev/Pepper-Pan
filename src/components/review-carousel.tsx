"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Stars } from "@/components/stars";

export type FeaturedReview = {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  mealName: string | null;
};

/**
 * The homepage's reviews, moving.
 *
 * A fixed grid of three showed the same three forever — so the fourth review a
 * customer ever writes is one nobody outside the reviews page will read, and
 * the shop's best word-of-mouth sits in a drawer. Rotating shows all of them
 * over a minute of scrolling, which is roughly how long someone spends on a
 * homepage anyway.
 *
 * It stops when it should: on hover, on keyboard focus, when the tab is in the
 * background, and permanently for anyone who's asked their system for reduced
 * motion. Text that moves on its own while you're reading it is the most
 * common way a carousel becomes worse than a list — every one of those is a
 * moment where the reader, not the timer, should be in charge.
 */

/** Long enough to read two lines without hurrying. */
const INTERVAL = 5200;

export function ReviewCarousel({ reviews }: { reviews: FeaturedReview[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const count = reviews.length;

  // Asked once and then watched: someone can turn reduced motion on while the
  // page is open, and the honest thing is to stop rather than wait for a
  // reload.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowed(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A carousel ticking away in a background tab is work nobody can see. It
  // also means returning to the tab lands you mid-sentence on a review you
  // never started.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const running = allowed && !paused && visible && count > 1;

  // Keyed on `index` so every manual jump restarts the full interval — landing
  // on a review with half a second left before it slides away is worse than
  // not being able to jump at all.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearTimeout(t);
  }, [running, index, count]);

  if (count === 0) return null;
  const r = reviews[index];

  return (
    <div
      className="relative mt-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The quote sits absolutely over every review rendered invisibly, so
          the section is as tall as the longest one and doesn't jump as the
          text changes.
          
          Those invisible copies share one grid cell. In normal flow they
          stacked, and the block reserved the *sum* of every review's height —
          a wall of red with one quote floating in the middle of it.
          
          And the pair needs its own positioned box: with `inset-0` measured
          against the whole component, the overlay reached down over the dots
          and swallowed every click on them. The dots looked fine and simply
          did nothing. */}
      <div className="relative">
        <div aria-hidden className="invisible grid" role="presentation">
          {reviews.map((x) => (
            <div key={x.id} className="px-6 py-1 [grid-area:1/1]">
              {/* The stars are here because they're there. Leave them out and
                  the reserved height is short by exactly one row of stars, so
                  the real quote overflows its box and lands on the dots. */}
              <Stars rating={x.rating} className="mx-auto" size="lg" />
              <p className="mt-4 font-display text-xl font-black leading-snug sm:text-2xl">
                &ldquo;{x.comment}&rdquo;
              </p>
              <p className="mt-3 text-sm">
                {x.author}
                {x.mealName && ` · ${x.mealName}`}
              </p>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 grid place-items-center">
          <AnimatePresence mode="wait">
            <motion.blockquote
              key={r.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-2xl px-6 text-center"
            >
              <Stars
                rating={r.rating}
                className="mx-auto text-gold-300"
                size="lg"
              />
              <p className="mt-4 font-display text-xl font-black leading-snug sm:text-2xl">
                &ldquo;{r.comment}&rdquo;
              </p>
              <p className="mt-3 text-sm text-cream-100/70">
                {r.author}
                {r.mealName && ` · ${r.mealName}`}
              </p>
            </motion.blockquote>
          </AnimatePresence>
        </div>
      </div>

      {count > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {reviews.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setIndex(i)}
              aria-label={`Review ${i + 1} of ${count}`}
              aria-current={i === index}
              // A tap target the size of the dot is a tap target nobody hits,
              // so the button is finger-sized and the dot just sits in it.
              className="grid h-8 w-8 place-items-center"
            >
              <span
                className={`block rounded-full transition-all ${
                  i === index
                    ? "h-2.5 w-6 bg-gold-400"
                    : "h-2.5 w-2.5 bg-cream-50/35 hover:bg-cream-50/60"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
