"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { readAuthError } from "@/lib/auth-error";

/**
 * "That link didn't work" — said out loud, where the customer lands.
 *
 * Supabase bounces a failed reset link to the project's Site URL with the
 * reason in the URL and nothing else. Before this, the homepage rendered its
 * ordinary self and the customer saw no acknowledgement that they had just
 * clicked anything, so they went back to their email and clicked the same
 * dead link again.
 *
 * It lives in the root layout because the landing page is Supabase's choice,
 * not ours — whatever page it drops them on, this is there.
 *
 * ── Why the URL is cleaned up ────────────────────────────────────────────
 *
 * The parameters are stripped once read. Left in place they survive a
 * refresh, a bookmark and a share, so the banner would reappear for ever —
 * and a stale apology on a page somebody opened for lunch is worse than no
 * apology at all.
 */

function subscribe() {
  // The URL only changes here by our own replaceState below, and that
  // re-renders through the store already. Nothing else to listen to.
  return () => {};
}

function snapshot(): string {
  return window.location.search + window.location.hash;
}

/* Nothing on the server: the hash never reaches it, so rendering half the
   answer there and the other half here would flash the wrong banner. */
const serverSnapshot = () => "";

export function AuthLinkNotice() {
  const url = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!url) return null;

  const problem = readAuthError(window.location.search, window.location.hash);
  if (!problem) return null;

  const clear = () => {
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // A browser that refuses is a browser that keeps the banner. Harmless.
    }
  };

  return (
    <div
      role="alert"
      className="mx-auto mt-4 flex max-w-2xl flex-col gap-3 rounded-2xl bg-gold-400/20 px-5 py-4 ring-1 ring-gold-500/40 sm:mx-4 lg:mx-auto"
    >
      <div>
        <p className="font-display text-lg font-black text-ink-950">
          That link didn&apos;t work
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-800/80">
          {problem.message}
        </p>
      </div>
      {problem.retryable && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/forgot-password"
            onClick={clear}
            className="rounded-full bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
          >
            Send me a new link
          </Link>
          <button
            onClick={clear}
            className="rounded-full px-4 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
