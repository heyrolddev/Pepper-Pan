"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Loads the custom cursor only where there is a cursor to replace.
 *
 * The cursor itself is a spring simulation following the mouse. It already
 * refused to run on a touchscreen — but refusing to *run* is not refusing to
 * *ship*: because the root layout imported it directly, every phone still
 * downloaded, parsed and executed it, along with the slice of `motion` it
 * pulls in, purely to reach a line that said "not on this device".
 *
 * This wrapper is the part that ships everywhere, and it is a few bytes. The
 * real component is fetched only after the check passes, which on a phone is
 * never.
 *
 * `ssr: false` because there is nothing to prerender: the cursor is drawn at a
 * position the server cannot know, and rendering it into the HTML only to move
 * it on hydration would cost a paint for nothing.
 */
const Cursor = dynamic(
  () => import("@/components/cursor").then((m) => m.Cursor),
  { ssr: false }
);

export function DesktopCursor() {
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    // Both checks read browser APIs that do not exist during SSR, so this
    // cannot be an initial state — and it must not be, or the server and the
    // client would disagree about what the first paint contains.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!coarse && !still) setWanted(true);
  }, []);

  return wanted ? <Cursor /> : null;
}
