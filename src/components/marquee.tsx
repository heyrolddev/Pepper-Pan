"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The scrolling band, looping with no seam and no gap.
 *
 * WHY THIS MEASURES INSTEAD OF JUST DUPLICATING
 *
 * The usual trick is to render the content twice and slide the track by 50%.
 * That is seamless only while ONE copy is at least as wide as the screen —
 * and this band's content is the shop's own promos, typed by the owner. With
 * two short promos on a wide monitor, one copy came to under half the width,
 * the track ran out, and the far end of the band showed empty red.
 *
 * So the number of copies cannot be a constant: it depends on the words in
 * the database and the width of the screen, and neither is known when the
 * CSS is written. One copy is measured, and enough are rendered to cover the
 * band at the furthest point of the travel.
 *
 * THE ARITHMETIC, SO NOBODY HAS TO REDERIVE IT
 *
 * With `n` copies each `c` wide, the track is `n · c`, and a transform
 * percentage is a share of the element's own width — so `-100% / n` slides
 * exactly one copy, which is what makes the loop seamless.
 *
 * At the end of that slide the visible window covers track pixels `c` to
 * `c + v`. To have content there, `c + v ≤ n · c`, so `n ≥ v/c + 1`. Hence
 * `ceil(v/c) + 1` below. The `+ 1` is the whole fix: `ceil(v/c)` alone leaves
 * the band exactly one pixel short at the moment it wraps.
 */

/**
 * Pixels a second.
 *
 * A speed rather than a duration, because the content is user-entered. A
 * fixed 32-second loop meant two short promos crawled and six long ones
 * raced — the band read at whatever pace the owner happened to type. At a
 * fixed speed it always reads the same, whatever is in it.
 */
const SPEED = 55;

/** Below this the "loop" is visible as a loop. Two is the floor, not the norm. */
const MIN_COPIES = 2;

/** Only used before the first measurement, and only for one frame. */
const FALLBACK_SECONDS = 32;

export function Marquee({
  items,
  className = "",
  trackClassName = "",
  separator = "✦",
}: {
  items: ReactNode[];
  className?: string;
  trackClassName?: string;
  separator?: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const firstRun = useRef<HTMLDivElement>(null);
  // Two on the server and on the first client render, so the markup matches
  // and nothing is re-hydrated into a different shape. The real count arrives
  // after the measurement, which cannot happen until there is a layout.
  const [copies, setCopies] = useState(MIN_COPIES);
  const [runWidth, setRunWidth] = useState(0);

  const measure = useCallback(() => {
    const band = viewport.current;
    const run = firstRun.current;
    if (!band || !run) return;
    const width = run.offsetWidth;
    // Zero while the band is inside something display:none — measuring then
    // would ask for an infinite number of copies.
    if (width <= 0) return;
    setRunWidth(width);
    setCopies(Math.max(MIN_COPIES, Math.ceil(band.offsetWidth / width) + 1));
  }, []);

  useEffect(() => {
    measure();
    // Watching the run as well as the band is what catches the display face
    // swapping in after first paint: Fraunces is wider than the fallback, so
    // a count worked out before the swap is a count that no longer covers.
    // Re-setting state to the value it already holds is a no-op in React, so
    // this settles rather than looping.
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (firstRun.current) observer.observe(firstRun.current);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const run = (index: number) => (
    <div
      key={index}
      ref={index === 0 ? firstRun : undefined}
      className="flex shrink-0 items-center"
      // One copy is the content; the rest are the loop. A screen reader
      // should hear the promos once.
      aria-hidden={index > 0}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          <span className="px-6">{item}</span>
          <span className="opacity-60">{separator}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div ref={viewport} className={`overflow-hidden ${className}`}>
      <div
        className={`marquee-track ${trackClassName}`}
        style={{
          ["--marquee-copies" as string]: copies,
          animationDuration: runWidth
            ? `${(runWidth / SPEED).toFixed(2)}s`
            : `${FALLBACK_SECONDS}s`,
        }}
      >
        {Array.from({ length: copies }, (_, i) => run(i))}
      </div>
    </div>
  );
}
