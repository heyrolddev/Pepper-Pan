"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * The hero's background video, laid over the still that is already on screen.
 *
 * Deliberately NOT the thing that renders first. The still image behind this
 * is server-rendered and is what a customer sees the instant the page arrives;
 * the video fades in on top only once the browser can actually draw it. The
 * alternative — a bare <video> as the only content — shows a black rectangle
 * for as long as the download takes, which on stall wifi is the first
 * impression.
 *
 * Nothing here is decorative. Every attribute below is load-bearing:
 *
 *   muted + playsInline  iOS refuses to autoplay without BOTH. Miss either and
 *                        the video simply never starts on an iPhone, silently.
 *   loop                 a 14-second clip that stops is worse than no clip.
 *   preload="auto"       it is the hero; it is going to be watched.
 *
 * One thing stops it loading, and it means "leave the photograph up" rather
 * than "show a black box": reduce-motion. Someone who asked their phone to
 * stop animating things asked for a reason, and a looping video is exactly
 * what they turned off.
 *
 * There used to be a second: it skipped the video on a slow connection. The
 * owner asked for it to play for everyone, every time, and it is their shop
 * and their customers. What makes that a fair trade rather than a concession
 * is that the file is now 2.0 MB rather than 3.5, is laid out to start on its
 * first frame rather than its whole download, and the still underneath is a
 * frame of the same footage — so the wait it replaces is short, and what is
 * on screen during it is already the right picture.
 */

/* ---------------- reduce motion ---------------- */

const subscribeToMotionPref = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * On the server there is no preference to read, and guessing "reduced" would
 * leave the video out of the server-rendered HTML for everybody.
 */
const noOnServer = () => false;

export function HeroVideo({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  const reduced = useSyncExternalStore(
    subscribeToMotionPref,
    prefersReducedMotion,
    noOnServer
  );

  /**
   * Catch a video that was already loaded before React got here.
   *
   * The server sends the <video> with its src, so the browser begins fetching
   * during parse — before the page has hydrated and before any React handler
   * exists. On a quick connection `loadeddata` therefore fires into nothing,
   * and since it only fires once, the video plays perfectly at opacity 0
   * forever: motion nobody can see, behind a photograph.
   *
   * The event alone cannot cover that. Reading `readyState` when React first
   * takes hold of the element can, because it is state rather than a moment —
   * anything already loaded reports it, whenever we ask.
   */
  const attach = useCallback((el: HTMLVideoElement | null) => {
    if (el && el.readyState >= 2) setReady(true);
  }, []);

  if (reduced) return null;

  return (
    <video
      ref={attach}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      // `loadeddata`, not `canplay`. `canplay` waits for enough buffered ahead
      // of the current position to keep going; `loadeddata` fires as soon as
      // the first frame can be drawn. Waiting for the former is what made the
      // video take noticeably long to appear on a good connection, for a
      // guarantee the loop does not need — if it does stall later it holds a
      // frame, which is no worse than the photograph it replaced.
      onLoadedData={() => setReady(true)}
      // Two more moments that all mean the same thing — there is a frame to
      // show. Cheap, and between them there is no ordering in which the reveal
      // is missed.
      onCanPlay={() => setReady(true)}
      onPlaying={() => setReady(true)}
      // A video that fails leaves the still in place rather than a broken
      // player, which is the whole point of layering the two.
      onError={() => setReady(false)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}
