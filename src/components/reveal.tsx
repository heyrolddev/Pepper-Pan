import type { ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "scale";

/**
 * Fade-and-rise as something scrolls into view — without holding the page
 * hostage to the bundle.
 *
 * This used to be a `motion.div` with `initial={{ opacity: 0 }}` and a
 * `whileInView`. Motion renders that initial state into the server HTML so
 * there is no flash once it hydrates, which is the right call for a component
 * that always hydrates promptly. It ships:
 *
 *     <div style="opacity:0;transform:translateY(28px)">
 *
 * The homepage has twenty-two of these. So on any load where the JavaScript
 * had not arrived yet — a hard refresh, which re-fetches the bundle instead of
 * taking it from cache — the entire page below the hero was invisible. Not
 * slow: invisible, with the layout already in place, which reads as a broken
 * site rather than a loading one. The intro splash had been covering it, and
 * once that started skipping itself on the second load of a session there was
 * nothing left in front of it.
 *
 * So the animation is CSS now, driven by a view timeline, and the element is
 * VISIBLE by default. Nothing has to run for the words to be on the screen.
 * Where the browser has no view timelines, and for anyone who has asked for
 * less motion, the `@supports`/media fallbacks in globals.css leave it exactly
 * as the server sent it. The same trade the menu grid already made with
 * `card-in`, for the same reason.
 *
 * No `"use client"` either: there is nothing to hydrate, so twenty-two
 * subtrees stop being client components.
 */
export function Reveal({
  children,
  delay = 0,
  direction = "up",
  className,
}: {
  children: ReactNode;
  /**
   * Seconds in the old API, kept so call sites did not have to change. A view
   * timeline has no clock — progress is scroll position — so this becomes a
   * head start instead: a later sibling begins its fade a little further into
   * its own entry, which reads as the same stagger going down the page.
   */
  delay?: number;
  direction?: Direction;
  className?: string;
}) {
  const shift = Math.min(Math.round(delay * 100), 40);
  return (
    <div
      data-reveal={direction}
      style={shift ? ({ "--reveal-from": `${shift}%` } as React.CSSProperties) : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
