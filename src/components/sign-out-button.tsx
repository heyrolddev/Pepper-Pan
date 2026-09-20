"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/dialog";

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
 *
 * ── Three faults it kept while everything copied from it was fixed ───────
 *
 * This was the first dialog in the app, and `AdminDialog` was modelled on it.
 * The copy then learned to portal out, lock the page and trap focus; the
 * original learned none of it, and it is the one the owner meets most often
 * because it guards the way out of HQ.
 *
 * The worst of the three was invisible until two things were open at once.
 * The trigger lives in HQ's sidebar, the sidebar is `position: sticky`, and
 * sticky makes a stacking context unconditionally — so this dialog's `z-60`
 * was ranked INSIDE the sidebar, and any ordinary panel on the page, all of
 * which are `z-50`, drew straight over it. Measured with one open: the point
 * where "Yes, sign out" is painted belonged to the other panel. Not merely
 * hidden — unclickable.
 *
 * All three now come from `useDialog`, which is also what `AdminDialog` uses,
 * so there is one of them rather than two that drift.
 */
export function SignOutButton({
  solid = true,
  variant = "nav",
}: {
  solid?: boolean;
  /** How the trigger is styled. The dialog never changes. */
  variant?: "nav" | "rail" | "block";
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  /**
   * The Supabase client is fetched here rather than imported at the top, and
   * that one line is worth 64 KB gzipped on every page of the site.
   *
   * This button lives in the nav, the nav lives in the root layout, so a
   * top-level import put the whole `@supabase/supabase-js` browser client into
   * the bundle of every page — the homepage, the menu, the reviews — for
   * visitors who are not signed in and will never press it. It is needed for
   * exactly one click, so it is fetched on exactly that click. The extra
   * round trip lands inside the time the confirm dialog is already open.
   */
  async function confirm() {
    setSigningOut(true);
    const { createClient } = await import("@/lib/supabase/client");
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
            solid
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
        <Ask
          signingOut={signingOut}
          onStay={() => setAsking(false)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function Ask({
  signingOut,
  onStay,
  onConfirm,
}: {
  signingOut: boolean;
  onStay: () => void;
  onConfirm: () => void;
}) {
  const { mounted, panel } = useDialog<HTMLDivElement>({
    onClose: onStay,
    closable: !signingOut,
  });
  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signout-title"
      className="fixed inset-0 z-[70] grid place-items-center p-4"
    >
      <button
        aria-label="Cancel"
        onClick={() => !signingOut && onStay()}
        className="absolute inset-0 bg-ink-950/70"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-3xl bg-cream-50 p-6 shadow-2xl outline-none ring-1 ring-ink-950/10"
      >
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
          {/* No `autoFocus` on the red one any more. By its own reasoning this
              dialog is opened by accident more often than on purpose, and
              parking the cursor on the destructive answer means the stray
              Enter that follows the stray click completes the accident. The
              panel takes focus instead, so Enter does nothing until somebody
              chooses. */}
          <button
            onClick={onStay}
            disabled={signingOut}
            className="rounded-full px-5 py-3 text-sm font-bold text-ink-800/70 transition-colors hover:text-ink-950 disabled:opacity-50"
          >
            Stay signed in
          </button>
          <button
            onClick={onConfirm}
            disabled={signingOut}
            className="rounded-full bg-brand-600 px-6 py-3 text-sm font-black text-cream-50 transition-transform hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
          >
            {signingOut ? "Signing out…" : "Yes, sign out"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
