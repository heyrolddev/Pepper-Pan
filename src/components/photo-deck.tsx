"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type PanInfo,
} from "motion/react";

import { usePrefersReducedMotion } from "@/lib/reduced-motion";
import type { StoryPhoto } from "@/lib/story-photos";

/**
 * A handful of photographs, dealt like cards.
 *
 * This grew out of TiltPhoto, which showed exactly one snapshot of the stall
 * laid down slightly crooked with a hard black edge and a red shadow you could
 * slide a finger under. The framing was right; the limit of one was the
 * problem, and a grid of four would have thrown the framing away — four small
 * photographs in a row is a contact sheet, not a picture of a place.
 *
 * So: a stack. The one you are looking at is whole, the rest are corners
 * showing behind it, and you push the top one away to get to the next. Which
 * is the interaction everyone already has in their hands, and it needs no
 * label to explain it.
 *
 * ── Three ways in, because swiping is not one of them for everybody ───────
 *
 *   DRAG   the top card sideways. This is the real one, and it is what a
 *          phone does. Released short of the threshold it springs back, so a
 *          half-hearted push is not a decision.
 *   TAP    the top card. A mouse can drag, but nobody expects to have to.
 *   DOTS   underneath, which are real buttons. Drag reaches no keyboard and
 *          no screen reader, and a deck whose later photographs can only be
 *          seen by someone holding a pointing device is a deck that hides
 *          most of itself from some of its audience.
 *
 * ── What happens to the card you push away ───────────────────────────────
 *
 * It goes to the bottom, so the deck never runs out and there is no dead
 * "end" to hit. The card that is leaving is rendered SEPARATELY from the
 * stack, from wherever your finger let go of it, while the deck underneath
 * has already closed up. Without that split the leaving card would still be
 * in the deck at the back, and motion would animate it sliding back across
 * the page to get there — a photograph flying off to the right and then
 * crawling home again.
 *
 * ── What is kept from the single-photo version ───────────────────────────
 *
 * The scroll settle: the whole deck comes in tilted and straightens as it
 * reaches the middle of the screen, with the red plate sliding in behind it —
 * a photograph being put down on a table. It is on the WRAPPER now, so every
 * card in the stack settles together as one object; the per-card angles are
 * added on top of it.
 *
 * Reduced motion turns the settle and the fan off and leaves a still,
 * square photograph you can still page through with the dots. The framing
 * stays, because the framing is not motion.
 */

/**
 * When a push counts as a decision.
 *
 * Distance alone makes a flick — short, fast, and unmistakably deliberate —
 * spring back, which feels like the card ignored you. Velocity alone reads
 * the twitch in a tap as a swipe, because a thumb landing on glass moves a
 * few pixels in a few milliseconds and that is a very high speed.
 *
 * So: distance and speed together, with a floor under the distance that no
 * amount of speed can lift. Below the floor it was a tap, whatever the
 * accelerometer thought.
 */
const SWIPE_FLOOR = 28;
const SWIPE_POWER = 110;
const VELOCITY_WEIGHT = 0.12;

/**
 * How the cards behind sit.
 *
 * Rotated in opposite directions so the corners show on BOTH sides — a stack
 * fanned one way reads as one photo with a drop shadow — and nudged DOWN
 * rather than sideways, because sideways is where the paragraph is.
 *
 * The scale is nearly 1 on purpose, and the first attempt got this wrong.
 * Shrinking a card pulls its corners INWARD by roughly the same distance the
 * rotation pushes them OUT, so 0.965 and 3.5° cancelled almost exactly: the
 * deck rendered, the cards were all there in the DOM at the right angles, and
 * on screen it was one photograph with a seven-pixel sliver under it. Nothing
 * failed. It just did not look like a stack, which was the entire point.
 */
/** The lean a card takes on as it is pushed. Mirrored by the leaving card. */
const tiltFor = (x: number) => Math.max(-12, Math.min(12, (x / 220) * 12));

const BEHIND = [
  { y: 0, rotate: 0, scale: 1 },
  { y: 8, rotate: 5.5, scale: 0.99 },
  { y: 16, rotate: -4.5, scale: 0.975 },
];

export function PhotoDeck({
  photos,
  className = "",
}: {
  photos: StoryPhoto[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = usePrefersReducedMotion();

  /**
   * Front first. Rotated rather than indexed, so "the top card" is always
   * `order[0]` and the deck has no notion of a beginning or an end to fall
   * off — which is what makes wrapping free instead of an edge case.
   */
  const [order, setOrder] = useState(() => photos.map((_, i) => i));
  const [leaving, setLeaving] = useState<{ photo: number; dir: 1 | -1; from: number } | null>(
    null
  );
  const dragged = useRef(false);

  // One photograph is not a deck. Drag, dots and a fanned stack over a single
  // picture are controls that do nothing, which reads worse than no controls.
  const many = photos.length > 1;

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
  // The plate travels diagonally, which is what a shadow does.
  const plateX = useTransform(settle, [0, 1], [34, 14]);
  const plateY = useTransform(settle, [0, 1], [40, 14]);

  function deal(dir: 1 | -1, from = 0) {
    if (!many || leaving) return;
    setLeaving({ photo: order[0], dir, from });
  }

  function settleDeal() {
    setOrder((o) => [...o.slice(1), o[0]]);
    setLeaving(null);
  }

  /** Bring one photograph to the front without dealing through the others. */
  function show(photo: number) {
    if (leaving) return;
    setOrder((o) => {
      const at = o.indexOf(photo);
      return at <= 0 ? o : [...o.slice(at), ...o.slice(0, at)];
    });
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const moved = Math.abs(info.offset.x);
    const power = moved + Math.abs(info.velocity.x) * VELOCITY_WEIGHT;
    if (moved > SWIPE_FLOOR && power > SWIPE_POWER) {
      deal(info.offset.x < 0 ? -1 : 1, info.offset.x);
    }
    // Cleared on the next frame, not here: the click that follows a drag
    // fires after this, and clearing it now would deal a second card.
    requestAnimationFrame(() => {
      dragged.current = false;
    });
  }

  // While a card is on its way out the deck has already closed up, so the
  // next photograph is at the front and can be dragged straight away.
  const stack = leaving ? order.slice(1) : order;

  return (
    <div className={className}>
      <motion.div
        ref={ref}
        style={still ? undefined : { rotate, y: lift }}
        className="relative aspect-square w-full"
      >
        {/* The shadow, as an object rather than a blur: the same shape as the
            photograph and the same red the rest of the page is built from, so
            the gap between the two reads as depth instead of as a glow. */}
        <motion.div
          aria-hidden
          // Numbers, not a `transform` string: motion writes `transform`
          // itself on every element it owns, so a hand-rolled one is
          // overwritten and the plate sits exactly behind the photograph
          // where nobody can see it. Reduced motion means the plate does not
          // slide in — not that it is not there.
          style={still ? { x: 14, y: 14 } : { x: plateX, y: plateY }}
          className="pointer-events-none absolute inset-0 rounded-[1.75rem] bg-brand-600"
        />

        {stack.map((photo, pos) => {
          const depth = Math.min(pos, BEHIND.length - 1);
          const at = still ? BEHIND[0] : BEHIND[depth];
          return (
            <motion.div
              key={photo}
              // Nothing animates on the way in — a card arriving at the back
              // of the deck has just been dealt there and was never anywhere
              // else. Only the move FORWARD, as the deck closes up, animates.
              initial={false}
              animate={{ ...at, opacity: pos > BEHIND.length - 1 ? 0 : 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              style={{ zIndex: stack.length - pos }}
              className="absolute inset-0"
            >
              <Card
                photo={photos[photo]}
                dim={pos > 0}
                interactive={pos === 0 && many && !leaving}
                onDragStart={() => {
                  dragged.current = true;
                }}
                onDragEnd={onDragEnd}
                onTap={() => {
                  if (!dragged.current) deal(1);
                }}
              />
            </motion.div>
          );
        })}

        {/* The card on its way out, from wherever the finger let go. */}
        {leaving && (
          <motion.div
            key={`leaving-${leaving.photo}`}
            // Picked up exactly where the thumb put it down — position AND
            // lean. Starting the lean at zero straightens the card for one
            // frame at the very moment it leaves the hand.
            initial={{ x: leaving.from, rotate: tiltFor(leaving.from), opacity: 1 }}
            animate={{
              x: leaving.dir * 560,
              y: 40,
              rotate: leaving.dir * 22,
              opacity: 0,
            }}
            transition={{ duration: still ? 0.01 : 0.38, ease: "easeOut" }}
            onAnimationComplete={settleDeal}
            style={{ zIndex: stack.length + 1 }}
            className="pointer-events-none absolute inset-0"
          >
            <Card photo={photos[leaving.photo]} dim={false} interactive={false} />
          </motion.div>
        )}
      </motion.div>

      {/* Clear of the deck, not tucked under it. The cards behind are
          rotated, so their corners hang below the square the layout reserved
          for them — and the red plate hangs lower still. A tidy mt-5 put the
          dots underneath the bottom card. */}
      {many && (
        <div className="mt-12 flex items-center gap-3">
          <div className="flex items-center">
            {photos.map((p, i) => {
              const front = order[0] === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => show(i)}
                  aria-current={front}
                  // The dot is 10px because that is what a dot looks like.
                  // The BUTTON is 26px, because that is what a thumb needs —
                  // padding rather than size, so the target grows and the
                  // design doesn't.
                  className="group p-2 first:-ml-2"
                  // The keyboard's and the screen reader's way in, so the
                  // label has to say what the picture IS. "Photo 3 of 5"
                  // tells somebody who cannot see the deck nothing about
                  // whether they want to look at it.
                  aria-label={p.alt}
                >
                  <span
                    className={`block h-2.5 rounded-full transition-all ${
                      front
                        ? "w-7 bg-brand-600"
                        : "w-2.5 bg-ink-950/20 group-hover:bg-ink-950/40"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <p aria-hidden className="text-xs font-semibold text-ink-800/45">
            Swipe or tap the photo
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One photograph, framed.
 *
 * The drag lives on this inner element and the stack position on the wrapper
 * outside it, deliberately: motion cannot both hold a card at its place in
 * the fan and let a finger move it if the two are the same element — the drag
 * writes x, the stack animation writes x back, and the card fights the thumb.
 * Split in two, the drag offset simply composes with the fan.
 */
function Card({
  photo,
  dim,
  interactive,
  onDragStart,
  onDragEnd,
  onTap,
}: {
  photo: StoryPhoto;
  /** Behind the front one. Held back so the top card is the one being read. */
  dim: boolean;
  interactive: boolean;
  onDragStart?: () => void;
  onDragEnd?: (e: unknown, info: PanInfo) => void;
  onTap?: () => void;
}) {
  const x = useMotionValue(0);
  // Lean into the push, the way a card lifts off a table by one corner.
  const tilt = useTransform(x, [-220, 0, 220], [-12, 0, 12]);

  return (
    <motion.div
      // `drag="x"` and not free 2D on purpose: this sits in a column somebody
      // is scrolling past on a phone, and a card that follows the thumb
      // downwards is a card that has eaten the page scroll.
      drag={interactive ? "x" : false}
      dragElastic={0.55}
      dragMomentum={false}
      dragSnapToOrigin
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onTap={interactive ? onTap : undefined}
      style={{ x, rotate: tilt }}
      className={`h-full w-full overflow-hidden rounded-[1.75rem] border-4 border-ink-950 bg-ink-950 ${
        interactive ? "cursor-grab touch-pan-y active:cursor-grabbing" : ""
      }`}
    >
      <div className="relative h-full w-full">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          // Dragged by the corner otherwise — the browser's own image drag
          // starts before motion's does and the card never moves.
          draggable={false}
          sizes="(min-width: 1024px) 45vw, 90vw"
          className="select-none object-cover"
        />
        {/* A faint warm wash, so a phone snapshot sits with the rest of the
            page rather than looking pasted in from somewhere else. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/35 via-transparent to-transparent"
        />
        {/* Held back rather than hidden. Four photographs at equal brightness
            is four photographs competing; one lit and the rest in shadow is a
            stack with a top card. Animated, so a card coming forward lifts
            into the light instead of switching on. */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: dim ? 0.34 : 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none absolute inset-0 bg-ink-950"
        />
      </div>
    </motion.div>
  );
}
