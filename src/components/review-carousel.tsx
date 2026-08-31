"use client";

import { useEffect, useState } from "react";
import { Stars } from "@/components/stars";

export type FeaturedReview = {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  mealName: string | null;
};

/**
 * The homepage's reviews: three cards at a time, moving.
 *
 * The first attempt showed one big quote and rotated it. It moved, which was
 * the ask — but it threw away what the grid was good at: three cards read as
 * *several people liked this*, and one quote reads as one person did. Social
 * proof is partly a count, and the count has to be visible.
 *
 * So the cards stay and the whole row pages. Three at a time on a desktop, two
 * on a tablet, one on a phone — the widths are plain CSS, so the first paint
 * is right before any JavaScript runs, and only the page arithmetic needs to
 * know how many fit.
 *
 * It stops when it should: on hover, on keyboard focus, in a background tab,
 * and permanently for anyone who's asked for reduced motion. Text that moves
 * while you're reading it is how a carousel becomes worse than a list.
 */

/** Three cards is more to read than one quote was. */
const INTERVAL = 6500;

/** Must match the `sm:` and `lg:` card widths below, or the dots lie. */
function perPageFor(width: number): number {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export function ReviewCarousel({ reviews }: { reviews: FeaturedReview[] }) {
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
  const [visible, setVisible] = useState(true);
  // Three to start: the desktop case, and the widest. A phone corrects it on
  // mount, long before the first auto-advance — and page 0 looks identical
  // either way, so nothing visibly shifts underneath anyone.
  const [perPage, setPerPage] = useState(3);

  useEffect(() => {
    const sync = () => setPerPage(perPageFor(window.innerWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  // Watched rather than read once: someone can turn reduced motion on while
  // the page is open, and the honest thing is to stop rather than wait for a
  // reload.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMotionOk(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A carousel ticking in a background tab is work nobody can see, and coming
  // back to the tab lands you on a card you never started reading.
  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const pages = Math.max(1, Math.ceil(reviews.length / perPage));
  const safePage = Math.min(page, pages - 1);
  const running = motionOk && !paused && visible && pages > 1;

  // Keyed on the page so a manual jump restarts the full interval. Landing on
  // a page with half a second left before it slides away is worse than not
  // being able to jump at all.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setPage((p) => (p + 1) % pages), INTERVAL);
    return () => clearTimeout(t);
  }, [running, safePage, pages]);

  if (reviews.length === 0) return null;

  return (
    <div
      className="mt-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* The track is exactly one page wide, so translating it by 100% moves
          by one page — not by its own full length, which is the classic way
          this goes wrong the moment there are more cards than fit. */}
      <div className="-mx-2.5 overflow-hidden">
        <ul
          className="flex w-full items-stretch transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${safePage * 100}%)` }}
        >
          {reviews.map((r, i) => {
            const onThisPage =
              i >= safePage * perPage && i < (safePage + 1) * perPage;
            return (
              <li
                key={r.id}
                className="w-full shrink-0 px-2.5 sm:w-1/2 lg:w-1/3"
                // Cards scrolled out of view are still in the document, so a
                // keyboard would otherwise tab onto a card nobody can see.
                aria-hidden={!onThisPage}
              >
                <figure className="flex h-full flex-col gap-3 rounded-3xl bg-cream-50/10 p-6 ring-1 ring-cream-50/20">
                  <Stars rating={r.rating} className="text-gold-300" />
                  <blockquote className="flex-1 font-display text-lg font-bold leading-snug">
                    &ldquo;{r.comment}&rdquo;
                  </blockquote>
                  <figcaption className="text-sm text-cream-100/70">
                    {r.author}
                    {r.mealName && ` · ${r.mealName}`}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      </div>

      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              aria-label={`Reviews, page ${i + 1} of ${pages}`}
              aria-current={i === safePage}
              // A tap target the size of the dot is a tap target nobody hits,
              // so the button is finger-sized and the dot sits inside it.
              className="grid h-9 w-9 place-items-center"
            >
              <span
                className={`block rounded-full transition-all ${
                  i === safePage
                    ? "h-2.5 w-7 bg-gold-400"
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
