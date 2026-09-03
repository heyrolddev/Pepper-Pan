"use client";

import { useState, useSyncExternalStore } from "react";

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
 *   preload="auto"       it is the hero; on a connection that can take it, it
 *                        is going to be watched.
 *
 * Two things decide whether it loads at all, and both of them mean "leave the
 * photograph up" rather than "show a black box":
 *
 *   reduce-motion   someone who asked their phone to stop animating things
 *                   asked for a reason, and a looping video is exactly what
 *                   they turned off.
 *   a slow line     see `connectionIsFast`.
 */

/* ---------------- reduce motion ---------------- */

const subscribeToMotionPref = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- connection ---------------- */

type Connection = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?(t: string, fn: () => void): void;
  removeEventListener?(t: string, fn: () => void): void;
};

const connection = (): Connection | null =>
  typeof navigator === "undefined"
    ? null
    : ((navigator as Navigator & { connection?: Connection }).connection ?? null);

const subscribeToConnection = (onChange: () => void) => {
  const c = connection();
  c?.addEventListener?.("change", onChange);
  return () => c?.removeEventListener?.("change", onChange);
};

/**
 * Is this line worth spending three and a half megabytes on?
 *
 * The video is the size it is. On a good connection it arrives in about a
 * second and is the best thing on the page; on a phone using mobile data at
 * the stall it is a long wait for something the customer did not ask for, and
 * the wait is the part they notice. So on a slow line it is never requested at
 * all — not deferred, not queued: not downloaded. The still photograph is
 * already there and is a perfectly good hero.
 *
 * `saveData` is the browser telling us, on the person's behalf, not to spend
 * their data. That is not a hint to weigh up; it is an answer.
 *
 * When the browser reports nothing — Safari has no Network Information API —
 * the answer is yes. Refusing to play the video for everyone whose browser
 * declines to describe their connection would mean no iPhone ever sees it.
 */
const connectionIsFast = () => {
  const c = connection();
  if (!c) return true;
  if (c.saveData) return false;
  const t = c.effectiveType;
  // Only "4g" is quick enough to be worth it. "3g" here means roughly 700kbps
  // — the better part of a minute for this file, spent on their data.
  return !t || t === "4g";
};

/**
 * On the server there is no preference and no connection to read. Both default
 * to "show it": guessing the restrictive answer would leave the video out of
 * the server-rendered HTML for everybody, and the restrictive case is the one
 * that can safely be corrected a moment later on the client.
 */
const yesOnServer = () => true;
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
  const fast = useSyncExternalStore(
    subscribeToConnection,
    connectionIsFast,
    yesOnServer
  );

  if (reduced || !fast) return null;

  return (
    <video
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
      // A video that fails leaves the still in place rather than a broken
      // player, which is the whole point of layering the two.
      onError={() => setReady(false)}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      } ${className}`}
    />
  );
}
