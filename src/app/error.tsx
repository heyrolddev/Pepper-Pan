"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * What a customer sees when a page fails.
 *
 * Deliberately not the same page as HQ's. A customer does not want a
 * reference number, they want food — so this offers the menu and the phone,
 * and says the one thing they will actually be worried about: whether an
 * order they placed went through.
 *
 * The shop's number is here rather than only in the footer, because the footer
 * is part of the page that just failed to render.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shop]", error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-lg rounded-3xl bg-cream-100 p-8 text-center ring-1 ring-ink-950/10">
        <p className="font-display text-5xl">🍜</p>
        <h1 className="mt-4 font-display text-3xl font-black text-ink-950">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-ink-800/70">
          Sorry — this page didn&apos;t load. It&apos;s us, not you. Try again,
          or ring the stall and we&apos;ll sort it out.
        </p>
        <p className="mt-2 text-sm text-ink-800/70">
          <strong className="text-ink-950">Already ordered?</strong> Your order
          is safe. This is only the page failing to draw, not the kitchen.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Try again
          </button>
          <Link
            href="/menu"
            className="rounded-full bg-ink-950 px-6 py-3 text-sm font-bold text-cream-50 transition-transform hover:scale-105"
          >
            Back to the menu
          </Link>
          <a
            href="tel:+639473533060"
            className="rounded-full bg-cream-200 px-6 py-3 text-sm font-bold text-ink-950 transition-transform hover:scale-105"
          >
            Call the stall
          </a>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-[11px] text-ink-800/35">
            {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
