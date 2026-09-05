"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportClientError } from "@/app/report-error";
import Link from "next/link";

/**
 * What HQ shows when a screen fails.
 *
 * There was no error boundary anywhere in this app, so any server-side failure
 * fell all the way through to the host's own page: a black screen, "a server
 * error occurred", and a number. That page cannot say which screen broke, has
 * no way back into the shop, and — worst of it — looks identical whether the
 * cause is a missing environment variable or a database that is briefly
 * unreachable.
 *
 * This one says where you are, gives the reference the server log is filed
 * under, and offers the two things anybody actually wants: try again, or go
 * somewhere that works. During a service the second one matters more than the
 * first: the counter has to keep taking money even if one screen is down.
 *
 * Next hides the message itself in production on purpose — an error text can
 * carry a query, a column name, or a fragment of somebody's data — so the
 * digest is the handle. It is the same string in the server log.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // Into the browser console as well as the server's, so a screenshot of the
    // console is enough to work from when somebody reports this from a phone.
    console.error("[HQ]", error);
    // And into the error log, which is the copy the owner will actually find
    // — nobody screenshots a console unless they are already being asked to.
    void reportClientError({
      message: error.message,
      route: pathname,
      digest: error.digest,
    });
  }, [error, pathname]);

  return (
    <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
      <h2 className="font-display text-2xl font-black text-ink-950">
        This screen didn&apos;t load
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-800/70">
        Something went wrong on the server working this page out. Nothing you
        did caused it and nothing has been lost — the rest of HQ is still
        working, so if you&apos;re mid-service, carry on at the counter.
      </p>

      {error.digest && (
        <p className="mt-4 rounded-xl bg-ink-950/5 px-4 py-3 font-mono text-xs text-ink-800/70">
          Reference: {error.digest}
          <span className="mt-1 block font-sans text-ink-800/50">
            Quote this when reporting it — the full reason is filed under this
            number in the server log.
          </span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 transition-colors hover:bg-ink-800"
        >
          Try again
        </button>
        <Link
          href="/admin/counter"
          className="rounded-xl bg-jade-600 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-jade-700"
        >
          Go to the counter
        </Link>
        <Link
          href="/admin"
          className="rounded-xl bg-ink-950/5 px-5 py-2.5 text-sm font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
        >
          Back to Today
        </Link>
      </div>
    </div>
  );
}
