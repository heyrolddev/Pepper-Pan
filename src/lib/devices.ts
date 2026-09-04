/**
 * Which browser this is, and what to call it.
 *
 * Pure, so the label can be worked out on either side and so the naming is
 * testable — a device list where two phones are both called "Unknown device"
 * is a list nobody can make a decision from.
 */

/** The cookie the middleware mints. First-party, and readable by the server. */
export const DEVICE_COOKIE = "pp_device";

/** A year: long enough that a regular phone is never asked twice. */
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type DeviceStatus = "pending" | "approved" | "declined";

/**
 * A human name for a user agent.
 *
 * Deliberately coarse. The point is "is this the phone I use at the stall, or
 * something else" — not an exact build number, which tells the owner nothing
 * and changes on every browser update, making the same phone look like a new
 * device every few weeks.
 *
 * Order matters in both lists: Edge's user agent contains "Chrome", Chrome's
 * contains "Safari", and iPadOS reports "Macintosh". Checking the more
 * specific string first is what keeps every browser from being called Safari
 * on a Mac.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";

  const platform =
    /Android/.test(ua) ? "Android"
    : /iPhone/.test(ua) ? "iPhone"
    // iPadOS lies and calls itself a Mac, but only a real iPad is a touch
    // device claiming Macintosh — checked before the Mac branch below.
    : /iPad/.test(ua) ? "iPad"
    : /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : null;

  return platform ? `${browser} on ${platform}` : browser;
}
