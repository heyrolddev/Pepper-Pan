"use client";

import { useSyncExternalStore } from "react";
import { GoogleReviewButton } from "@/components/google-review-button";

const KEY = "pepperpan.google-review-asked";

/**
 * Whether this browser has already said no.
 *
 * Held as an external store rather than read in an effect, because that is
 * what it is: a value that lives outside React, can change from another tab,
 * and has no answer at all on the server. `useSyncExternalStore` is built
 * for exactly this shape and gets the server render right by construction —
 * `getServerSnapshot` says "dismissed", so the ask is absent in the HTML and
 * appears only once the browser has been asked.
 *
 * Every read and write is wrapped. localStorage throws in a private window
 * and comes back empty with site data cleared, and a review nudge must never
 * be the thing that breaks somebody's order history.
 */
let cached: boolean | null = null;
let listeners: (() => void)[] = [];

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "done";
  } catch {
    // No storage is not "they said no". Ask — which is the state somebody
    // who has never been asked should be in.
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange);
  // Another tab dismissing it should hide it here too. `storage` fires only
  // in the OTHER tabs, which is exactly the half this misses on its own.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) {
      cached = null;
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Cached, because React calls this on every render and it must be stable. */
function getSnapshot(): boolean {
  if (cached === null) cached = read();
  return cached;
}

/** Hidden on the server: it cannot know, and flashing the ask at somebody
 *  who already declined is worse than showing it a moment late. */
const getServerSnapshot = () => true;

function dismiss() {
  cached = true;
  try {
    window.localStorage.setItem(KEY, "done");
  } catch {
    // It closes either way. A dismissal that cannot be remembered is still
    // a dismissal for this visit.
  }
  for (const l of listeners) l();
}

/**
 * The ask, after the customer has already said something kind.
 *
 * It appears inside the review panel once they have rated at least one
 * thing — never before. Somebody who has just given the shop five stars has
 * already said the thing, and asking them to say it again somewhere else is
 * a small favour between people who are getting on. Asking first, of a
 * customer who has said nothing, is a shop more interested in its rating
 * than in feeding them.
 *
 * And an ask with no way to decline is not an ask. "Not now" is remembered
 * per device rather than on the account, deliberately: this is a nudge, and
 * a nudge is exactly the kind of state that is fine to lose. A new phone
 * asking once more is a much smaller cost than a database column and a
 * migration for a piece of politeness.
 */
export function GoogleReviewNudge() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (dismissed) return null;

  return (
    <div className="mt-4 rounded-2xl bg-ink-950 px-5 py-4 text-cream-50">
      <p className="font-display text-base font-black leading-snug">
        Salamat! Would you say that on Google too?
      </p>
      <p className="mt-1 text-sm leading-relaxed text-cream-100/70">
        It is how people searching for food in Apalit find the stall — and it
        takes about the same thirty seconds you just spent here.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* The same button as the homepage and the reviews page, so it is
            recognisably one action rather than a third design for it. */}
        <GoogleReviewButton />
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full px-4 py-3 text-sm font-semibold text-cream-100/55 transition-colors hover:text-cream-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
