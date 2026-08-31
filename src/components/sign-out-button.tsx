"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Signing out, with a question first.
 *
 * It used to go on the first click, and it sits in a row of ordinary links —
 * one slip on a phone and a customer loses the order they were tracking, or
 * the owner drops out of HQ mid-service and has to find their password with
 * their hands covered in oil. Neither is destructive, but both are a real
 * interruption at exactly the wrong moment, and the cost of asking is one tap.
 *
 * The dialog is deliberately the same on both surfaces. The button that opens
 * it looks different in a dark nav, a cream account page and the HQ rail, but
 * once you're being asked a question, the question should look like itself.
 */
export function SignOutButton({
  scrolled = true,
  variant = "nav",
}: {
  scrolled?: boolean;
  /** How the trigger is styled. The dialog never changes. */
  variant?: "nav" | "rail" | "block";
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // A dialog you can't back out of with Escape is a trap, and this one is
  // opened by accident more often than on purpose.
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !signingOut) setAsking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, signingOut]);

  async function confirm() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  const triggerClass =
    variant === "rail"
      ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-cream-100/70 transition-colors hover:bg-brand-600/20 hover:text-cream-50"
      : variant === "block"
        ? "rounded-full bg-ink-950/5 px-5 py-2.5 text-sm font-bold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-brand-600 hover:text-cream-50"
        : `rounded-full px-3 py-2 transition-colors ${
            scrolled
              ? "text-ink-800 hover:text-brand-600"
              : "text-cream-100/80 hover:text-gold-400"
          }`;

  return (
    <>
      <button onClick={() => setAsking(true)} className={triggerClass}>
        {variant === "rail" && (
          <span aria-hidden className="w-4 shrink-0 text-center text-xs opacity-40">
            ⏻
          </span>
        )}
        Sign out
      </button>

      {asking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
          className="fixed inset-0 z-[60] grid place-items-center p-4"
        >
          <button
            aria-label="Cancel"
            onClick={() => !signingOut && setAsking(false)}
            className="absolute inset-0 bg-ink-950/70"
          />
          <div className="relative w-full max-w-sm rounded-3xl bg-cream-50 p-6 shadow-2xl ring-1 ring-ink-950/10">
            <p
              id="signout-title"
              className="font-display text-2xl font-black text-ink-950"
            >
              Sign out?
            </p>
            <p className="mt-2 text-sm text-ink-800/70">
              You&apos;ll need your email and password to get back in.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setAsking(false)}
                disabled={signingOut}
                className="rounded-full px-5 py-3 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-50"
              >
                Stay signed in
              </button>
              <button
                onClick={confirm}
                disabled={signingOut}
                autoFocus
                className="rounded-full bg-brand-600 px-6 py-3 text-sm font-black text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
              >
                {signingOut ? "Signing out…" : "Yes, sign out"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
