"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the shop's inbox current as customers type.
 *
 * Staff can read every thread under RLS, so Realtime works directly here —
 * unlike the customer widget, where an anonymous visitor has no session to
 * subscribe with and polls instead.
 *
 * The payload is only a signal: `router.refresh()` re-runs the server
 * component so RLS stays the single authority on what this viewer may see.
 */
export function useChatRealtime() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createClient();
    const channel = supabase
      .channel("inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_threads" },
        () => router.refresh()
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return { connected };
}
