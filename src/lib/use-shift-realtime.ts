"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCoalescedRefresh } from "@/lib/use-coalesced-refresh";

/**
 * Keeps "who is on shift" current without anybody refreshing.
 *
 * The clock in the rail and the "On shift" badge on the Staff screen are both
 * rendered on the server, so they were only ever as true as the last page
 * load. The counter tablet is the case that actually bites: it sits open on
 * one page all day, somebody clocks in on the phone in the back, and the
 * tablet goes on offering "Clock in" — so they press it, and the database has
 * to refuse a second open shift. The screen was wrong, and the person got
 * told off by an error message for believing it.
 *
 * Same shape as `useOrderRealtime`, and for the same reason: the payload is
 * only ever a signal that something changed. `router.refresh()` re-runs the
 * server component, which re-reads through RLS — so what a person sees is
 * decided by the same policies as on a cold load, and a realtime event can
 * never show anybody a row they could not have fetched.
 *
 * Realtime respects RLS too, so staff receive events for their own shift and
 * nobody else's; the owner receives all of them.
 */
export function useShiftRealtime(channelKey = "shifts") {
  const refresh = useCoalescedRefresh();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`staff_shifts:${channelKey}`)
      .on(
        "postgres_changes",
        // Clocking in is an INSERT and clocking out is an UPDATE, so both
        // matter. `*` rather than two handlers that would do the same thing.
        { event: "*", schema: "public", table: "staff_shifts" },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelKey, refresh]);
}
