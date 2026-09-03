"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCoalescedRefresh } from "@/lib/use-coalesced-refresh";

type Options = {
  /** Limit to one customer's orders. Omit on the admin side to watch them all. */
  customerId?: string;
  /**
   * Distinguishes two subscriptions watching the same rows. HQ has one in the
   * shell (so every screen and the sidebar counts stay current) and one in the
   * orders banner (which also chimes) — same filter, different jobs, and they
   * need separate channels or the second silently replaces the first.
   */
  channelKey?: string;
  /** Fired for rows that are genuinely new (admin: "a new order came in"). */
  onInsert?: (row: Record<string, unknown>) => void;
  /** Fired when an existing row changes (customer: "status moved to ready"). */
  onUpdate?: (row: Record<string, unknown>, old: Record<string, unknown>) => void;
};

/**
 * Subscribes to Postgres changes on `orders` and refreshes the current route
 * when one lands, so server-rendered order lists stay correct without the
 * viewer refreshing.
 *
 * `router.refresh()` re-runs the server component and reconciles the result
 * into the existing tree, which keeps RLS as the single source of truth for
 * what this viewer may see — the realtime payload is only used as a signal
 * that something changed, never rendered directly.
 *
 * Returns the connection state so the UI can show an honest "Live" indicator
 * rather than implying live updates that may not be arriving.
 */
export function useOrderRealtime({
  customerId,
  channelKey,
  onInsert,
  onUpdate,
}: Options = {}) {
  const refresh = useCoalescedRefresh();
  const [connected, setConnected] = useState(false);

  // Kept in refs so a caller re-creating its callbacks each render doesn't
  // tear down and re-open the subscription. Assigned in an effect rather than
  // during render, which would be a render-phase side effect.
  const insertRef = useRef(onInsert);
  const updateRef = useRef(onUpdate);

  useEffect(() => {
    insertRef.current = onInsert;
    updateRef.current = onUpdate;
  }, [onInsert, onUpdate]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const filter = customerId ? `customer_id=eq.${customerId}` : undefined;

    const channel = supabase
      .channel(
        `orders:${customerId ?? "all"}${channelKey ? `:${channelKey}` : ""}`
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", ...(filter && { filter }) },
        (payload) => {
          insertRef.current?.(payload.new as Record<string, unknown>);
          refresh();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", ...(filter && { filter }) },
        (payload) => {
          updateRef.current?.(
            payload.new as Record<string, unknown>,
            payload.old as Record<string, unknown>
          );
          refresh();
        }
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [customerId, channelKey, refresh]);

  return { connected };
}
