/**
 * What HQ shows while the next screen is being built.
 *
 * WHY THIS FILE IS THE BIGGEST SPEED CHANGE IN HQ
 *
 * Every screen in here is `force-dynamic` — a cached cost or a stale order
 * count is a wrong one — so a tab is a round trip to the database every time.
 * Without a loading boundary, Next has nothing to put on screen while that
 * runs, so it leaves the *previous* page up, frozen and still highlighting
 * the tab you just left. Nothing moves, nothing responds, and the tap you
 * made looks like it was missed — which is why the next thing a person does
 * is tap it again, and now there are two renders in flight.
 *
 * With this file the tab responds on the same frame: the sidebar stays put,
 * the content area becomes this, and the real screen swaps in when it arrives.
 * The server is exactly as fast as it was. The difference is that the shop
 * can see it working — and Next also prefetches this boundary for every link
 * in the rail, so the swap itself costs nothing.
 *
 * It is also what makes navigation interruptible: with a boundary in place a
 * second tap on a different tab abandons the first render instead of queueing
 * behind it.
 *
 * Shaped like the screens rather than a spinner, and deliberately so. Almost
 * every HQ page is a heading, a row of figures and a list; a skeleton in that
 * shape means the page does not jump when the real thing lands, and the eye
 * has already found where it is going to read.
 */

/** No animation at all for anyone who has asked their device for less. */
const shimmer = "animate-pulse rounded-2xl bg-ink-950/5 motion-reduce:animate-none";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      {/* Screen-reader users get the fact, not the furniture. */}
      <span className="sr-only">Loading…</span>

      <div aria-hidden className="flex flex-col gap-2">
        <div className={`${shimmer} h-8 w-52`} />
        <div className={`${shimmer} h-4 w-full max-w-lg`} />
      </div>

      <div aria-hidden className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${shimmer} h-28`} />
        ))}
      </div>

      <div aria-hidden className="flex flex-col gap-2">
        {/* Decreasing widths: a column of identical bars reads as a loading
            graphic, and these should read as rows about to become real. */}
        {[
          "w-full",
          "w-full",
          "w-[92%]",
          "w-full",
          "w-[85%]",
          "w-[70%]",
        ].map((w, i) => (
          <div key={i} className={`${shimmer} h-16 ${w}`} />
        ))}
      </div>
    </div>
  );
}
