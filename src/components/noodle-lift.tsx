"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/reduced-motion";

/**
 * Chopsticks lifting a pull of black-pepper noodles, as the page scrolls.
 *
 * HOW THE STRETCH IS FAKED, AND WHY IT IS FAKED THAT WAY
 *
 * Noodles being lifted is a shape that changes — which is exactly the thing a
 * photograph cannot do and a path can. But recomputing a dozen path strings on
 * every scroll frame means running JavaScript between every frame the browser
 * paints, and on a mid-range Android that is where smooth becomes sticky.
 *
 * So nothing is recomputed. The strands are drawn once, at full length, in a
 * group that simply translates upward — and the mass in the pan is painted
 * over the top of them, so the part still below the surface is covered rather
 * than cut. As the group rises, more of each strand clears the noodles it was
 * buried in. Translation plus an opaque foreground reads as stretching, and
 * costs one compositor transform.
 *
 * Painting the mass last is what makes this work. A clip would leave every
 * strand with a flat sliced end floating in the gap above the pan; noodles
 * covering noodles is what a real pull looks like.
 *
 * WHY THE PEPPER IS MASKED
 *
 * The speckle is one turbulence filter over a rectangle — cheap, never
 * repeats. But a rectangle of speckle also lands on the background, where it
 * reads as a dirty smudge across the cream. So each speckle rectangle is
 * masked by the very strokes it is meant to season, and the pepper stays on
 * the noodles.
 *
 * WHAT IS DRAWN AND WHAT COULD BE PHOTOGRAPHED
 *
 * Rigid things can be photographs; things that change shape have to be drawn.
 * Chopsticks never bend, so a cut-out of a real pair would drop straight into
 * <g id="sticks"> and raise the realism a long way. The noodles cannot be a
 * photograph, so they are built the way a flat noodle actually reads: a wide
 * band, a dark glaze over the whole face, sauce pooled along the underside,
 * and one wet highlight down the lit edge.
 *
 * GEOMETRY, so the numbers are not magic
 *   viewBox        1200 x 380
 *   pan surface    y ~= 230 on screen. The pan is drawn around y 306 and the
 *                  whole group is shifted up 76, so one number moves the
 *                  waterline without re-deriving seven wave paths.
 *   strands drawn  y = 60 (gripped) down to y = 760 (deep in the pan)
 *   lift travel    y +170 (barely pulled) to y -30 (fully lifted)
 * At full lift the deepest strand end sits at 720, far below the frame, so the
 * pull never detaches from the noodles it came out of. At rest the chopsticks
 * sit below the surface, buried in the pan, and rise out of it.
 */

/**
 * The pull. Real lifted noodles fan out fast just below the grip and hang
 * unevenly — parallel strands read as a bundle of straws, not as food. One
 * strand is a draped loop, which is the single detail that most says
 * "noodles" rather than "lines".
 */
const STRANDS = [
  { d: "M584 74 C 578 130, 566 182, 562 242 S 552 400, 540 560 S 520 700, 534 790", w: 32, o: 1 },
  { d: "M642 70 C 650 128, 664 180, 668 240 S 676 398, 688 558 S 706 700, 692 790", w: 26, o: 1 },
  { d: "M600 80 C 594 136, 582 190, 578 250 S 570 404, 560 564 S 542 702, 554 790", w: 36, o: 1 },
  { d: "M628 76 C 636 132, 648 184, 650 244 S 656 402, 666 562 S 682 702, 670 790", w: 22, o: 1 },
  { d: "M614 68 C 616 126, 612 178, 611 240 S 610 398, 609 558 S 608 700, 611 790", w: 28, o: 1 },
  // The drape: down, round, and back up, both ends under the chopsticks. It is
  // the single detail that most says "noodles" rather than "lines".
  { d: "M594 78 C 570 134, 544 200, 552 262 C 560 320, 636 322, 642 258 C 648 202, 622 146, 620 96", w: 24, o: 1 },
];

/**
 * The pan, painted over the pull. The silhouette is filled first so no cream
 * can show between bands or below the last one — a gap there turns a pan of
 * noodles back into seven drawn lines.
 */
const PAN_FILL =
  "M-40 306 C 160 274, 330 338, 510 306 S 840 274, 1020 306 S 1180 338, 1260 306 L1260 480 L-40 480 Z";

const MASS = [
  { d: "M-40 306 C 160 274, 330 338, 510 306 S 840 274, 1020 306 S 1180 338, 1260 306", w: 32 },
  { d: "M-40 332 C 100 366, 280 300, 460 336 S 790 372, 980 332 S 1170 300, 1260 336", w: 30 },
  { d: "M-40 356 C 180 322, 360 392, 540 356 S 860 322, 1040 356 S 1190 390, 1260 356", w: 34 },
  { d: "M-40 382 C 120 416, 300 350, 480 386 S 810 420, 1000 382 S 1180 350, 1260 386", w: 30 },
  { d: "M-40 408 C 200 374, 380 442, 560 408 S 880 374, 1060 408 S 1200 442, 1260 408", w: 36 },
  { d: "M-40 434 C 140 468, 320 402, 500 438 S 830 472, 1020 434 S 1190 402, 1260 438", w: 32 },
  { d: "M-40 460 C 170 426, 350 494, 530 460 S 850 426, 1030 460 S 1200 492, 1260 460", w: 34 },
];

/** One noodle: pasta, sauce glaze, pooled underside, wet edge. */
function Noodle({ d, w }: { d: string; w: number }) {
  return (
    <>
      {/* The contour. Gold on cream has almost no edge of its own; without a
          dark rim the noodles dissolve into the background instead of sitting
          in front of it. */}
      <path d={d} fill="none" stroke="#26160a" strokeOpacity={0.9} strokeWidth={w + 5} />
      <path d={d} fill="none" stroke="url(#nl-noodle)" strokeWidth={w} />
      {/* The glaze — black pepper sauce coats the whole face, it does not sit
          in a stripe. Without this the noodles read as plain yellow pasta. */}
      <path d={d} fill="none" stroke="#4a2c10" strokeOpacity={0.32} strokeWidth={w} />
      {/* Sauce pooled along the underside, where gravity puts it. */}
      <path
        d={d}
        fill="none"
        stroke="#241407"
        strokeOpacity={0.55}
        strokeWidth={w * 0.34}
        transform={`translate(${(w * 0.1).toFixed(1)} ${(w * 0.24).toFixed(1)})`}
      />
      {/* One wet line is what makes a drawn noodle look coated rather than
          coloured in. */}
      <path
        d={d}
        fill="none"
        stroke="#fff0c0"
        strokeOpacity={0.5}
        strokeWidth={w * 0.15}
        transform={`translate(-${(w * 0.12).toFixed(1)} -${(w * 0.16).toFixed(1)})`}
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
  // see it, and a band this size is only fully on screen from about 0.32 to
  // 0.68. Spending the travel over the full range means the pull is still
  // half-buried at the one moment it is best framed. Ending at 0.5 puts the
  // noodles at full extension exactly when the band is centred, and Motion
  // clamps after that, so they stay lifted on the way out.
  const lift = useTransform(scrollYProgress, [0.15, 0.5], [170, -30]);
  // A little rotation, because a hand lifting noodles turns the wrist.
  const tilt = useTransform(scrollYProgress, [0.15, 0.5], [-5, 5]);

  const moving = still ? { y: 30, rotate: 0 } : { y: lift, rotate: tilt };

  return (
    <div ref={ref} aria-hidden className="relative overflow-hidden bg-cream-50">
      <svg
        viewBox="0 0 1200 380"
        preserveAspectRatio="xMidYMax slice"
        className="block h-[30vw] max-h-[400px] min-h-[260px] w-full"
      >
        <defs>
          <linearGradient id="nl-noodle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd76b" />
            <stop offset="0.45" stopColor="#e0a02a" />
            <stop offset="1" stopColor="#94620f" />
          </linearGradient>

          <linearGradient id="nl-sauce" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4b2d11" />
            <stop offset="1" stopColor="#241407" />
          </linearGradient>

          <linearGradient id="nl-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e8c69a" />
            <stop offset="0.5" stopColor="#c99a5f" />
            <stop offset="1" stopColor="#8f6430" />
          </linearGradient>

          {/* Coarse, uneven, sitting ON the sauce. Turbulence rather than
              drawn dots, so it never repeats and costs one filter instead of
              several hundred nodes. */}
          <filter id="nl-pepper" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.07  0 0 0 0 0.05  0 0 0 0 0.03  0 0 0 -1.7 0.66"
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
        <motion.g style={{ ...moving, transformOrigin: "606px 260px" }}>
          {STRANDS.map((s, i) => (
            <g key={i} opacity={s.o}>
              <Noodle d={s.d} w={s.w} />
            </g>
          ))}
          <g mask="url(#nl-mask-pull)">
            <rect x="440" y="0" width="400" height="800" filter="url(#nl-pepper)" opacity="0.85" />
          </g>

          {/* ---- the chopsticks ---- */}
          {/* Rigid, so this is the one part a photograph would improve: swap
              these shapes for a cut-out and nothing else changes. */}
          <g id="sticks" transform="rotate(-26 606 96)">
            <rect x="590" y="-420" width="22" height="516" rx="3" fill="url(#nl-wood)" />
            <rect x="590" y="-420" width="7" height="516" fill="#ffffff" opacity="0.24" />
            <path d="M590 96 h22 l-6 28 h-10 Z" fill="#8a5f2c" />

            <rect x="622" y="-428" width="22" height="514" rx="3" fill="url(#nl-wood)" />
            <rect x="622" y="-428" width="7" height="514" fill="#ffffff" opacity="0.24" />
            <path d="M622 86 h22 l-6 28 h-10 Z" fill="#8a5f2c" />
          </g>
        </motion.g>

        {/* ---- the mass in the pan, painted last so it covers the pull ---- */}
        <g transform="translate(0 -76)">
          <path d={PAN_FILL} fill="url(#nl-sauce)" />
          {MASS.map((m, i) => (
            <g key={i}>
              <Noodle d={m.d} w={m.w} />
            </g>
          ))}
          <g mask="url(#nl-mask-mass)">
            <rect x="-40" y="280" width="1280" height="215" filter="url(#nl-pepper)" opacity="0.85" />
          </g>
        </g>
      </svg>
    </div>
  );
}
