"use client";

import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, type MouseEvent } from "react";

/**
 * A photograph, set down on the page rather than placed in a box.
 *
 * The story section used to show a dish cut out on a gradient — a product
 * shot, which is what the menu is for. A picture of the actual stall is a
 * different thing and wants to be treated like one: a snapshot, laid down
 * slightly crooked, with a hard black edge and a shadow you could slide a
 * finger under.
 *
 * Two movements, and the split between them is the point:
 *
 *   Scroll  is the main one, and it works on a phone. The photo comes in
 *           tilted and settles straight as it reaches the middle of the
 *           screen, while the shadow slides in behind it — a photo being put
 *           down on a table. Most of this shop's customers are on a phone; an
 *           effect only a mouse can trigger is an effect almost nobody sees.
 *
 *   Cursor  is the extra, for anyone who has one. A small 3D lean toward the
 *           pointer, on springs so it lags slightly rather than snapping.
 *
 * Reduced motion turns both off and leaves the photograph square and still.
 * The framing stays, because the framing is not motion.
 */
export function TiltPhoto({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  // Where this element is in its journey up the screen: 0 as it appears from
  // the bottom, 1 once it has reached the middle. Everything below reads from
  // this one number, so the settle is tied to the scroll rather than to a
  // timer that fires whether or not anybody is looking.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const settle = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 22,
    restDelta: 0.001,
  });

  const rotate = useTransform(settle, [0, 1], [-7, -1.5]);
  const lift = useTransform(settle, [0, 1], [34, 0]);
  // The shadow plate starts far out and tucks in behind. Two numbers rather
  // than one so it travels diagonally, which is what a shadow does.
  const plateX = useTransform(settle, [0, 1], [34, 14]);
  const plateY = useTransform(settle, [0, 1], [40, 14]);

  // Cursor lean. Held at zero and only written on pointer move, so a page
  // nobody has touched sits exactly where the scroll put it.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 140, damping: 18 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [7, -7]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-9, 9]), spring);

  function follow(e: MouseEvent<HTMLDivElement>) {
    if (still) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }

  function release() {
    px.set(0);
    py.set(0);
  }

  if (still) {
    return (
      <div className={`relative ${className}`}>
        <div className="relative aspect-square w-full overflow-hidden rounded-[1.75rem] border-4 border-ink-950 bg-ink-950">
          <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 45vw, 90vw" className="object-cover" />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* The shadow, as an object rather than a blur. It is the same shape as
          the photograph and the same red the rest of the page is built from,
          so the gap between the two reads as depth instead of as a glow. */}
      <motion.div
        aria-hidden
        style={{ x: plateX, y: plateY, rotate }}
        className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-brand-600"
      />

      <motion.div
        onMouseMove={follow}
        onMouseLeave={release}
        style={{ rotate, y: lift, rotateX, rotateY, transformPerspective: 1100 }}
        className="relative aspect-square w-full overflow-hidden rounded-[1.75rem] border-4 border-ink-950 bg-ink-950 will-change-transform"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 45vw, 90vw"
          className="object-cover"
        />
        {/* A faint warm wash, so a phone snapshot sits with the rest of the
            page rather than looking pasted in from somewhere else. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/35 via-transparent to-transparent"
        />
      </motion.div>
    </div>
  );
}
