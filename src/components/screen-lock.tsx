"use client";

import { useEffect } from "react";
import { applyOrientationLock, readScreenMode } from "@/lib/screen";

/**
 * Hold the installed app sideways, on every launch — not just the one where
 * the setting was tapped.
 *
 * THE BUG THIS EXISTS FOR
 *
 * `applyOrientationLock` was called from exactly one place: the `choose()`
 * handler on the Screen layout control, which lives on My account. So the
 * screen rotated the moment you picked Landscape, and never again. Close the
 * app, open it from the home screen icon, and the boot script in the layout
 * restored `data-screen="wide"` — the shorter header, the compressed
 * masthead, the wider columns, every visible part of the setting — while the
 * one thing the setting is NAMED for silently did not happen. The only way
 * to get the phone to turn was to walk back into My account and press a
 * button that was already selected.
 *
 * On an iPhone nobody noticed, because `screen.orientation.lock` does not
 * exist there: it never rotated on the first tap either, so there was no
 * working behaviour to lose. Android has the call, honours it in an
 * installed app, and therefore had the bug all to itself — a setting that
 * worked once and then appeared to break.
 *
 * WHY IT RE-ARMS ON RETURN
 *
 * Android drops an orientation lock when the app is backgrounded and, on
 * some versions, does not restore it when you come back. For a phone that is
 * only ever opened for a minute that is invisible; for the tablet propped on
 * the stall counter, which is exactly who this setting is for, it is the
 * difference between a screen that stays put all day and one that flips
 * every time somebody switches away to answer Messenger.
 *
 * Mounted in the root layout, renders nothing, and does nothing at all in a
 * browser tab — there the lock is refused, which is correct and is what the
 * Screen layout control now says out loud.
 */
export function ScreenLock() {
  useEffect(() => {
    const arm = () => void applyOrientationLock(readScreenMode());

    arm();

    // `visibilitychange` rather than `focus`: coming back from the launcher
    // or another app is a visibility change, and it is the one that fires on
    // Android when the lock has been dropped.
    const onVisible = () => {
      if (document.visibilityState === "visible") arm();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
