import { useCallback, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether this visitor asked their device for less movement.
 *
 * Motion ships its own useReducedMotion and it cannot be used for anything
 * that changes what gets rendered. It reads the media query on the client's
 * very first render, while the server had no media query at all and rendered
 * the moving version. The two disagree, React throws a hydration error, and
 * the whole tree is thrown away and rebuilt on the client — for exactly the
 * visitors who asked for less work, not more.
 *
 * useSyncExternalStore's third argument is the server snapshot, and React
 * also uses it for the hydration render. So this returns false while React is
 * matching the server's HTML, then settles to the real answer on the very
 * next pass. Nothing mismatches, and reduced motion still wins.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
