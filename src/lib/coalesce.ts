/**
 * Collapse a burst of calls into one.
 *
 * Deliberately plain: no React, no router, nothing that needs a DOM. That is
 * what lets the timing be tested directly, which matters because the bug it
 * fixes is invisible in a screenshot — it only shows up as a screen that
 * feels stuck when several things happen at once.
 *
 * Trailing edge, not leading. What the caller is fetching is "the current
 * state", so the newest event in a burst is the one worth acting on and every
 * earlier one would have been superseded before anybody saw it.
 */
export function coalesce(run: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    /** Ask to run. Pushes the deadline out if a run is already pending. */
    call() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        run();
      }, ms);
    },
    /** Drop anything pending — for when the thing that wanted it has gone. */
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
