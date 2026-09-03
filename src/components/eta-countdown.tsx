"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
/** "4:20" under an hour, "2h 40m" past it — 160:37 is not a readable delay. */
function overdueLabelFor(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function EtaCountdown({
  minutes,
  from,
  className = "",
  onElapsed,
  overdueLabel = false,
}: {
  minutes: number;
  from: string | null;
  className?: string;
  /**
   * Fired once, the moment the promise runs out. HQ uses it to tell the
   * shop; the customer's side leaves it undefined, because "your food is
   * late" is not news anybody wants pushed to them.
   */
  onElapsed?: () => void;
  /** Count *up* past zero, so the shop can see how late it's running. */
  overdueLabel?: boolean;
}) {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock);

  const total = minutes * 60_000;
  // Without a set-at timestamp (an order from before this shipped) there's
  // nothing to count down from, so show the plain promise instead of a
  // countdown that would be wrong.
  const deadline = from ? new Date(from).getTime() + total : null;
  const elapsedNow = deadline !== null && now !== 0 && now >= deadline;

  // Above the early return, because hooks have to run in the same order every
  // render and there is a `return` for the no-deadline case below.
  //
  // Fires once per deadline: a re-render or a remount must not ask again. The
  // server claims the alert too, so this ref is only saving a pointless round
  // trip, not carrying the correctness.
  // `onElapsed` is read through a ref and kept out of the deps, so a caller
  // passing a fresh arrow each render (the normal way to write it) can't
  // re-arm this. The guard is the deadline value, not the callback identity.
  const firedFor = useRef<number | null>(null);
  const elapsedCb = useRef(onElapsed);
  useEffect(() => {
    elapsedCb.current = onElapsed;
  });
  useEffect(() => {
    if (!elapsedNow || deadline === null) return;
    if (firedFor.current === deadline) return;
    firedFor.current = deadline;
    elapsedCb.current?.();
  }, [elapsedNow, deadline]);

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
  const over = now === 0 ? 0 : Math.max(0, now - deadline);
  const elapsed = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const done = now !== 0 && remaining === 0;

  return (
    <span
      className={`inline-flex min-w-36 flex-col gap-1 rounded-2xl px-3 py-2 ${
        done
          ? overdueLabel && over >= 1000
            ? "bg-brand-600 text-cream-50"
            : "bg-jade-600 text-cream-50"
          : "bg-brand-600 text-cream-50"
      } ${className}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
        {done ? (
          overdueLabel && over >= 1000 ? (
            <>
              Over by{" "}
              <span className="font-mono tabular-nums">
                {overdueLabelFor(over)}
              </span>
            </>
          ) : (
            "Time's up"
          )
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
