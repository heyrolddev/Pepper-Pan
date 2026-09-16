/**
 * How this browser wants the site laid out on a small screen.
 *
 * WHAT A WEBSITE CAN AND CANNOT DO ABOUT ROTATION
 *
 * A page in an ordinary browser tab cannot turn a phone. `screen.orientation
 * .lock()` is only granted to a document that is fullscreen or installed to
 * the home screen — everywhere else it rejects, and no amount of asking
 * changes that. So a setting that promised to rotate the phone would be a
 * button that does nothing for most of the people who press it.
 *
 * This setting therefore does the thing that always works, and the thing that
 * sometimes works, in that order:
 *
 *   always     Lays the page out for a short, wide screen — a compressed
 *              masthead, a shorter header, content using the width instead of
 *              one stretched column down the middle.
 *   when able  Asks the device to actually rotate, which it will honour once
 *              the site is installed to the home screen.
 *
 * Turning the phone sideways gets the same layout without touching the
 * setting at all: see the `(orientation: landscape)` rules in globals.css.
 * The setting exists for the person who wants it held that way on purpose —
 * a tablet on a stall counter, most of all.
 */

/** The attribute the layout script writes onto <html>. */
export const SCREEN_ATTR = "data-screen";

/** Where the choice is kept. Per browser, not per account — it describes a
 *  device, and the same person's phone and laptop want different answers. */
export const SCREEN_KEY = "pp-screen";

export type ScreenMode = "auto" | "wide";

export const SCREEN_MODES: readonly ScreenMode[] = ["auto", "wide"];

export function isScreenMode(value: unknown): value is ScreenMode {
  return value === "auto" || value === "wide";
}

/**
 * Read the stored choice.
 *
 * Private browsing can refuse localStorage outright, and a shop's site is not
 * the place to make that an error — an unreadable preference is simply the
 * default one.
 */
export function readScreenMode(): ScreenMode {
  try {
    const stored = localStorage.getItem(SCREEN_KEY);
    return isScreenMode(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

/** Is this the installed app rather than a browser tab? Only there can the
 *  orientation actually be locked. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates the standard and still answers only to this.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

type Lockable = ScreenOrientation & {
  lock?: (orientation: "portrait" | "landscape") => Promise<void>;
  unlock?: () => void;
};

/**
 * Ask the device to rotate, and shrug when it says no.
 *
 * Every failure here is expected and harmless: a browser tab refuses, an
 * iPhone has no `lock` at all, a desktop has nothing to rotate. The layout
 * has already been applied by then, so there is nothing to undo and nothing
 * worth telling the visitor about.
 */
export async function applyOrientationLock(mode: ScreenMode): Promise<void> {
  if (typeof window === "undefined") return;
  const orientation = window.screen?.orientation as Lockable | undefined;
  if (!orientation) return;

  try {
    if (mode === "wide") await orientation.lock?.("landscape");
    else orientation.unlock?.();
  } catch {
    // Not permitted here. The CSS side of the setting is already doing its job.
  }
}
