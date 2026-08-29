"use client";

import { useSyncExternalStore } from "react";
import { ClockIcon } from "@/components/icons";

/**
 * One shared ticking clock for every countdown on the page.
 *
 * Read through useSyncExternalStore rather than `setState` in an effect: the
 * snapshot must be cached (returning a fresh `Date.now()` from getSnapshot
 * would re-render forever), and the server snapshot keeps hydration honest.
 * The initial snapshot is 0 on both server and client, which renders the full
 * duration — so the first paint matches and the real time appears on the
 * first tick, a second later.
 */
let clockNow = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    clockNow = Date.now();
    timer = setInterval(() => {
      clockNow = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  // Nudge this subscriber so it picks up the real time immediately rather
  // than waiting out the first interval.
  queueMicrotask(cb);

  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getClock = () => clockNow;
const getServerClock = () => 0;

/**
 * A live countdown to the shop's promised ETA, so progress is visible rather
 * than a number that never moves.
 *
 * The deadline runs from when the shop *set* the ETA (`from` + minutes), not
 * from page load — otherwise reloading would restart the clock and twenty
 * minutes would never actually elapse.
 */
export function EtaCountdown({
  minutes,
  from,
  className = "",
}: {
  minutes: number;
  from: string | null;
  className?: string;
}) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);

  const total = minutes * 60_000;
  // Without a set-at timestamp (an order from before this shipped) there's
  // nothing to count down from, so show the plain promise instead of a
  // countdown that would be wrong.
  const deadline = from ? new Date(from).getTime() + total : null;

  if (deadline === null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-gold-400 px-3 py-1.5 text-xs font-bold text-ink-950 ${className}`}
      >
        <ClockIcon className="h-3.5 w-3.5" />
        Ready in ~{minutes} min
      </span>
    );
  }

  const remaining = now === 0 ? total : Math.max(0, deadline - now);
  const elapsed = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const done = now !== 0 && remaining === 0;

  return (
    <span
      className={`inline-flex min-w-36 flex-col gap-1 rounded-2xl px-3 py-2 ${
        done ? "bg-jade-600 text-cream-50" : "bg-gold-400 text-ink-950"
      } ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
        {done ? (
          "Any moment now!"
        ) : (
          <>
            Ready in{" "}
            <span className="font-mono tabular-nums">
              {mins}:{String(secs).padStart(2, "0")}
            </span>
          </>
        )}
      </span>

      {/* A bar makes progress legible at a glance, not just the digits. */}
      <span className="block h-1 w-full overflow-hidden rounded-full bg-ink-950/20">
        <span
          className={`block h-full rounded-full transition-[width] duration-1000 ease-linear ${
            done ? "bg-cream-50" : "bg-ink-950"
          }`}
          style={{ width: `${elapsed * 100}%` }}
        />
      </span>
    </span>
  );
}
