"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";

type Favorite = { name: string; image: string };

/**
 * The dishes, one at a time, while the section holds still.
 *
 * This is the pattern the owner pointed at: a section that stops on screen
 * and changes its contents as you keep scrolling, instead of sliding past.
 * It reads as a thing being shown to you rather than a page going by, which
 * is exactly the difference between a grid of six photographs and six
 * photographs each getting a moment.
 *
 * WHAT IT COSTS, AND WHAT IT DOES NOT
 *
 * Nothing new is downloaded. The six photographs are the same files the grid
 * already uses, so the effect is layout and transform — no image sequence, no
 * library, no extra request. Only `opacity` and `transform` move, both of
 * which the browser can hand to the compositor, so scrolling stays smooth on
 * a mid-range phone.
 *
 * WHY IT IS NOT ON PHONES
 *
 * A pinned section on a phone is where these designs usually go wrong: the
 * page appears to stop, the reader thinks it has frozen, and a stall's
 * customer is one flick from leaving. It also eats six screens of scroll on
 * the device with the least of it. Below `sm` the plain grid is shown
 * instead — see `page.tsx`, where the two are swapped by CSS rather than by
 * measuring the window, so the right one is in the HTML before anything runs.
 *
 * The pin itself is a `sticky` child inside a tall parent. No scroll
 * hijacking, no listener moving the page: scrolling is exactly as fast as the
 * reader's finger, and flicking past is always possible.
 */
export function PinnedDishes({ items }: { items: Favorite[] }) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    // From the moment the tall section's top meets the top of the screen
    // until its bottom does — which is exactly the span the sticky child is
    // pinned for, so the last dish is fully shown before the pin releases.
    offset: ["start start", "end end"],
  });

  return (
    // One screen per dish, plus one so the last one is read rather than
    // glimpsed on the way out.
    <div ref={ref} style={{ height: `${(items.length + 1) * 100}vh` }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 items-center gap-12 px-6">
          {/* The names, stacked. Each one lights as its dish arrives, so the
              list doubles as a position indicator — a reader can see there
              are six and where they are, which a lone changing photograph
              cannot tell them. */}
          <div>
            {/* The section heading is a screen and a half above by the time
                the pin takes hold, so the pinned view would otherwise be six
                photographs with no idea what they are. This is the only text
                that stays put. */}
            <p className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-gold-400">
              Fan favorites
            </p>
            <ol className="flex flex-col gap-3">
            {items.map((item, i) => (
              <Name
                key={item.name}
                index={i}
                total={items.length}
                progress={scrollYProgress}
                name={item.name}
              />
            ))}
            </ol>
            <Link
              href="/menu"
              className="mt-8 inline-block rounded-full border border-cream-100/25 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors hover:border-gold-400 hover:text-gold-400"
            >
              See the whole menu →
            </Link>
          </div>

          <div className="relative aspect-square">
            {items.map((item, i) => (
              <Plate
                key={item.name}
                index={i}
                total={items.length}
                progress={scrollYProgress}
                item={item}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The window of scroll this dish owns.
 *
 * Each dish gets an equal slice, and the fades overlap slightly at the edges
 * so one is always arriving as another leaves — a hard cut at the boundary
 * reads as a glitch rather than as a change.
 *
 * CLAMPED TO 0–1, AND THAT IS NOT A DETAIL.
 *
 * The overlap pushes the first dish's window below zero and the last one's
 * past one. Motion hands these straight to the Web Animations API as keyframe
 * offsets, which must sit inside 0–1 and never go backwards; an offset of
 * -0.058 throws, the throw escapes into React, and the whole homepage renders
 * its error boundary. It did — while tsc, eslint, 132 tests and the
 * production build all passed, because none of them run a browser.
 *
 * Clamping can collapse two neighbours onto the same number, which is also
 * rejected, so each value is nudged past the one before it.
 */
function window(index: number, total: number): [number, number, number, number] {
  const span = 1 / total;
  const start = index * span;
  const raw = [
    start - span * 0.35,
    start + span * 0.15,
    start + span * 0.85,
    start + span * 1.35,
  ];

  const out: number[] = [];
  for (const value of raw) {
    const clamped = Math.min(1, Math.max(0, value));
    const previous = out[out.length - 1];
    out.push(previous === undefined ? clamped : Math.max(clamped, previous + 1e-4));
  }
  return out as [number, number, number, number];
}

function Plate({
  index,
  total,
  progress,
  item,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  item: Favorite;
}) {
  const [a, b, c, d] = window(index, total);
  const opacity = useTransform(progress, [a, b, c, d], [0, 1, 1, 0]);
  // A little larger on the way in and out, so it lifts towards the reader
  // rather than merely appearing.
  const scale = useTransform(progress, [a, b, c, d], [0.88, 1, 1, 1.06]);

  return (
    <motion.div
      style={{ opacity, scale }}
      className="absolute inset-0 will-change-[opacity,transform]"
    >
      <Link href="/menu" className="group block h-full w-full">
        <Image
          src={item.image}
          alt={item.name}
          fill
          sizes="(min-width: 1024px) 40vw, 50vw"
          className="rounded-3xl object-cover ring-2 ring-gold-400/70"
        />
      </Link>
    </motion.div>
  );
}

function Name({
  index,
  total,
  progress,
  name,
}: {
  index: number;
  total: number;
  progress: MotionValue<number>;
  name: string;
}) {
  const [a, b, c, d] = window(index, total);
  const opacity = useTransform(progress, [a, b, c, d], [0.28, 1, 1, 0.28]);
  const x = useTransform(progress, [a, b, c, d], [-14, 0, 0, -14]);

  return (
    <motion.li
      style={{ opacity, x }}
      className="font-display text-3xl font-black tracking-tight text-cream-50 will-change-[opacity,transform] lg:text-4xl"
    >
      {name}
    </motion.li>
  );
}
