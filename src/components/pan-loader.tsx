/**
 * A pan actually firing up, instead of five hopping dots.
 *
 * The dots were a loading spinner wearing the shop's colours — they could have
 * belonged to any site. This is the one thing Pepper Pan does, drawn: a flame
 * leaping out of the pan, peppercorns tossing in it.
 *
 * The flames are drawn *before* the pan so the pan paints over their base.
 * That's what makes them read as coming out of the bowl rather than sitting in
 * front of it — the fire has no visible bottom, so the eye puts it inside.
 *
 * Inline SVG animated in CSS, for the same reasons as the rest of the artwork:
 * about a kilobyte, no network request, sharp at any size, and — since this is
 * the very first thing that paints — no JavaScript standing between the page
 * loading and the animation starting. The keyframes live in globals.css.
 *
 * Every moving part is `transform` or `opacity` only, which the browser can
 * animate without laying the page out again. That matters here more than
 * anywhere: this runs while the rest of the page is still being built.
 */
export function PanLoader({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="36 22 164 128"
      className={className}
      role="img"
      aria-label="Firing up the pan"
    >
      {/* ---- the fire, leaping out of the pan ---------------------------- */}
      {/* Three tongues and a hot core. A fire is never one colour and never
          one shape, so each one flickers on its own clock. */}
      <g className="pan-fire">
        <path
          className="pan-flame pan-flame--1"
          d="M78 120C64 106 64 86 80 58c-1 18 8 22 12 10 6 18 4 40-14 52Z"
          fill="#c1121f"
        />
        <path
          className="pan-flame pan-flame--3"
          d="M122 120c16-14 16-34 0-62 1 18-8 22-12 10-6 18-4 40 12 52Z"
          fill="#c1121f"
        />
        <path
          className="pan-flame pan-flame--2"
          d="M100 122C74 102 72 74 96 34c-3 26 10 32 16 16 14 24 16 54-12 72Z"
          fill="#e85d04"
        />
        <path
          className="pan-flame pan-flame--core"
          d="M100 120C86 108 86 92 98 70c-1 14 7 18 10 8 8 16 6 30-8 42Z"
          fill="#f2b705"
        />
      </g>

      {/* ---- peppercorns, thrown up by the toss --------------------------- */}
      {/* Gold, the shop's own — and solid rather than ringed, because a dark
          dot inside a light ring reads as an eye, which is not the note. */}
      <g fill="#f2b705">
        <circle className="pan-toss pan-toss--1" cx="82" cy="100" r="4.5" />
        <circle className="pan-toss pan-toss--2" cx="100" cy="100" r="5.5" />
        <circle className="pan-toss pan-toss--3" cx="117" cy="100" r="4" />
      </g>

      {/* ---- the pan ------------------------------------------------------ */}
      <g className="pan-body">
        {/* The bowl, seen from the side, filled — an outline alone reads as a
            strainer. */}
        <path
          d="M50 104h100c-2 24-22 36-50 36s-48-12-50-36Z"
          fill="#241a16"
          stroke="#fdf1dc"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        {/* A little light caught along the inside of the near wall, which is
            the difference between a shape and a piece of metal. */}
        <path
          d="M63 116c2 9 8 15 17 18"
          fill="none"
          stroke="#fdf1dc"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.35"
        />
        {/* The rim, wider than the bowl, the way a real one sits. */}
        <path
          d="M44 104h112"
          stroke="#fdf1dc"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Handle, rising away from the heat. */}
        <path
          d="M154 106c18 3 30 11 38 23"
          fill="none"
          stroke="#fdf1dc"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
