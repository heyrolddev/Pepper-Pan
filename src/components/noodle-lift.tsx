"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

import { usePrefersReducedMotion } from "@/lib/reduced-motion";

/**
 * Chopsticks lifting a clump of flat, ruffle-edged noodles, as the page
 * scrolls.
 *
 * WHY THE NOODLES ARE FILLED SHAPES AND NOT STROKES
 *
 * These noodles have frilly edges — the ruffle down each side is most of what
 * makes them read as this dish rather than as ribbons. A stroke cannot do
 * that. A stroke has two perfectly parallel edges, always, and no amount of
 * shading fixes it.
 *
 * So each noodle is generated: a centreline is sampled, a normal is taken at
 * every sample, and the two sides are pushed out by a half-width that waves
 * along the length — a different wave on each side, or the two edges mirror
 * each other and the frill looks stamped. The result is one filled path with
 * a genuinely wavy outline.
 *
 * All of that runs ONCE, at module load, and bakes to constant path strings.
 * Nothing is generated per render and nothing per frame. What moves is a
 * single transform on the group holding them.
 *
 * HOW THE LIFT IS FAKED
 *
 * The noodles are drawn once at full length in a group that only translates,
 * and the pan is painted over the top of them, so the part still below the
 * surface is covered rather than cut. As the group rises, more of each noodle
 * clears the pan it was buried in. Translation plus an opaque foreground reads
 * as stretching, and costs one compositor transform.
 *
 * Painting the pan last is what makes this work. A clip would leave every
 * noodle with a flat sliced end floating in the gap above the pan; noodles
 * covering noodles is what a real pull looks like.
 *
 * WHY THE PULL IS ONE CLUMP
 *
 * A chopstick pinch lifts noodles that are stuck to each other in sauce — they
 * come up as one mass, not as separate strands hanging in a fan. Spread apart
 * they look like a whisk. The earlier problem with keeping them together was
 * that overlapping strokes painted over each other's shading and merged into a
 * white slab; ruffled edges and a dark contour on each noodle solve that, so
 * they can now sit tight against one another and still be legible.
 *
 * WHY THERE IS NO LINE BETWEEN THIS AND THE SECTION BELOW
 *
 * The band starts on the cream the section above ends on, and finishes on
 * exactly the ink-950 Fan favorites starts on — #120a08, the same value, not a
 * near miss. The dusk gradient over the bottom of the pan carries one into the
 * other, so the last thing anybody can see of the boundary is noodles going
 * dark. The noodles are the divider.
 *
 * WHAT COULD BE PHOTOGRAPHED
 *
 * Rigid things can be photographs; things that change shape have to be drawn.
 * Neither the chopsticks nor the hand changes shape during the lift — both
 * only ride up — so a cut-out of a real hand holding a real pair would drop
 * straight in where the hand is drawn. The noodles cannot, for the reason
 * above.
 *
 * GEOMETRY, so the numbers are not magic
 *   viewBox        0 -160 1200 640 — the frame starts 160 above the origin.
 *                  That headroom is what the hand costs: it grips 150 units
 *                  above the chopstick tips, and at full lift that is well
 *                  above where the old frame ended
 *   pan surface    y ~= 260 on screen; the pan is drawn at 300 and shifted up
 *                  40, which pays for part of the headroom
 *   noodles drawn  y = 74 (gripped) down to y = 900 (deep in the pan)
 *   lift travel    y +240 (buried) to y -40 (fully lifted)
 */

type Pt = readonly [number, number];

/** Roughly one sample every 5 units, so the frill never runs short of points. */
const STEP = 5;

/**
 * Catmull-Rom through the anchors, sampled to a polyline at even spacing.
 * Even spacing is the point: sample by segment index instead and a long
 * segment gets the same handful of points as a short one, which is how a
 * ruffle turns into a zigzag.
 */
function sample(pts: readonly Pt[]): Pt[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let s = 0; s < p.length - 3; s++) {
    const [a, b, c, d] = [p[s], p[s + 1], p[s + 2], p[s + 3]];
    const per = Math.max(8, Math.round(Math.hypot(c[0] - b[0], c[1] - b[1]) / STEP));
    for (let i = 0; i < per; i++) {
      const t = i / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * b[0] +
            (-a[0] + c[0]) * t +
            (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 +
            (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3),
        0.5 *
          (2 * b[1] +
            (-a[1] + c[1]) * t +
            (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 +
            (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * The same Catmull-Rom curve, but as cubic segments rather than samples.
 * Identical shape, a fraction of the characters — which is what the interior
 * shading and the pan silhouette want, since neither has a visible outline.
 */
function curve(pts: readonly Pt[]): string {
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let s = 0; s < p.length - 3; s++) {
    const [a, b, c, e] = [p[s], p[s + 1], p[s + 2], p[s + 3]];
    d +=
      ` C${(b[0] + (c[0] - a[0]) / 6).toFixed(1)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(1)}` +
      ` ${(c[0] - (e[0] - b[0]) / 6).toFixed(1)} ${(c[1] - (e[1] - b[1]) / 6).toFixed(1)}` +
      ` ${c[0]} ${c[1]}`;
  }
  return d;
}

/**
 * A flat noodle with ruffled edges, as one closed filled path.
 *
 * The frill is a wave in the half-width, measured against distance travelled
 * rather than against the 0..1 parameter — so a long noodle gets more ruffles
 * than a short one instead of the same number stretched out. Each side gets
 * its own frequency and phase, because two edges waving in step read as a
 * pattern, and a noodle is not a pattern.
 *
 * Coordinates round to whole units. At this scale a unit is about a pixel, the
 * half-pixel it costs is invisible on a wavy edge, and it takes a third off
 * the size of every path — and these paths ship in the HTML.
 */
function ribbon(pts: readonly Pt[], w: number, seed: number, frill = 0.22): string {
  const s = sample(pts);
  const half = w / 2;
  const left: string[] = [];
  const right: string[] = [];
  let dist = 0;

  for (let i = 0; i < s.length; i++) {
    if (i > 0) dist += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;

    // Taper the frill away at the very ends, so a noodle disappearing into the
    // pan does not finish on a frozen crest.
    const u = i / (s.length - 1);
    const ease = Math.min(1, Math.min(u, 1 - u) * 8);

    const hl = half * (1 + frill * ease * Math.sin(dist / 11 + seed));
    const hr = half * (1 + frill * ease * Math.sin(dist / 13 + seed * 1.7 + 2.1));
    left.push(`${Math.round(s[i][0] + nx * hl)} ${Math.round(s[i][1] + ny * hl)}`);
    right.push(`${Math.round(s[i][0] - nx * hr)} ${Math.round(s[i][1] - ny * hr)}`);
  }

  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

type Spec = { pts: readonly Pt[]; w: number; seed: number; tone?: string };

/**
 * The pull: one clump, hanging close. The anchors barely diverge, because
 * noodles stuck together in sauce come up stuck together.
 */
const PULL: Spec[] = [
  // Three noodles and a curl. Six was a crowd: at this scale a wide bundle
  // converging on a 44-unit pinch can only ever draw a cone, and the middle of
  // it turns to mush because every noodle covers the one behind it. Three hang
  // as a narrow column, each one legible, touching but not stacked — which is
  // both simpler to read and closer to what a chopstick pinch actually holds.
  { pts: [[592, 76], [582, 150], [570, 230], [562, 320], [556, 450], [550, 590], [546, 740], [552, 900]], w: 52, seed: 1.1, tone: "#ece0c0" },
  { pts: [[628, 78], [638, 152], [650, 232], [656, 322], [662, 452], [666, 592], [670, 742], [664, 900]], w: 50, seed: 5.5, tone: "#efe3c6" },
  { pts: [[610, 74], [608, 150], [606, 230], [606, 320], [606, 450], [604, 590], [604, 740], [606, 900]], w: 46, seed: 2.6, tone: "#f7eed8" },
  // One curl, hooking back on itself at the front. A noodle that turns over is
  // the detail that most says "noodles" rather than "lines".
  { pts: [[612, 84], [596, 150], [574, 224], [580, 292], [614, 320], [648, 296], [656, 246], [640, 208]], w: 40, seed: 3.2, tone: "#fdf4e0" },
];

/** The pan, painted over the pull. */
const PAN: Spec[] = [
  { pts: [[-60, 306], [120, 286], [300, 318], [480, 296], [660, 320], [840, 292], [1020, 316], [1260, 300]], w: 46, seed: 0.7 },
  { pts: [[-60, 330], [140, 352], [320, 322], [500, 346], [680, 320], [860, 348], [1040, 324], [1260, 340]], w: 42, seed: 2.2 },
  { pts: [[-60, 368], [130, 346], [310, 382], [490, 354], [670, 384], [850, 352], [1030, 380], [1260, 362]], w: 48, seed: 3.9 },
  { pts: [[-60, 394], [150, 416], [330, 386], [510, 412], [690, 384], [870, 414], [1050, 388], [1260, 400]], w: 42, seed: 5.1 },
  { pts: [[-60, 432], [120, 408], [300, 444], [480, 414], [660, 446], [840, 412], [1020, 442], [1260, 428]], w: 50, seed: 1.5 },
  { pts: [[-60, 458], [160, 480], [340, 450], [520, 478], [700, 448], [880, 478], [1060, 452], [1260, 464]], w: 44, seed: 4.6 },
  { pts: [[-60, 494], [140, 470], [320, 506], [500, 476], [680, 508], [860, 474], [1040, 504], [1260, 490]], w: 48, seed: 6.0 },
];

/**
 * Baked once, at module load.
 *
 * Only the outline is generated. The sauce and the gloss are plain strokes
 * along the compact centreline, clipped to the outline — inside a noodle
 * nobody can see that an edge is straight, and generating three ruffled
 * shapes per noodle would triple the path data for nothing.
 */
function bake(list: Spec[], tag: string) {
  return list.map((n, i) => ({
    id: `nl-${tag}-${i}`,
    w: n.w,
    tone: n.tone ?? "#f0e2c6",
    body: ribbon(n.pts, n.w, n.seed),
    spine: curve(n.pts),
  }));
}

const PULL_ART = bake(PULL, "p");
const PAN_ART = bake(PAN, "b");
const ALL_ART = [...PULL_ART, ...PAN_ART];
const PAN_FILL = `${curve(PAN[0].pts)} L1260 620 L-60 620 Z`;

function Noodle({ art }: { art: (typeof ALL_ART)[number] }) {
  const o = (n: number) => (art.w * n).toFixed(1);
  return (
    <>
      <use
        href={`#${art.id}`}
        fill={art.tone}
        stroke="#2b1b10"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <g clipPath={`url(#clip-${art.id})`}>
        {/* Sauce, pooled below the fold where gravity puts it. */}
        <path
          d={art.spine}
          fill="none"
          stroke="#3d2410"
          strokeOpacity={0.45}
          strokeWidth={art.w * 0.5}
          transform={`translate(${o(0.17)} ${o(0.36)})`}
        />
        {/* The wet top face, which is what makes it look cooked. */}
        <path
          d={art.spine}
          fill="none"
          stroke="#fffcf0"
          strokeOpacity={0.85}
          strokeWidth={art.w * 0.46}
          transform={`translate(-${o(0.15)} -${o(0.2)})`}
        />
      </g>
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
  // see it, and a band this size is only fully on screen from about a third of
  // the way through. Spending the travel over the full range leaves the pull
  // half-buried at the one moment it is best framed. Ending at 0.5 puts the
  // noodles at full extension exactly when the band is centred, and Motion
  // clamps after that, so they stay lifted on the way out.
  const lift = useTransform(scrollYProgress, [0.15, 0.5], [240, -40]);
  // A little rotation, because a hand lifting noodles turns the wrist.
  const tilt = useTransform(scrollYProgress, [0.15, 0.5], [-4, 4]);

  const moving = still ? { y: 60, rotate: 0 } : { y: lift, rotate: tilt };

  return (
    <div ref={ref} aria-hidden className="relative overflow-hidden bg-cream-50">
      <svg
        viewBox="0 -210 1200 690"
        preserveAspectRatio="xMidYMax slice"
        className="block h-[57.5vw] max-h-[800px] min-h-[400px] w-full"
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

          {/* The forearm has to end somewhere. Level, it crossed 660 units of
              band before reaching the edge — at the hand's own scale that is
              most of a whole arm, and it read as a log. Angled up, only about
              240 units of it are ever on screen, which is a forearm. It leaves
              through the top, so it fades into the cream there rather than
              being cut flat across. The mirror of the dusk below. */}
          <linearGradient id="nl-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffaf2" stopOpacity="1" />
            <stop offset="0.5" stopColor="#fffaf2" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fffaf2" stopOpacity="0" />
          </linearGradient>

          {/* The hand-off into the section below. Ends on the exact ink-950 of
              Fan favorites, so there is no seam to see. */}
          <linearGradient id="nl-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#120a08" stopOpacity="0" />
            <stop offset="0.5" stopColor="#120a08" stopOpacity="0.55" />
            <stop offset="0.8" stopColor="#120a08" stopOpacity="0.93" />
            <stop offset="1" stopColor="#120a08" stopOpacity="1" />
          </linearGradient>

          {/* Coarse, uneven, sitting ON the sauce. Turbulence rather than drawn
              dots, so it never repeats and costs one filter instead of several
              hundred nodes. */}
          <filter id="nl-pepper" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.06  0 0 0 0 0.04  0 0 0 0 0.02  0 0 0 -1.7 0.64"
            />
          </filter>

          {/* Every outline, defined once. Each is referenced three times — to
              draw it, to clip its shading, and to mask its pepper — and these
              strings are the largest thing on the page. */}
          {ALL_ART.map((a) => (
            <path key={a.id} id={a.id} d={a.body} />
          ))}
          {ALL_ART.map((a) => (
            <clipPath key={a.id} id={`clip-${a.id}`}>
              <use href={`#${a.id}`} />
            </clipPath>
          ))}

          {/* Masks, so pepper lands on noodles and nowhere else. */}
          <mask id="nl-mask-pull">
            {PULL_ART.map((a) => (
              <use key={a.id} href={`#${a.id}`} fill="#fff" />
            ))}
          </mask>
          <mask id="nl-mask-pan">
            {PAN_ART.map((a) => (
              <use key={a.id} href={`#${a.id}`} fill="#fff" />
            ))}
          </mask>
        </defs>

        {/* ---- the forearm, behind the haze ---- */}
        {/*
          The grip is the real one: the hand is level, the chopsticks hang
          vertically through it, the fingers curl down behind them and the
          thumb presses from the front. The forearm angles up from a bent
          wrist, which is both what a hand reaching into a pan does and what
          keeps the visible stretch of arm down to a forearm's worth.

          The fade is why the arm is its own motion group: it belongs to the
          band, not to the arm, so inside the moving group it would travel
          with the thing it is meant to fade. Painted between the two groups,
          it catches the arm on its way out of the top and leaves the hand —
          drawn after it — crisp.
        */}
        <motion.g style={{ ...moving, transformOrigin: "610px 280px" }}>
          <path
            d="M476 -138 L-92 -466 L-145 -374 L423 -46 Z"
            fill="#e0aa7e"
            stroke="#2b1b10"
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <path d="M476 -138 L-92 -466 L-118 -420 L450 -92 Z" fill="#f7d6b4" opacity="0.5" />
        </motion.g>

        <rect x="-60" y="-210" width="1320" height="60" fill="url(#nl-haze)" />

        {/* ---- the pull, the chopsticks, and the hand ---- */}
        {/*
          Painting order is the pose: hand, then the far stick, then the
          fingers, then the near stick, then the thumb. The sticks straddle the
          index finger that way, which is where they actually sit.

          A hand can be a photograph — it does not change shape during the
          lift, it only rides up with the chopsticks — so a cut-out would drop
          straight in here. Drawn, it is built like the noodles: flat fill, one
          dark contour, one highlight.
        */}
        <motion.g style={{ ...moving, transformOrigin: "610px 280px" }}>
          {PULL_ART.map((a, i) => (
            <Noodle key={i} art={a} />
          ))}
          <g mask="url(#nl-mask-pull)">
            <rect x="490" y="0" width="230" height="920" filter="url(#nl-pepper)" opacity="0.9" />
          </g>

          {/* the back of the hand — its left edge runs along the wrist, so it
              meets the forearm flush and the contour there reads as a crease */}
          <path
            d="M486 -148 C 528 -156, 578 -144, 606 -116 C 626 -96, 630 -62, 618 -44
               C 606 -28, 566 -22, 530 -26 L406 -40 Z"
            fill="#e8b489"
            stroke="#2b1b10"
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <path d="M486 -148 C 528 -156, 578 -144, 606 -116 L 556 -106 L 462 -118 Z" fill="#f7d6b4" opacity="0.55" />

          {/* the far chopstick */}
          <rect x="594" y="-300" width="12" height="396" rx="3" fill="#1b2233" />
          <rect x="594" y="-300" width="4" height="396" fill="#4d5a76" opacity="0.7" />
          <path d="M594 96 h12 l-4 26 h-4 Z" fill="#1b2233" />

          {/* Four fingers curling down behind the sticks. One shape with
              scalloped tips and creases cut into it — separately outlined bars
              read as sausages — and the middle finger is the longest. */}
          <path
            d="M470 -46 L612 -52
               L612 4 Q612 36 592 36 Q572 36 572 4
               L568 6 Q568 48 551 48 Q534 48 534 6
               L530 8 Q530 38 515 38 Q500 38 500 8
               L496 10 Q496 32 483 32 Q470 32 470 10 Z"
            fill="#efc39c"
            stroke="#2b1b10"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <g stroke="#2b1b10" strokeWidth={1.8} strokeOpacity={0.5} fill="none">
            <path d="M572 4 L570 -50" />
            <path d="M534 6 L532 -48" />
            <path d="M500 8 L498 -46" />
          </g>

          {/* the near chopstick */}
          <rect x="620" y="-306" width="12" height="394" rx="3" fill="#1b2233" />
          <rect x="620" y="-306" width="4" height="394" fill="#4d5a76" opacity="0.7" />
          <path d="M620 88 h12 l-4 26 h-4 Z" fill="#1b2233" />

          {/* The thumb, in front of both sticks — that is the half of a
              chopstick grip people actually read. */}
          <path
            d="M602 -100 C 624 -94, 636 -68, 634 -38 C 632 -12, 622 8, 606 10
               C 592 12, 584 -2, 584 -22 C 584 -50, 590 -82, 602 -100 Z"
            fill="#f5cfa9"
            stroke="#2b1b10"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path
            d="M604 -30 C 618 -32, 626 -22, 624 -10 C 622 0, 612 5, 604 2
               C 598 -2, 598 -28, 604 -30 Z"
            fill="#fae3c8"
            stroke="#2b1b10"
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        </motion.g>

        {/* ---- the pan, painted last so it covers the pull ---- */}
        {/* Shifted up 40 to pay for some of the headroom the hand needed, so
            the band grew by 100 units rather than 140. */}
        <g transform="translate(0 -40)">
          <path d={PAN_FILL} fill="url(#nl-sauce)" />
          {PAN_ART.map((a, i) => (
            <Noodle key={i} art={a} />
          ))}
          <g mask="url(#nl-mask-pan)">
            <rect x="-60" y="270" width="1320" height="260" filter="url(#nl-pepper)" opacity="0.9" />
          </g>
        </g>

        {/* ---- into the dark, and into the next section ---- */}
        <rect x="-60" y="360" width="1320" height="120" fill="url(#nl-dusk)" />
      </svg>
    </div>
  );
}
