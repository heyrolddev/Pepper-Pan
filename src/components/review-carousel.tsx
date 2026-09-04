"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Stars } from "@/components/stars";

export type FeaturedReview = {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  mealName: string | null;
};

/**
 * The homepage's reviews: three cards at a time, and you can push them.
 *
 * Three cards rather than one big quote, because social proof is partly a
 * count — three cards read as *several people liked this*, one quote reads as
 * one person did.
 *
 * The move away from transform-paging is the point of this file. It used to
 * translate a track by whole pages, which meant the only way to get to a
 * different review was the row of dots underneath: the cards themselves did
 * nothing when you touched them. On a phone that is the wrong way round —
 * the obvious thing to do with a row of cards is push it sideways, and the
 * dots are eight pixels tall at the bottom of a dark section.
 *
 * So the scrolling is the browser's now: a flex row with CSS scroll snapping.
 * Touch swipe, momentum, rubber-band at the ends, trackpad gestures and
 * keyboard all work without being reimplemented, because they are not
 * reimplemented. React only watches where the scroll ended up so it can light
 * the right dot, and adds the one thing native scrolling does not give you —
 * click-and-drag with a mouse.
 *
 * It still stops when it should: while you are touching it, on hover, on
 * keyboard focus, in a background tab, and permanently for anyone who asked
 * for reduced motion. Text that moves while you are reading it is how a
 * carousel becomes worse than a list.
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
  const track = useRef<HTMLUListElement>(null);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [motionOk, setMotionOk] = useState(false);
  const [visible, setVisible] = useState(true);
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

  /** Scroll to a page, wrapping at both ends so it never dead-ends. */
  const goTo = useCallback(
    (i: number, smooth = true) => {
      const el = track.current;
      if (!el) return;
      const last = pages - 1;
      const target = i < 0 ? last : i > last ? 0 : i;
      el.scrollTo({
        left: target * el.clientWidth,
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [pages]
  );

  // Where the scroll actually ended up, which is the only thing that knows
  // where a swipe left off. Rounded rather than floored: half-way through a
  // swipe the next page is the one being looked at, and the dot should agree.
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  // Auto-advance. Keyed on the page so a swipe or a tap restarts the full
  // interval — landing on a card with half a second left before it slides
  // away is worse than it not advancing at all.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => goTo(safePage + 1), INTERVAL);
    return () => clearTimeout(t);
  }, [running, safePage, goTo]);

  /* ---------------- click and drag, for a mouse ---------------- */

  // Native scrolling covers touch and trackpad. It does not cover holding the
  // left button and pulling, which is what someone on a laptop tries first
  // once the cards look draggable. Pointer events cover all three input
  // kinds, so this is written once rather than per device.
  const drag = useRef<{ startX: number; startLeft: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    // Touch already scrolls natively and far better than this would; taking
    // it over here would replace momentum with a worse imitation of it.
    if (e.pointerType === "touch") return;
    const el = track.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft };
    setDragging(true);
    setPaused(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const el = track.current;
    if (!drag.current || !el) return;
    // Capture only once the pull is deliberate. Grabbing the pointer on the
    // first pixel would swallow clicks on anything inside a card.
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4 && !el.hasPointerCapture(e.pointerId)) {
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = drag.current.startLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLUListElement>) => {
    const el = track.current;
    if (!drag.current || !el) return;
    drag.current = null;
    setDragging(false);
    setPaused(false);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // Settle on the nearest page. Scroll snapping does this by itself after a
    // real scroll, but a drag sets scrollLeft directly and leaves it wherever
    // the hand stopped.
    goTo(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (reviews.length === 0) return null;

  return (
    <div
      className="mt-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="-mx-2.5">
        <ul
          ref={track}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-roledescription="carousel"
          aria-label="What people say"
          // `no-bar` hides the scrollbar without disabling the scrolling —
          // the section is dark and a pale native bar under the cards reads
          // as a mistake. Touch action stays on the browser for panning, so
          // vertical page scrolling still works with a finger on a card.
          className={`no-bar flex snap-x snap-mandatory items-stretch overflow-x-auto ${
            dragging ? "cursor-grabbing select-none" : "cursor-grab"
          }`}
        >
          {reviews.map((r) => (
            <li
              key={r.id}
              className="w-full shrink-0 snap-start px-2.5 sm:w-1/2 lg:w-1/3"
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
          ))}
        </ul>
      </div>

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
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
