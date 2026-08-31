"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOrderRealtime } from "@/lib/use-order-realtime";
import { LiveDotIcon } from "@/components/icons";

/**
 * `Notification.permission` is a browser value that doesn't exist during SSR
 * and changes only when we ask for it, so it's read through
 * useSyncExternalStore: the server snapshot keeps hydration consistent, and
 * `emitPermissionChange` re-reads it after a grant.
 */
const permissionListeners = new Set<() => void>();

function subscribePermission(cb: () => void) {
  permissionListeners.add(cb);
  return () => permissionListeners.delete(cb);
}

function emitPermissionChange() {
  for (const cb of permissionListeners) cb();
}

function getPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function getServerPermission(): NotificationPermission | "unsupported" {
  return "default";
}

/**
 * Admin-side live wiring: keeps the order list fresh, and announces new
 * orders with a toast, a sound and (with permission) a system notification,
 * so the shop notices an order without staring at the screen.
 */
export function LiveOrdersBanner() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const permission = useSyncExternalStore(
    subscribePermission,
    getPermission,
    getServerPermission
  );
  const canNotify = permission === "granted";
  const supportsNotifications = permission !== "unsupported";

  // A short two-tone chime built with the Web Audio API — no asset to ship,
  // and it can't fail to load. Wrapped because browsers throw if the tab has
  // never been interacted with.
  const chime = useCallback(() => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      [880, 1320].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.14);
        osc.stop(ctx.currentTime + i * 0.14 + 0.3);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch {
      /* audio is a nice-to-have, never a failure */
    }
  }, []);

  const { connected } = useOrderRealtime({
    channelKey: "banner",
    onInsert: (row) => {
      const name = (row.contact_name as string) || "A customer";
      const total = Number(row.revenue ?? 0);
      const message = `${name} just ordered ₱${total.toFixed(2)}`;

      setToast(message);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 8000);

      chime();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("New Pepper Pan order", { body: message });
      }
    },
  });

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    emitPermissionChange();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
            connected ? "bg-jade-700 text-cream-50" : "bg-ink-950/10 text-ink-800"
          }`}
        >
          <LiveDotIcon
            className={`h-2 w-2 ${connected ? "animate-pulse text-cream-50" : "text-ink-800/50"}`}
          />
          {connected ? "Live" : "Connecting…"}
        </span>
        <span className="text-sm text-ink-800/60">
          {connected
            ? "New orders appear here automatically."
            : "Reconnecting — the list may be a few seconds behind."}
        </span>

        {!canNotify && supportsNotifications && (
          <button
            onClick={enableNotifications}
            className="rounded-full bg-ink-950 px-4 py-1.5 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600"
          >
            🔔 Alert me on new orders
          </button>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-ink-950 px-5 py-4 text-cream-50 shadow-2xl shadow-ink-950/40"
          >
            <span className="text-2xl">🔔</span>
            <div>
              <p className="font-display font-bold">New order</p>
              <p className="text-sm text-cream-100/75">{toast}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="ml-2 rounded-full px-2 text-cream-100/50 transition-colors hover:text-cream-50"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
