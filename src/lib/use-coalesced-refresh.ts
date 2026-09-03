"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { coalesce } from "@/lib/coalesce";

/**
 * `router.refresh()`, but at most once per burst.
 *
 * Every realtime hook here treats a Postgres change as a signal rather than
 * as data: it calls `router.refresh()`, the server component re-runs, and RLS
 * decides all over again what this viewer may see. That is the right design —
 * a realtime payload can never show anybody a row they could not have
 * fetched — but it makes each event cost a full server round-trip and a
 * re-render of the route.
 *
 * At the counter during a rush that is the wrong trade. One order moving
 * through new → cooking → ready is three events; HQ mounts the orders
 * subscription twice on purpose (the shell and the banner do different jobs),
 * so it is six refreshes; a bulk update or a few orders landing together
 * multiplies it again. Each refresh supersedes the one before it, so all but
 * the last were work nobody ever saw — and on a slow stall connection the
 * queue of them is what makes the screen feel stuck.
 *
 * Waiting a beat collapses a burst into one refresh. The delay is short
 * enough that a person watching the board does not perceive it as lag, and
 * the trailing edge is the one that fires, so what finally renders is the
 * newest state rather than the first event's.
 *
 * 250ms is long enough to swallow a burst and short enough that nobody
 * watching the board reads it as lag.
 */
const BURST_MS = 250;

export function useCoalescedRefresh(): () => void {
  const router = useRouter();

  // One coalescer per mounted component. `router` is stable across renders in
  // the App Router, so this is created once and not rebuilt under the caller.
  const gate = useMemo(() => coalesce(() => router.refresh(), BURST_MS), [router]);

  // Drop a pending refresh on unmount: a screen that has been navigated away
  // from should not wake up to re-fetch a route nobody is looking at.
  useEffect(() => gate.cancel, [gate]);

  return gate.call;
}
