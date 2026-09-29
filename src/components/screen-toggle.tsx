"use client";

import { useEffect, useState } from "react";
import {
  SCREEN_ATTR,
  SCREEN_KEY,
  applyOrientationLock,
  readScreenMode,
  type LockResult,
  type ScreenMode,
} from "@/lib/screen";

/**
 * Portrait or landscape, chosen rather than held.
 *
 * Deliberately honest about what it can deliver — and it now finds out what
 * that is by asking, instead of inferring it. `display-mode: standalone`
 * says the app is ALLOWED to turn the screen, not that it did; the note
 * under the buttons is written from the answer `screen.orientation.lock()`
 * actually gave. The wide layout applies in every one of those cases, which
 * is what makes the setting worth having on a tablet propped on the counter.
 *
 * Taking the lock on each LAUNCH is not this component's job — it lives on
 * My account, and the app has to be sideways from the moment it opens. See
 * <ScreenLock> in the root layout.
 */
export function ScreenToggle({
  /** Why this shop's people would want it — the counter tablet in HQ, a
   *  sideways phone on the customer side. Defaults to the general case. */
  hint = "For a phone or tablet held sideways.",
}: {
  hint?: string;
} = {}) {
  const [mode, setMode] = useState<ScreenMode>("auto");
  const [lock, setLock] = useState<LockResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage is browser-only, so the real state can only be known after
    // mount. Until then the control renders its default, which is what the
    // server rendered too.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readScreenMode();
    setMode(stored);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Ask the device what it will actually do, rather than inferring it from
    // `display-mode: standalone`. An installed app is ALLOWED to rotate; it
    // is not guaranteed to, and this control's whole job is to not overclaim.
    // Harmless to run: for "wide" the app is already locked by <ScreenLock>,
    // and for "auto" this is the unlock that was going to happen anyway.
    let live = true;
    void applyOrientationLock(stored).then((result) => {
      if (live) setLock(result);
    });
    return () => {
      live = false;
    };
  }, []);

  function choose(next: ScreenMode) {
    setMode(next);
    try {
      localStorage.setItem(SCREEN_KEY, next);
    } catch {
      // Private mode. The choice still applies to this page; it just won't
      // survive the next load, which is the most that can be promised.
    }
    document.documentElement.setAttribute(SCREEN_ATTR, next);
    void applyOrientationLock(next).then(setLock);
  }

  const options: { value: ScreenMode; label: string; hint: string }[] = [
    {
      value: "auto",
      label: "Portrait",
      hint: "Normal — follows however you hold the phone.",
    },
    {
      value: "wide",
      label: "Landscape",
      hint: "Wide layout, with a shorter header so more fits on screen.",
    },
  ];

  return (
    <div>
      <p className="font-display text-lg font-black text-ink-950">Screen layout</p>
      <p className="mt-1 max-w-xl text-sm text-ink-800/70">{hint}</p>

      <div
        role="radiogroup"
        aria-label="Screen layout"
        className="mt-4 grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const active = ready && mode === option.value;
          return (
            <button
              key={option.value}
              id={`screen-${option.value}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option.value)}
              className={`rounded-2xl px-5 py-4 text-left transition-colors ${
                active
                  ? "bg-brand-600 text-cream-50"
                  : "bg-cream-100 text-ink-800 ring-1 ring-ink-950/10 hover:bg-cream-50"
              }`}
            >
              <span className="block text-sm font-bold">{option.label}</span>
              <span
                className={`mt-1 block text-xs leading-snug ${
                  active ? "text-cream-50/80" : "text-ink-800/60"
                }`}
              >
                {option.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rendered only once the device has actually answered, so a browser
          tab never flashes the claim that it can rotate the screen — and an
          installed app never claims it either until the lock has been taken.
          The wide LAYOUT is applied in every one of these cases; the sentence
          is only ever about the screen turning. */}
      {ready && lock !== null && (
        <p className="mt-3 text-xs leading-relaxed text-ink-800/60">
          {lock === "locked"
            ? "Held sideways. The screen will stay this way, and will be put back each time you open the app."
            : lock === "unlocked"
              ? "The screen follows however you hold the phone."
              : lock === "refused"
                ? "The layout is wide, but this browser won't let a website turn the screen. Add Pepper Pan to your home screen and it will rotate too."
                : "The layout is wide. This phone doesn't let any website turn the screen — iPhones never do — so turn it by hand and the page will fit itself to it."}
        </p>
      )}
    </div>
  );
}
