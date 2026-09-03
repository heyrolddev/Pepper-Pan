"use client";

import { useRef, useState, useSyncExternalStore } from "react";

/**
 * The hero's background video, laid over the still that is already on screen.
 *
 * Deliberately NOT the thing that renders first. The still image behind this
 * is server-rendered and is what a customer sees the instant the page arrives;
 * the video fades in on top only once the browser says it can actually play.
 * The alternative — a bare <video> as the only content — shows a black
 * rectangle for as long as the download takes, which on stall wifi is the
 * first impression.
 *
 * Nothing here is decorative. Every attribute below is load-bearing:
 *
 *   muted + playsInline  iOS refuses to autoplay without BOTH. Miss either and
 *                        the video simply never starts on an iPhone, silently.
 *   loop                 a 6-second clip that stops is worse than no clip.
 *   preload="auto"       it is the hero; it is going to be watched.
 *
 * Reduced motion is honoured by not mounting the video at all — the still
 * stays. Someone who has asked their phone to stop animating things has asked
 * for a reason, and a looping video is exactly what they turned off.
 */

const subscribeToMotionPref = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// On the server there is no preference to read, and guessing "reduced" would
// mean the video never renders in the HTML at all.
const notOnServer = () => false;

export function HeroVideo({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const reduced = useSyncExternalStore(
    subscribeToMotionPref,
    prefersReducedMotion,
    notOnServer
  );

  if (reduced) return null;

  return (
    <video
      ref={video}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      // A video that fails to load leaves the still in place rather than a
      // broken player, which is the whole point of layering them.
      onError={() => setReady(false)}
      onCanPlay={() => setReady(true)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}
