"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { PanLoader } from "@/components/pan-loader";

/**
 * Intro overlay, shown on every page load.
 *
 * The markup is rendered server-side so it covers the page from the very
 * first paint (otherwise you'd see the real page, then the loader drop on
 * top of it once React hydrated). A blocking script in <head> decides
 * whether this load gets the intro and, when it shouldn't, hides the
 * overlay via CSS before it ever paints — see `introScript` in layout.tsx.
 */
export function Preloader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const skip =
      document.documentElement.getAttribute("data-intro") === "skip";

    if (skip) {
      // Reading the DOM attribute the blocking script set is only possible
      // after mount, so this first transition has to happen here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(true);
      return;
    }

    // Long enough to read the logo, short enough that nobody waits on it.
    // It plays on every page load now, so this second matters more than it
    // would have as a one-off.
    const timer = setTimeout(() => setDone(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  // Release the scroll lock the blocking script applied.
  useEffect(() => {
    if (done) document.documentElement.classList.remove("intro-lock");
  }, [done]);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="intro"
          className="intro-overlay grain fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink-950"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
        >
          <div
            aria-hidden
            className="hero-grid pointer-events-none absolute inset-0 opacity-40"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute h-80 w-80 rounded-full bg-brand-600/30 blur-3xl"
          />

          <div className="relative">
            <Logo width={320} priority className="h-auto w-[220px] sm:w-[300px]" />
          </div>

          {/* The shop's one job, drawn: fire leaping out of the pan with the
              peppercorns tossing in it. The five hopping dots it replaced were
              a loading spinner in the shop's colours — they could have
              belonged to anyone. */}
          <PanLoader className="mt-6 h-auto w-[200px] sm:w-[240px]" />

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em] text-cream-100/50">
            Firing up the pan…
          </p>

          <div className="mt-8 h-0.5 w-40 overflow-hidden rounded-full bg-cream-100/15">
            <div className="intro-bar h-full w-0 bg-gradient-to-r from-brand-600 via-chili-500 to-gold-400" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
