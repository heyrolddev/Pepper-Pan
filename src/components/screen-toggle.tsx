"use client";

import { useEffect, useState } from "react";
import {
  SCREEN_ATTR,
  SCREEN_KEY,
  applyOrientationLock,
  isInstalled,
  readScreenMode,
  type ScreenMode,
} from "@/lib/screen";

/**
 * Portrait or landscape, chosen rather than held.
 *
 * Deliberately honest about what it can deliver. In the installed app it
 * rotates the phone; in a browser tab it cannot, and says so rather than
 * quietly doing half the job — but the wide layout applies either way, which
 * is what makes the setting worth having on a tablet propped on the counter.
 */
export function ScreenToggle() {
  const [mode, setMode] = useState<ScreenMode>("auto");
  const [canRotate, setCanRotate] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage and display-mode are browser-only, so the real state can
    // only be known after mount. Until then the control renders its default,
    // which is what the server rendered too.
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode(readScreenMode());
    setCanRotate(isInstalled());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
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
    void applyOrientationLock(next);
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
      <p className="mt-1 text-sm text-ink-800/70">
        For a phone or tablet held sideways.
      </p>

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

      {/* Rendered only once the check has run, so a browser tab never flashes
          the claim that it can rotate the screen. */}
      {ready && (
        <p className="mt-3 text-xs leading-relaxed text-ink-800/60">
          {canRotate
            ? "Installed on your home screen, so Landscape turns the screen itself."
            : "In a browser tab the phone can't be turned by a website — this changes the layout only. Add Pepper Pan to your home screen and it will rotate too."}
        </p>
      )}
    </div>
  );
}
