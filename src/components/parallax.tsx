"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/**
 * A layer that travels slower than the page, so the page gains depth.
 *
 * The whole trick is that nearer things move more than far ones, which is why
 * the distance is small: 40 or 60 pixels reads as depth, 200 reads as a bug
 * and drags the layer clean out of its section on a tall phone.
 *
 * Only `transform` is animated, so the browser can do it on the compositor
 * without laying the page out again. Anything that moved `top` here would
 * cost a layout on every scroll frame, which on a mid-range Android is the
 * difference between depth and stutter.
 *
 * Meant for decoration — a photograph behind text, a colour wash, a mark in a
 * corner. Not for anything anybody has to read or tap: a control that drifts
 * as you reach for it is a control you miss.
 */
export function Parallax({
  children,
  distance = 60,
  className,
}: {
  children: ReactNode;
  /** How far the layer lags, in pixels, across the whole section. */
  distance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  // Measured from the section entering the bottom of the screen to it leaving
  // the top, so the movement is spread over the whole time it is visible
  // rather than finishing before anybody has seen it.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={still ? undefined : { y }} className="h-full w-full">
        {children}
      </motion.div>
    </div>
  );
}
