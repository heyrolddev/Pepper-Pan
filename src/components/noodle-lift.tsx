"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/reduced-motion";

/**
 * Chopsticks lifting a pull of flat white noodles, as the page scrolls.
 *
 * HOW THE STRETCH IS FAKED, AND WHY IT IS FAKED THAT WAY
 *
 * Noodles being lifted is a shape that changes — which is exactly the thing a
 * photograph cannot do and a path can. But recomputing a dozen path strings on
 * every scroll frame means running JavaScript between every frame the browser
 * paints, and on a mid-range Android that is where smooth becomes sticky.
 *
 * So nothing is recomputed. The strands are drawn once, at full length, in a
 * group that simply translates upward — and the pan is painted over the top of
 * them, so the part still below the surface is covered rather than cut. As the
 * group rises, more of each strand clears the noodles it was buried in.
 * Translation plus an opaque foreground reads as stretching, and costs one
 * compositor transform.
 *
 * Painting the pan last is what makes this work. A clip would leave every
 * strand with a flat sliced end floating in the gap above the pan; noodles
 * covering noodles is what a real pull looks like.
 *
 * WHY THERE IS NO LINE BETWEEN THIS AND THE SECTION BELOW
 *
 * The band starts on the cream the section above ends on, and finishes on
 * exactly the ink-950 the section below starts on — #120a08, the same value,
 * not a near miss. The dusk gradient over the bottom of the pan carries one
 * into the other, so the last thing anybody can see of the boundary is
 * noodles going dark. There is no rule, no edge, and nothing to line up:
 * the noodles are the divider.
 *
 * WHY THE NOODLES ARE WHITE
 *
 * These are flat wheat noodles, which are pale — the colour in the bowl comes
 * from the sauce, not the dough. Painting them gold made them pasta. Painting
 * them white and letting black pepper sauce pool in the folds is both what the
 * dish looks like and much better contrast for the pepper.
 *
 * Flatness is carried by the edge, not the fill. Every noodle is a light top
 * face with one darker band down its side — that band is the thickness of the
 * ribbon, and it is the whole difference between a flat noodle and a tube.
 *
 * WHAT IS DRAWN AND WHAT COULD BE PHOTOGRAPHED
 *
 * Rigid things can be photographs; things that change shape have to be drawn.
 * Chopsticks never bend, so a cut-out of a real pair would drop straight into
 * <g id="sticks">. The noodles cannot be a photograph, for the reason above.
 *
 * GEOMETRY, so the numbers are not magic
 *   viewBox        0 -60 1200 580 — the frame starts 60 above the origin, and
 *                  that headroom is what keeps the chopsticks on screen at
 *                  full lift instead of sliding out of the top with the pull
 *   pan surface    y = 300; bands run to 486, then dusk takes them to ink-950
 *   strands drawn  y = 70 (gripped) down to y = 900 (deep in the pan)
 *   lift travel    y +240 (buried) to y -40 (fully lifted)
 * At full lift the deepest strand end sits at 850, far below the frame, so the
 * pull never detaches from the noodles it came out of; and the chopsticks
 * start below the surface, so they are seen reaching in before they lift.
 */

/**
 * The pull. Real lifted noodles fan out fast just below the grip and then hang
 * near-vertically, because gravity does not fan. They are also gripped along
 * the width of the chopsticks rather than at one point — strands that all
 * converge on a single pixel paint over each other's shading and come out as
 * one solid slab.
 */
const STRANDS = [
  { d: "M566 74 C 548 110, 512 140, 504 200 S 496 400, 490 600 S 470 790, 490 900", w: 42 },
  { d: "M656 70 C 676 106, 712 138, 720 198 S 726 398, 730 598 S 748 790, 730 900", w: 34 },
  { d: "M596 82 C 588 118, 574 150, 572 210 S 566 410, 560 610 S 540 792, 558 900", w: 46 },
  { d: "M634 78 C 648 114, 660 146, 662 206 S 668 406, 674 606 S 692 790, 676 900", w: 30 },
  // The drape: down, round, and back up, both ends under the chopsticks. It is
  // the single detail that most says "noodles" rather than "lines".
  { d: "M604 82 C 580 140, 554 214, 562 284 C 572 340, 650 342, 656 278 C 662 210, 634 148, 630 96", w: 32 },
];

/**
 * The pan, painted over the pull. The silhouette is filled first so no cream
 * can show between bands or below the last one — a gap there turns a pan of
 * noodles back into seven drawn lines.
 */
const PAN_FILL =
  "M-40 300 C 160 268, 330 332, 510 300 S 840 268, 1020 300 S 1180 332, 1260 300 L1260 540 L-40 540 Z";

const MASS = [
  { d: "M-40 300 C 160 268, 330 332, 510 300 S 840 268, 1020 300 S 1180 332, 1260 300", w: 40 },
  { d: "M-40 332 C 100 366, 280 300, 460 336 S 790 372, 980 332 S 1170 300, 1260 336", w: 36 },
  { d: "M-40 360 C 180 326, 360 396, 540 360 S 860 326, 1040 360 S 1190 394, 1260 360", w: 42 },
  { d: "M-40 392 C 120 426, 300 360, 480 396 S 810 430, 1000 392 S 1180 360, 1260 396", w: 36 },
  { d: "M-40 422 C 200 388, 380 456, 560 422 S 880 388, 1060 422 S 1200 456, 1260 422", w: 44 },
  { d: "M-40 454 C 140 488, 320 422, 500 458 S 830 492, 1020 454 S 1190 422, 1260 458", w: 38 },
  { d: "M-40 486 C 170 452, 350 520, 530 486 S 850 452, 1030 486 S 1200 518, 1260 486", w: 42 },
];

/**
 * One flat noodle, in five strokes, and the order is the whole trick.
 *
 *   contour    A dark rim. White on cream has no edge of its own; without
 *              this the noodles dissolve into the page instead of sitting in
 *              front of it.
 *   face       The flat top of the ribbon, warm white.
 *   edge       A darker band down one side. This is the thickness of the
 *              noodle seen slightly turned, and it is the single thing that
 *              separates a flat noodle from a tube.
 *   sauce      Black pepper sauce, pooled below the edge where gravity puts
 *              it. On a white noodle it clings in the folds rather than
 *              coating the whole thing.
 *   gloss      One wet line along the lit side, or it reads as paper.
 */
function Noodle({ d, w }: { d: string; w: number }) {
  const off = (n: number) => (w * n).toFixed(1);
  return (
    <>
      <path d={d} fill="none" stroke="#2b1b10" strokeOpacity={0.92} strokeWidth={w + 5} />
      <path d={d} fill="none" stroke="#f7eedb" strokeWidth={w} />
      <path
        d={d}
        fill="none"
        stroke="#c9ae82"
        strokeWidth={w * 0.26}
        transform={`translate(${off(0.12)} ${off(0.3)})`}
      />
      <path
        d={d}
        fill="none"
        stroke="#33200f"
        strokeOpacity={0.45}
        strokeWidth={w * 0.2}
        transform={`translate(${off(0.13)} ${off(0.38)})`}
      />
      {/* Wide, not a pinstripe. A flat noodle is mostly lit face with one
          shaded edge; a narrow highlight down the middle of a dark body is
          how you draw a tube. */}
      <path
        d={d}
        fill="none"
        stroke="#fffdf6"
        strokeOpacity={0.7}
        strokeWidth={w * 0.38}
        transform={`translate(-${off(0.12)} -${off(0.16)})`}
      />
    </>
  );
}

export function NoodleLift() {
  const ref = useRef<HTMLDivElement>(null);
  const still = usePrefersReducedMotion();

  // Runs while the band crosses the screen, so the lift is spread over the
  // whole time it is visible rather than finishing before anybody sees it.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  // The one value everything reads.
  //
  // The input range is 0.15-0.5, not 0-1, and that is the whole trick. With
  // offset ["start end", "end start"], progress 0 is the band just below the
  // fold and progress 1 is the band just above it — at both ends nobody can
  // see it, and a band this size is only fully on screen from about a third
  // of the way through. Spending the travel over the full range leaves the
  // pull half-buried at the one moment it is best framed. Ending at 0.5 puts
  // the noodles at full extension exactly when the band is centred, and
  // Motion clamps after that, so they stay lifted on the way out.
  const lift = useTransform(scrollYProgress, [0.15, 0.5], [240, -40]);
  // A little rotation, because a hand lifting noodles turns the wrist.
  const tilt = useTransform(scrollYProgress, [0.15, 0.5], [-5, 5]);

  const moving = still ? { y: 60, rotate: 0 } : { y: lift, rotate: tilt };

  return (
    <div ref={ref} aria-hidden className="relative overflow-hidden bg-cream-50">
      <svg
        viewBox="0 -60 1200 580"
        preserveAspectRatio="xMidYMax slice"
        className="block h-[48.3vw] max-h-[660px] min-h-[340px] w-full"
      >
        <defs>
          <linearGradient id="nl-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e8c69a" />
            <stop offset="0.5" stopColor="#c99a5f" />
            <stop offset="1" stopColor="#8f6430" />
          </linearGradient>

          {/* Sauce in the gaps between noodles. */}
          <linearGradient id="nl-sauce" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4b2d11" />
            <stop offset="1" stopColor="#1d1108" />
          </linearGradient>

          {/* The hand-off into the section below. Ends on the exact ink-950 of
              Fan Favorites, so there is no seam to see. */}
          <linearGradient id="nl-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#120a08" stopOpacity="0" />
            <stop offset="0.5" stopColor="#120a08" stopOpacity="0.55" />
            <stop offset="0.8" stopColor="#120a08" stopOpacity="0.93" />
            <stop offset="1" stopColor="#120a08" stopOpacity="1" />
          </linearGradient>

          {/* Coarse, uneven, sitting ON the sauce. Turbulence rather than
              drawn dots, so it never repeats and costs one filter instead of
              several hundred nodes. */}
          <filter id="nl-pepper" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.06  0 0 0 0 0.04  0 0 0 0 0.02  0 0 0 -1.7 0.64"
            />
          </filter>

          {/* Masks, so pepper lands on noodles and nowhere else. A clipPath
              could not do this: clipping ignores strokes, and every noodle
              here IS a stroke. */}
          <mask id="nl-mask-pull">
            {STRANDS.map((s, i) => (
              <path key={i} d={s.d} fill="none" stroke="#fff" strokeWidth={s.w} />
            ))}
          </mask>
          <mask id="nl-mask-mass">
            {MASS.map((m, i) => (
              <path key={i} d={m.d} fill="none" stroke="#fff" strokeWidth={m.w} />
            ))}
          </mask>
        </defs>

        {/* ---- the pull, behind the pan ---- */}
        <motion.g style={{ ...moving, transformOrigin: "610px 280px" }}>
          {STRANDS.map((s, i) => (
            <Noodle key={i} d={s.d} w={s.w} />
          ))}
          <g mask="url(#nl-mask-pull)">
            <rect x="440" y="0" width="360" height="920" filter="url(#nl-pepper)" opacity="0.9" />
          </g>

          {/* ---- the chopsticks ---- */}
          {/* Rigid, so this is the one part a photograph would improve: swap
              these shapes for a cut-out and nothing else changes. */}
          <g id="sticks" transform="rotate(-26 610 96)">
            <rect x="594" y="-420" width="22" height="516" rx="3" fill="url(#nl-wood)" />
            <rect x="594" y="-420" width="7" height="516" fill="#ffffff" opacity="0.24" />
            <path d="M594 96 h22 l-6 28 h-10 Z" fill="#8a5f2c" />

            <rect x="626" y="-428" width="22" height="514" rx="3" fill="url(#nl-wood)" />
            <rect x="626" y="-428" width="7" height="514" fill="#ffffff" opacity="0.24" />
            <path d="M626 86 h22 l-6 28 h-10 Z" fill="#8a5f2c" />
          </g>
        </motion.g>

        {/* ---- the pan, painted last so it covers the pull ---- */}
        <g>
          <path d={PAN_FILL} fill="url(#nl-sauce)" />
          {MASS.map((m, i) => (
            <Noodle key={i} d={m.d} w={m.w} />
          ))}
          <g mask="url(#nl-mask-mass)">
            <rect x="-40" y="270" width="1280" height="250" filter="url(#nl-pepper)" opacity="0.9" />
          </g>
        </g>

        {/* ---- into the dark, and into the next section ---- */}
        <rect x="-40" y="400" width="1280" height="120" fill="url(#nl-dusk)" />
      </svg>
    </div>
  );
}
