"use client";

import { useEffect, useRef } from "react";
import { backUpIfDue, sendOffsiteIfDue } from "@/app/admin/backup/actions";

/**
 * The nudge that makes the daily copy happen.
 *
 * Renders nothing. It exists because there is no cron on this project and the
 * shop opens HQ every day it trades — so the visit is the heartbeat, the same
 * way stale shifts get closed. It fails in the right direction too: a week
 * with no copies is a week nobody opened the shop, and so a week with nothing
 * new to lose.
 *
 * Fired from the browser rather than from the layout's render on purpose. A
 * snapshot reads every table; doing that during a render would make one HQ
 * page load a day mysteriously slow for whoever happened to open it first.
 * Out here it happens beside the page instead of in front of it, and the
 * server decides whether anything is actually due.
 *
 * The ref guard is for React's development double-mount, which would
 * otherwise fire two requests — harmless, since the server checks first, but
 * two megabyte-scale writes racing is not a thing to leave lying around.
 */
export function DailyBackup() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Not awaited and not surfaced. A backup is not what this person came to
    // HQ to do, and the backup screen is where its success or failure is
    // reported.
    //
    // The daily copy first, then the weekly one out to email — in that order
    // deliberately, so a week where both are due gets the copy in the drawer
    // before it starts posting megabytes anywhere.
    void backUpIfDue().then(() => sendOffsiteIfDue());
  }, []);

  return null;
}
