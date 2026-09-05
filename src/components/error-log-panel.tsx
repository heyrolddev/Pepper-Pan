"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format-date";
import { clearResolvedErrors, setErrorResolved } from "@/app/admin/errors/actions";
import type { LoggedError } from "@/lib/error-log";

/**
 * What is broken, on the screen the owner lands on.
 *
 * Deliberately not its own tab. A screen you have to remember to visit is a
 * screen that gets visited the week it is built and never again — and this
 * one matters most on the days nobody is thinking about it. It sits on the
 * dashboard, above the takings, and it is not there at all when nothing is
 * wrong.
 *
 * Written for somebody who does not read stack traces. The headline is the
 * count of people affected and when it last happened, because those are the
 * two facts that decide whether to stop what you are doing. The stack is
 * folded away underneath for whoever ends up fixing it.
 */
export function ErrorLogPanel({ errors }: { errors: LoggedError[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showResolved, setShowResolved] = useState(false);

  const open = errors.filter((e) => !e.resolved);
  const resolved = errors.filter((e) => e.resolved);

  // Nothing wrong, nothing to say. A panel that renders "all good" every day
  // is a panel the eye stops seeing, including on the day it changes.
  if (open.length === 0 && resolved.length === 0) return null;

  function toggle(id: string, resolvedNow: boolean) {
    startTransition(async () => {
      await setErrorResolved({ id, resolved: resolvedNow });
      router.refresh();
    });
  }

  const shown = showResolved ? resolved : open;

  return (
    <section
      className={`rounded-3xl p-6 ring-1 sm:p-7 ${
        open.length > 0
          ? "bg-brand-50 ring-brand-300"
          : "bg-cream-100 ring-ink-950/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black tracking-tight text-ink-950">
            {open.length > 0
              ? `${open.length} thing${open.length === 1 ? "" : "s"} broke`
              : "Nothing broken right now"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/70">
            {open.length > 0
              ? "Recorded automatically when a page or a button fails — for you or for a customer. Tick one off once it's sorted; if it happens again it comes back on its own."
              : "Everything here has been ticked off."}
          </p>
        </div>

        {resolved.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="rounded-full bg-cream-50 px-3.5 py-1.5 text-xs font-bold text-ink-800/70 ring-1 ring-ink-950/10 transition-colors hover:bg-ink-950 hover:text-cream-50"
            >
              {showResolved
                ? `Back to the ${open.length} open`
                : `${resolved.length} sorted`}
            </button>
            {showResolved && (
              <button
                onClick={() =>
                  startTransition(async () => {
                    await clearResolvedErrors();
                    setShowResolved(false);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="rounded-full px-3.5 py-1.5 text-xs font-bold text-ink-800/60 transition-colors hover:text-brand-600 disabled:opacity-60"
              >
                Clear them
              </button>
            )}
          </div>
        )}
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {shown.map((e) => (
          <li
            key={e.id}
            className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink-950">{e.message}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-800/55">
                  {e.route && (
                    <code className="font-mono font-bold text-ink-800/75">
                      {e.route}
                    </code>
                  )}
                  <span>
                    {e.kind === "client"
                      ? "in someone's browser"
                      : e.kind === "action"
                        ? "saving something"
                        : "loading the page"}
                  </span>
                  <span aria-hidden>·</span>
                  {/* The count first: one person hitting a fault and forty
                      people hitting it are different emergencies. */}
                  <span className="font-bold text-ink-800/75">
                    {e.times.toLocaleString()}×
                  </span>
                  <span aria-hidden>·</span>
                  <span>last {formatDateTime(e.last_seen)}</span>
                </p>
              </div>
              <button
                onClick={() => toggle(e.id, !e.resolved)}
                disabled={pending}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                  e.resolved
                    ? "bg-ink-950/5 text-ink-800/70 hover:bg-ink-950 hover:text-cream-50"
                    : "bg-jade-600 text-cream-50 hover:bg-jade-700"
                }`}
              >
                {e.resolved ? "Reopen" : "Sorted"}
              </button>
            </div>

            {e.stack && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-800/50">
                  Details for whoever fixes it
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-ink-950/5 p-3 text-[11px] leading-relaxed text-ink-800/75">
                  {e.stack}
                </pre>
              </details>
            )}
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-5 text-sm text-ink-800/55">
          Nothing in this list.
        </p>
      )}
    </section>
  );
}
