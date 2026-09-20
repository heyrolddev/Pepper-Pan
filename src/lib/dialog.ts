"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/**
 * The parts of a dialog that are not its appearance.
 *
 * Three of these were written once in the sign-out confirmation, copied into
 * `AdminDialog` when the store-room forms were built, and then improved only
 * in the copy. The original — the one the owner meets most often, because it
 * guards the way out of HQ — kept all three of the original's faults for
 * months, and each of them is invisible until the exact moment it matters.
 *
 *   IT WAS BURIED. `fixed inset-0 z-[60]` sounds like it sits above
 *   everything and does not: z-index only ranks an element against its
 *   siblings inside the nearest stacking context, and `position: sticky`
 *   makes one unconditionally. The sign-out dialog is written inside HQ's
 *   sticky sidebar, so its 60 was ranked inside that sidebar — and any
 *   ordinary dialog on the page, every one of which is z-50, drew straight
 *   over the top of it. Measured: with a z-50 panel open, the point where
 *   "Yes, sign out" is painted belongs to the other panel. The button is
 *   not merely hidden, it is unclickable.
 *
 *   THE PAGE SCROLLED BEHIND IT. Measured: 0 → 500 with the question open.
 *   So the thing you are being asked about slides away while the question
 *   stays nailed to the middle of the screen, which is what makes it look
 *   stuck rather than modal.
 *
 *   `aria-modal` WAS A LIE. It says the rest of the page is inert. Measured:
 *   39 of the 42 focusable controls on the page were still reachable, so Tab
 *   walked out of the question into the page behind it and a screen reader
 *   read the lot.
 *
 * All three are mechanics rather than looks, which is why they live here now
 * instead of being fixed three times in three shapes of box.
 */

/** Nothing to subscribe to: whether we are in a browser never changes. */
const neverChanges = () => () => {};
const inBrowser = () => true;
const onServer = () => false;

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useDialog<T extends HTMLElement>({
  onClose,
  /** False while a save is in flight — a half-written row is worse than a stuck dialog. */
  closable = true,
}: {
  onClose: () => void;
  closable?: boolean;
}): { mounted: boolean; panel: RefObject<T | null> } {
  /**
   * The portal target only exists in the browser, so the first render has to
   * produce nothing — matching the server — and only then reach for
   * document.body.
   *
   * Through useSyncExternalStore rather than a setState in an effect: the
   * React Compiler rejects the latter outright, and it is right to.
   */
  const mounted = useSyncExternalStore(neverChanges, inBrowser, onServer);
  const panel = useRef<T | null>(null);

  // Held in a ref so the effect below does not tear down and rebuild — with
  // `closable` in the dependency list, every keystroke that flips `busy`
  // would re-run the whole thing and steal focus back to the panel.
  //
  // Written in an effect rather than during render: a ref assigned while
  // rendering is a side effect in a function React is allowed to run twice
  // and throw away, and the lint rule that says so is right.
  const latest = useRef({ onClose, closable });
  useEffect(() => {
    latest.current = { onClose, closable };
  });

  useEffect(() => {
    const el = panel.current;
    if (!el) return;

    // Where to put the cursor back when this closes. Without it, dismissing a
    // dialog drops focus to the top of the document, and the next Tab starts
    // from the logo rather than from the button that opened it.
    const returnTo = document.activeElement as HTMLElement | null;

    // The panel itself, not its first control. The first thing inside most of
    // these is the scrim's own Cancel button or a ✕, and opening a question by
    // focusing the way out of it reads as the dialog having already been
    // dismissed. A screen reader announces the panel's label instead, which
    // is the question.
    el.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      const { onClose, closable } = latest.current;
      if (e.key === "Escape") {
        // A dialog you cannot back out of with Escape is a trap, and these are
        // opened by accident more often than on purpose.
        if (closable) onClose();
        return;
      }
      if (e.key !== "Tab" || !el) return;

      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (x) => x.offsetParent !== null || x === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        el.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const here = document.activeElement;
      const outside = !el.contains(here);

      if (e.shiftKey && (here === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (here === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    }

    // Captured, so a field inside the dialog that handles Tab itself cannot
    // swallow the wrap and let focus escape into the page behind.
    document.addEventListener("keydown", onKey, true);

    const wasOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = wasOverflow;
      // Guarded: the element that opened this may have been unmounted by
      // whatever the dialog just did.
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
    // Deliberately empty. Everything that changes is read through `latest`,
    // so the trap is installed once per opening rather than on every render.
  }, []);

  return { mounted, panel };
}
