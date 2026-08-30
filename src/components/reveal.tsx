"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Direction = "up" | "down" | "left" | "right" | "scale";

const offsets: Record<Direction, { x?: number; y?: number; scale?: number }> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: 36 },
  right: { x: -36 },
  scale: { scale: 0.94 },
};

export function Reveal({
  children,
  delay = 0,
  direction = "up",
  className,
}: {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
}) {
  // Someone who has asked their device for less motion gets the content in
  // place, with no slide and no fade.
  //
  // This does not, on its own, stop a card sitting 36px off to the side while
  // it waits to be scrolled into view: the preference is only known after
  // mount, so the first render still carries the offset. What stops that from
  // becoming a page you can drag sideways is the overflow guard in
  // globals.css. This is here for the motion, not the layout.
  const still = useReducedMotion();
  const from = still ? {} : offsets[direction];

  return (
    <motion.div
      initial={still ? false : { opacity: 0, ...from }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
